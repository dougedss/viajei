import { randomUUID } from 'node:crypto';
import { pushPayloadSchema } from '../../supabase/functions/_shared/notifications.ts';
import { fromBase64Url, toBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import {
  anchorOf,
  ARM,
  ARM_KINDS,
  ARM_MAX_LATENCY_MS,
  ARM_USER_AGENT,
  armExpected,
  armLabel,
  deriveArmKeyMaterial,
  deriveArmKeys,
  eventDateOf,
  eventMoment,
  formatMoment,
  nextEventDate,
  type ArmKind,
} from './arm.ts';
import { must, ok, syncPush, type Op } from './client.ts';
import type { LabConfig } from './env.ts';
import { formatMs, type Check } from './evaluate.ts';
import { kindsOnly, log, type Session } from './session.ts';
import { decryptWebPush } from './webpush-decrypt.ts';

/**
 * Os dois avisos conferidos em dois dias (exceção à D53): cada execução primeiro confere o que a
 * anterior armou e então arma o próximo ciclo. Entre uma execução e outra fica viva uma viagem de
 * laboratório por tipo, com só aquele tipo ligado, e uma assinatura (user-agent `viajei-lab/arm`)
 * que o preparo e o fim da execução poupam. Todo o resto continua em repouso.
 */
export type ArmedResult = { checks: Check[]; tripIds: Set<string> };

const TRIP_NAMES: Record<ArmKind, string> = {
  vespera: 'Laboratório · véspera',
  prazo: 'Laboratório · prazo de cancelamento',
};
const RESERVATION_NAME = 'Pousada do prazo';

type Ids = { trip: string; reservation: string };

async function idsOf(a: Session, kind: ArmKind): Promise<Ids> {
  const trip = await uuidV5(a.uid, `lab:${kind}`);
  return { trip, reservation: await uuidV5(trip, 'lab:prazo:reserva') };
}

const endpointOf = (cfg: LabConfig, inbox: string) => `${cfg.receiverBase}/${inbox}`;
const inboxOf = (a: Session, label: string) => uuidV5(a.uid, `lab:arm:${label}`);

/** A data guardada na linha (início da viagem ou último dia para cancelar), ou null se não há. */
async function readAnchor(a: Session, kind: ArmKind, ids: Ids): Promise<string | null> {
  if (kind === 'vespera') {
    const rows = must(
      await a.client.from('trips').select('start_date, deleted_at').eq('id', ids.trip),
      'viagem da véspera',
    );
    const t = rows[0];
    return t?.deleted_at === null ? t.start_date : null;
  }
  const rows = must(
    await a.client
      .from('reservations')
      .select('cancel_until, deleted_at')
      .eq('id', ids.reservation),
    'reserva do prazo',
  );
  const r = rows[0];
  return r?.deleted_at === null ? r.cancel_until : null;
}

async function subscriptionExists(a: Session, cfg: LabConfig, inbox: string): Promise<boolean> {
  const rows = must(
    await a.client
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpointOf(cfg, inbox))
      .is('failed_at', null),
    'assinatura armada',
  );
  return rows.length > 0;
}

