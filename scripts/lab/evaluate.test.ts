import { describe, expect, it } from 'vitest';
import type { NotificationKind } from '../../supabase/functions/_shared/constants.ts';
import {
  buildPushPayload,
  notificationText,
  type NotificationData,
} from '../../supabase/functions/_shared/notifications.ts';
import {
  evaluate,
  planRun,
  summarize,
  wall,
  type EvalContext,
  type LabPlan,
  type Received,
  type TripKey,
} from './evaluate.ts';

const ORIGIN = 'https://viajei-mauve.vercel.app';
const RECEIVER = 'https://iihwideuknnrpvtczxjs.supabase.co';
const trips: Record<TripKey, string> = {
  departure: 'd0000000-0000-4000-8000-000000000001',
  closes: 'd0000000-0000-4000-8000-000000000002',
  team: 'd0000000-0000-4000-8000-000000000003',
  disabled: 'd0000000-0000-4000-8000-000000000004',
};
const stops: Record<TripKey, string> = {
  departure: 'e0000000-0000-4000-8000-000000000001',
  closes: 'e0000000-0000-4000-8000-000000000002',
  team: 'e0000000-0000-4000-8000-000000000003',
  disabled: 'e0000000-0000-4000-8000-000000000004',
};
const inboxes = {
  main: 'f0000000-0000-4000-8000-000000000001',
  gone: 'f0000000-0000-4000-8000-000000000002',
  actor: 'f0000000-0000-4000-8000-000000000003',
};

// 12:10:30 em São Paulo: o primeiro cron depois do preparo é 12:11
const NOW = new Date('2026-12-11T12:10:30-03:00');
const plan = planRun(NOW) as LabPlan;
const TEAM_DONE = new Date('2026-12-11T12:10:40-03:00');
const sec = (s: number) => new Date(plan.tick.getTime() + s * 1000).toISOString();

/** Uma linha da caixa de entrada como o receptor gravaria, com o payload do servidor. */
function row(
  kind: NotificationKind,
  trip: TripKey,
  data: NotificationData,
  receivedAt: string,
  over: Partial<Received> = {},
): Received {
  const ref = kind === 'morning_briefing' ? 'day' : stops[trip];
  const text = notificationText(kind, data, ref);
  return {
    inbox: inboxes.main,
    gone: false,
    status_code: 201,
    received_at: receivedAt,
    vapid_ok: true,
    vapid_error: null,
    vapid_sub: 'mailto:lab@viajei.invalid',
    vapid_aud: RECEIVER,
    vapid_exp: receivedAt,
    ttl: text.ttlSeconds,
    urgency: 'high',
    topic: text.topic,
    content_encoding: 'aes128gcm',
    size_bytes: 600,
    body_b64: 'x',
    payload: buildPushPayload(
      { kind, ref, trip_id: trips[trip], stop_id: stops[trip], data },
      ORIGIN,
    ),
    decodeError: null,
    ...over,
  };
}

/** O que os fatos do SQL dariam para o plano: o caminho verde. */
function happy(): Received[] {
  const dep = {
    stop_name: 'Saída do laboratório',
    stop_kind: 'origin',
    stop_time: plan.times.departure,
    lead_minutes: 5,
  };
  return [
    row('departure_soon', 'departure', dep, sec(2)),
    row(
      'closes_soon',
      'closes',
      { stop_name: 'Parque do laboratório', closes_time: plan.times.closesAt, is_next: true },
      sec(2),
    ),
    row(
      'morning_briefing',
      'closes',
      {
        date: plan.today,
        day_index: 1,
        day_count: 1,
        stops_count: 1,
        first_time: plan.times.closes,
        first_kind: 'nature',
      },
      sec(3),
    ),
    row(
      'team_arrived',
      'team',
      {
        actor_name: 'Lab B',
        stop_name: 'Vinícola do laboratório',
        stop_kind: 'winery',
        done_time: wall(TEAM_DONE).hhmm,
      },
      sec(3),
    ),
    row('departure_soon', 'departure', dep, sec(2), {
      inbox: inboxes.gone,
      gone: true,
      status_code: 410,
    }),
    row('departure_now', 'departure', dep, sec(122)),
  ];
}

function ctx(received: Received[], over: Partial<EvalContext> = {}): EvalContext {
  return {
    plan,
    trips,
    stops,
    inboxes,
    appOrigin: ORIGIN,
    receiverOrigin: RECEIVER,
    actorName: 'Lab B',
    teamDoneAt: TEAM_DONE,
    readyAt: new Date('2026-12-11T12:10:31-03:00'),
    goneFailed: true,
    received,
    ...over,
  };
}

const status = (checks: ReturnType<typeof evaluate>) =>
  Object.fromEntries(checks.map((c) => [c.scenario, c.status]));