/** Confere o aviso de um ciclo que já venceu: um só, com o texto certo, até 2 min depois. */
async function judge(
  a: Session,
  cfg: LabConfig,
  kind: ArmKind,
  ids: Ids,
  anchor: string,
  inbox: string,
): Promise<Check> {
  const eventDate = eventDateOf(anchor);
  const at = eventMoment(kind, eventDate);
  const keys = await deriveArmKeys(cfg.secret, armLabel(kind, eventDate));
  const rows = must(
    await a.client
      .from('lab_inbox')
      .select('received_at, body_b64')
      .eq('inbox', inbox)
      .order('received_at'),
    'caixa da assinatura armada',
  );
  const decoded = await Promise.all(
    rows.map(async (r) => {
      if (!r.body_b64) return null;
      try {
        const text = new TextDecoder().decode(
          await decryptWebPush(fromBase64Url(r.body_b64), keys),
        );
        const parsed = pushPayloadSchema.safeParse(JSON.parse(text));
        return parsed.success ? { at: new Date(r.received_at), payload: parsed.data } : null;
      } catch {
        return null;
      }
    }),
  );
  const mine = decoded.filter(
    (d): d is NonNullable<typeof d> =>
      d !== null &&
      d.payload.notification.data.kind === ARM[kind].notification &&
      d.payload.notification.data.tripId === ids.trip,
  );
  const expected = armExpected(kind, {
    tripId: ids.trip,
    anchor,
    reservationId: ids.reservation,
    reservationName: RESERVATION_NAME,
  });
  const base = {
    scenario: kind,
    data: { agendado: at.toISOString(), recebidos: mine.length, esperado: expected },
  } as const;
  const first = mine[0];
  if (!first) {
    return {
      ...base,
      status: 'fail',
      latency_ms: null,
      detail: `Nada chegou para o aviso de ${formatMoment(at)} (${rows.length} mensagem(ns) na caixa)`,
    };
  }
  const latency = first.at.getTime() - at.getTime();
  const n = first.payload.notification;
  const problems = [
    mine.length > 1 ? `chegou ${mine.length} vezes` : null,
    n.title !== expected.title ? `título "${n.title}"` : null,
    n.body !== expected.body ? `corpo "${n.body}"` : null,
    n.data.navigate !== expected.navigate ? `abre ${n.data.navigate}` : null,
    latency < -60_000 || latency > ARM_MAX_LATENCY_MS ? `atraso de ${formatMs(latency)}` : null,
  ].filter((p): p is string => p !== null);
  return {
    ...base,
    status: problems.length === 0 ? 'pass' : 'fail',
    latency_ms: Math.max(0, latency),
    detail:
      problems.length === 0
        ? `"${n.title}" · "${n.body}", às ${formatMoment(first.at)}`
        : `Aviso de ${formatMoment(at)}: ${problems.join('; ')}`,
  };
}

/** Arma o próximo ciclo: a linha redatada, as preferências com só este tipo e a assinatura derivada. */
async function arm(
  a: Session,
  cfg: LabConfig,
  kind: ArmKind,
  ids: Ids,
  now: Date,
): Promise<{ at: Date }> {
  const eventDate = nextEventDate(kind, now);
  const anchor = anchorOf(eventDate);
  const at = eventMoment(kind, eventDate);
  if (kind === 'vespera') {
    await syncPush(a.client, [
      {
        table: 'trips',
        id: ids.trip,
        op: 'upsert',
        values: {
          owner_id: a.uid,
          name: TRIP_NAMES.vespera,
          start_date: anchor,
          end_date: anchor,
          deleted_at: null,
        },
      },
    ]);
    // a véspera conta o que falta: sempre 2 de antes e 1 da mala, itens novos a cada ciclo
    const old = must(
      await a.client
        .from('checklist_items')
        .select('id')
        .eq('trip_id', ids.trip)
        .is('deleted_at', null),
      'itens antigos da véspera',
    );
    const removedAt = new Date().toISOString();
    const items: [string, string][] = [
      ['before', 'Conferir os documentos do laboratório'],
      ['before', 'Revisar o carro do laboratório'],
      ['pack', 'Mochila do laboratório'],
    ];
    await syncPush(a.client, [
      ...old.map((r): Op => ({
        table: 'checklist_items',
        id: r.id,
        op: 'patch',
        values: { deleted_at: removedAt },
      })),
      ...items.map(([itemKind, text], i): Op => ({
        table: 'checklist_items',
        id: randomUUID(),
        op: 'upsert',
        values: {
          trip_id: ids.trip,
          kind: itemKind,
          text,
          position: `a${i}`,
          points: 0,
          stop_id: null,
          source: 'user',
          status: 'active',
          done_by: null,
          done_at: null,
          created_by: a.uid,
          deleted_at: null,
        },
      })),
    ]);
  } else {
    const start = anchorOf(anchorOf(anchor));
    await syncPush(a.client, [
      {
        table: 'trips',
        id: ids.trip,
        op: 'upsert',
        values: {
          owner_id: a.uid,
          name: TRIP_NAMES.prazo,
          start_date: start,
          end_date: start,
          deleted_at: null,
        },
      },
    ]);
    await syncPush(a.client, [
      {
        table: 'reservations',
        id: ids.reservation,
        op: 'upsert',
        values: {
          trip_id: ids.trip,
          type: 'hotel',
          name: RESERVATION_NAME,
          cancel_until: anchor,
          created_by: a.uid,
          deleted_at: null,
        },
      },
    ]);
  }
  await syncPush(a.client, [
    {
      table: 'notification_prefs',
      id: await uuidV5(a.uid, ids.trip),
      op: 'upsert',
      values: {
        user_id: a.uid,
        trip_id: ids.trip,
        enabled: true,
        lead_minutes: 15,
        morning_time: '07:00',
        kinds: kindsOnly(ARM[kind].notification),
      },
    },
  ]);
  const label = armLabel(kind, eventDate);
  const inbox = await inboxOf(a, label);
  const m = deriveArmKeyMaterial(cfg.secret, label);
  const endpoint = endpointOf(cfg, inbox);
  ok(
    await a.client.from('push_subscriptions').delete().eq('endpoint', endpoint),
    'assinatura armada repetida',
  );
  ok(
    await a.client.from('push_subscriptions').insert({
      user_id: a.uid,
      endpoint,
      p256dh: toBase64Url(m.publicRaw),
      auth: toBase64Url(m.auth),
      platform: 'desktop',
      origin: cfg.appOrigin,
      user_agent: ARM_USER_AGENT,
    }),
    'assinatura armada',
  );
  return { at };
}

async function cycle(a: Session, cfg: LabConfig, kind: ArmKind, now: Date): Promise<Check> {
  const ids = await idsOf(a, kind);
  const anchor = await readAnchor(a, kind, ids);
  const label = anchor ? armLabel(kind, eventDateOf(anchor)) : null;
  const inbox = label ? await inboxOf(a, label) : null;
  const armed = anchor !== null && inbox !== null && (await subscriptionExists(a, cfg, inbox));
  if (!armed || !anchor || !inbox) {
    const { at } = await arm(a, cfg, kind, ids, now);
    return {
      scenario: kind,
      status: 'skip',
      latency_ms: null,
      detail: `Não estava armado: armado agora para ${formatMoment(at)}; a próxima execução confere.`,
      data: { armado: at.toISOString() },
    };
  }
  const at = eventMoment(kind, eventDateOf(anchor));
  if (at.getTime() > now.getTime()) {
    return {
      scenario: kind,
      status: 'skip',
      latency_ms: null,
      detail: `Ainda não venceu (${formatMoment(at)}): fica armado.`,
      data: { armado: at.toISOString() },
    };
  }
  const check = await judge(a, cfg, kind, ids, anchor, inbox);
  // desarma (lê antes de apagar: a caixa é da pessoa, não da assinatura) e arma o próximo ciclo
  ok(
    await a.client.from('push_subscriptions').delete().eq('endpoint', endpointOf(cfg, inbox)),
    'desarmar',
  );
  ok(await a.client.from('lab_inbox').delete().eq('inbox', inbox), 'limpar a caixa armada');
  const next = await arm(a, cfg, kind, ids, now);
  return { ...check, data: { ...check.data, proximo: next.at.toISOString() } };
}

/**
 * Antes do preparo: confere e rearma a véspera e o prazo. Um erro de servidor aqui vira falha do
 * cenário, nunca da execução inteira.
 */
export async function runArmed(cfg: LabConfig, a: Session, now = new Date()): Promise<ArmedResult> {
  const checks: Check[] = [];
  const tripIds = new Set<string>();
  for (const kind of ARM_KINDS) {
    tripIds.add((await idsOf(a, kind)).trip);
    try {
      checks.push(await cycle(a, cfg, kind, now));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`armado ${kind}: ${message}`);
      checks.push({
        scenario: kind,
        status: 'fail',
        latency_ms: null,
        detail: message.slice(0, 900),
        data: {},
      });
    }
  }
  return { checks, tripIds };
}

/** O filtro que poupa as assinaturas armadas ao apagar "todas" as do lab-a (PostgREST `or`). */
export const NOT_ARMED = `user_agent.is.null,user_agent.neq.${ARM_USER_AGENT}`;