describe('plano do laboratório', () => {
  it('tudo vence no primeiro cron depois do preparo, e o "hora de sair" dois minutos depois', () => {
    expect(wall(plan.tick)).toEqual({ date: '2026-12-11', hhmm: '12:11' });
    expect(plan.times).toEqual({
      departure: '12:13',
      closes: '12:41',
      closesAt: '13:10',
      morning: '12:11',
      team: '12:31',
      disabled: '12:12',
      destination: '12:51',
    });
  });

  it('pula perto da meia-noite', () => {
    expect(planRun(new Date('2026-12-11T23:30:00-03:00'))).toHaveProperty('skip');
  });
});

describe('avaliação', () => {
  it('caminho verde: os dez cenários passam', () => {
    const checks = evaluate(ctx(happy()));
    expect(
      checks.filter((c) => c.status !== 'pass').map((c) => `${c.scenario}: ${c.detail}`),
    ).toEqual([]);
    expect(checks.find((c) => c.scenario === 'entrega')?.latency_ms).toBe(3000);
    expect(summarize(checks)).toEqual({ status: 'pass', summary: '10 cenários verdes' });
  });

  it('faltou o "hora de sair": entrega e saída falham', () => {
    const s = status(
      evaluate(ctx(happy().filter((r) => r.payload?.notification.data.kind !== 'departure_now'))),
    );
    expect(s.entrega).toBe('fail');
    expect(s.saida).toBe('fail');
    expect(s.fechamento).toBe('pass');
  });

  it('o SQL calculou outro horário: o texto denuncia', () => {
    const received = happy();
    received[0] = row(
      'departure_soon',
      'departure',
      {
        stop_name: 'Saída do laboratório',
        stop_kind: 'origin',
        stop_time: '12:14',
        lead_minutes: 5,
      },
      sec(2),
    );
    const saida = evaluate(ctx(received)).find((c) => c.scenario === 'saida');
    expect(saida?.status).toBe('fail');
    expect(saida?.detail).toMatch(/corpo/);
  });

  it('repetido, inesperado, para quem marcou, da viagem desligada', () => {
    const received = happy();
    received.push(received[1]!);
    received.push(
      row(
        'team_arrived',
        'team',
        { actor_name: 'Lab B', stop_name: 'x', done_time: '12:10' },
        sec(3),
        { inbox: inboxes.actor },
      ),
    );
    received.push(
      row(
        'departure_now',
        'disabled',
        { stop_name: 'Saída desligada', stop_kind: 'origin' },
        sec(62),
      ),
    );
    const s = status(evaluate(ctx(received)));
    expect(s.dedupe).toBe('fail');
    expect(s.time).toBe('fail');
    expect(s.desligado).toBe('fail');
  });

  it('assinatura morta: sem failed_at, ou recebendo depois do 410', () => {
    expect(status(evaluate(ctx(happy(), { goneFailed: false }))).assinatura_morta).toBe('fail');
    const received = happy();
    received.push(
      row(
        'departure_now',
        'departure',
        { stop_name: 'Saída do laboratório', stop_kind: 'origin' },
        sec(122),
        { inbox: inboxes.gone, gone: true, status_code: 410 },
      ),
    );
    expect(status(evaluate(ctx(received))).assinatura_morta).toBe('fail');
  });

  it('VAPID recusado e payload que não decifra', () => {
    const received = happy();
    received[1] = {
      ...received[1]!,
      vapid_ok: false,
      vapid_error: 'assinatura ES256 inválida',
    };
    received[2] = { ...received[2]!, payload: null, decodeError: 'AES-GCM recusou' };
    const s = status(evaluate(ctx(received)));
    expect(s.vapid).toBe('fail');
    expect(s.payload).toBe('fail');
    expect(summarize(evaluate(ctx(received))).status).toBe('fail');
  });

  it('o atraso conta do primeiro cron em que os dados existiam, não de um minuto fixo', () => {
    // preparo pronto às 12:09:51: o cron de 12:10 já manda o "sair em" (venceu 12:08) e o fechamento
    const early = { readyAt: new Date('2026-12-11T12:09:51-03:00') };
    const at1210 = (s: number) =>
      new Date(Date.parse('2026-12-11T12:10:00-03:00') + s * 1000).toISOString();
    const received = happy();
    received[0] = { ...received[0]!, received_at: at1210(4) };
    received[1] = { ...received[1]!, received_at: at1210(2) };
    received[3] = { ...received[3]!, received_at: at1210(3) };
    const entrega = evaluate(ctx(received, early)).find((c) => c.scenario === 'entrega');
    expect(entrega?.status).toBe('pass');
    expect(entrega?.data.avisos).toContainEqual({
      kind: 'departure_soon',
      trip: 'departure',
      chegou: true,
      latency_ms: 4000,
    });
  });

  it('atraso acima de 90 s reprova a entrega', () => {
    const received = happy();
    received[1] = { ...received[1]!, received_at: sec(120) };
    const entrega = evaluate(ctx(received)).find((c) => c.scenario === 'entrega');
    expect(entrega?.status).toBe('fail');
    expect(entrega?.detail).toMatch(/atraso de 2 min 00 s/);
  });
});
