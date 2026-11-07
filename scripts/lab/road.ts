import { randomUUID } from 'node:crypto';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { addDays } from './arm.ts';
import { must, ok, syncPush, type Op } from './client.ts';
import type { LabPlan } from './evaluate.ts';
import { ensureTeamMember, kindsOnly, type Session } from './session.ts';

/**
 * As duas viagens das fases 7 e 8 no laboratório, no padrão da D53: ids fixos, filhos novos a cada
 * execução e os antigos com lápide, avisos desligados para os dois (nada dispara entre execuções nem
 * suja as caixas dos outros cenários).
 *  - `listas`: começa em 3 dias, com 2 itens de antes e 1 da mala, para o "Pronto para partir";
 *  - `estrada`: hoje, com a origem já deixada, uma cascata a seguir e um restaurante, orçamento de
 *    R$ 100, um contato, duas reservas (uma com o telefone do contato, outra só dela) e nada gasto.
 */
export const ROAD = {
  listas: {
    name: 'Laboratório · listas',
    before: ['Revisar os pneus do laboratório', 'Imprimir as confirmações do laboratório'],
    pack: 'Mochila do laboratório',
  },
  estrada: {
    name: 'Laboratório · estrada',
    budget: 100,
    origin: 'Saída da estrada',
    nature: 'Cascata do laboratório',
    food: 'Restaurante do laboratório',
    contact: { name: 'Hotel do laboratório', phone: '+5551997527596' },
    pousada: { name: 'Pousada do laboratório', phone: '+5551997527596', code: 'LAB-2026' },
    ingresso: { name: 'Ingresso do laboratório', phone: '+5554999769063' },
  },
} as const;

export type Road = {
  listas: { trip: string; before: [string, string]; pack: string };
  estrada: {
    trip: string;
    stops: { origin: string; nature: string; food: string };
    contact: string;
    pousada: string;
    ingresso: string;
  };
};

const TABLES_TO_CLEAN = ['checklist_items', 'contacts', 'reservations', 'expenses'] as const;

/** Lápide em tudo o que sobrou das execuções anteriores, e os arquivos fora do Storage (D77). */
export async function clean(
  a: Session,
  trips: readonly string[],
  keepDays: readonly string[],
): Promise<void> {
  const removedAt = new Date().toISOString();
  const tomb =
    (table: string) =>
    (row: { id: string }): Op => ({
      table,
      id: row.id,
      op: 'patch',
      values: { deleted_at: removedAt },
    });
  const live = async (table: (typeof TABLES_TO_CLEAN)[number]) =>
    must(
      await a.client.from(table).select('id').in('trip_id', trips).is('deleted_at', null),
      `${table} antigos`,
    );
  const attachments = must(
    await a.client
      .from('attachments')
      .select('id, storage_path')
      .in('trip_id', trips)
      .is('deleted_at', null),
    'anexos antigos',
  );
  const memories = must(
    await a.client
      .from('stop_memories')
      .select('id')
      .in('trip_id', trips)
      .eq('user_id', a.uid)
      .is('deleted_at', null),
    'memórias antigas',
  );
  // anexos antes das paradas e das reservas: o dono do arquivo é o filho
  await syncPush(a.client, attachments.map(tomb('attachments')));
  if (attachments.length > 0) {
    ok(
      await a.client.storage.from('attachments').remove(attachments.map((x) => x.storage_path)),
      'arquivos antigos',
    );
  }
  await syncPush(a.client, memories.map(tomb('stop_memories')));
  for (const table of TABLES_TO_CLEAN)
    await syncPush(a.client, (await live(table)).map(tomb(table)));
  const stops = must(
    await a.client.from('stops').select('id').in('trip_id', trips).is('deleted_at', null),
    'paradas antigas',
  );
  await syncPush(a.client, stops.map(tomb('stops')));
  const days = must(
    await a.client.from('trip_days').select('id').in('trip_id', trips).is('deleted_at', null),
    'dias antigos',
  );
  await syncPush(a.client, days.filter((d) => !keepDays.includes(d.id)).map(tomb('trip_days')));
}

const roadTrips = async (a: Session) => ({
  listas: await uuidV5(a.uid, 'lab:listas'),
  estrada: await uuidV5(a.uid, 'lab:estrada'),
});

/**
 * Antes de qualquer aparelho de A entrar: as viagens do roteiro sem o que a execução anterior
 * deixou. A lista que terminou pronta ontem, já no banco do aparelho, abriria a festa do "Pronto
 * para partir" antes de o preparo de hoje chegar a ele.
 */
export async function resetRoad(a: Session): Promise<void> {
  const { listas, estrada } = await roadTrips(a);
  await clean(a, [listas, estrada], []);
}

export async function prepareRoad(a: Session, b: Session, plan: LabPlan): Promise<Road> {
  const today = plan.today;
  const listasDate = addDays(today, 3);
  const { listas, estrada } = await roadTrips(a);
  const listasDay = await uuidV5(listas, listasDate);
  const estradaDay = await uuidV5(estrada, today);

  await syncPush(a.client, [
    {
      table: 'trips',
      id: listas,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: ROAD.listas.name,
        start_date: listasDate,
        end_date: listasDate,
        budget: null,
        deleted_at: null,
      },
    },
    {
      table: 'trips',
      id: estrada,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: ROAD.estrada.name,
        start_date: today,
        end_date: today,
        budget: ROAD.estrada.budget,
        deleted_at: null,
      },
    },
  ]);
  // avisos desligados antes de qualquer parada existir (sem linha, o padrão é tudo ligado)
  const prefsOff = async (s: Session, trip: string): Promise<Op> => ({
    table: 'notification_prefs',
    id: await uuidV5(s.uid, trip),
    op: 'upsert',
    values: {
      user_id: s.uid,
      trip_id: trip,
      enabled: false,
      lead_minutes: 15,
      morning_time: '07:00',
      kinds: kindsOnly(),
    },
  });
  await syncPush(a.client, [await prefsOff(a, listas), await prefsOff(a, estrada)]);
  await ensureTeamMember(a, b, listas);
  await ensureTeamMember(a, b, estrada);
  await syncPush(b.client, [await prefsOff(b, listas), await prefsOff(b, estrada)]);

  await clean(a, [listas, estrada], [listasDay, estradaDay]);

  const stops = { origin: randomUUID(), nature: randomUUID(), food: randomUUID() };
  const items = { before: [randomUUID(), randomUUID()] as const, pack: randomUUID() };
  const contact = randomUUID();
  const pousada = randomUUID();
  const ingresso = randomUUID();
  const now = new Date().toISOString();
  const stop = (
    id: string,
    position: string,
    kind: string,
    name: string,
    time: string,
    extra: Record<string, unknown> = {},
  ): Op => ({
    table: 'stops',
    id,
    op: 'upsert',
    values: {
      trip_id: estrada,
      trip_day_id: estradaDay,
      position,
      kind,
      name,
      time,
      travel_minutes_to_next: null,
      departed_at: null,
      done_at: null,
      done_by: null,
      skipped: false,
      deleted_at: null,
      ...extra,
    },
  });
  const item = (id: string, kind: string, text: string, position: string): Op => ({
    table: 'checklist_items',
    id,
    op: 'upsert',
    values: {
      trip_id: listas,
      kind,
      text,
      position,
      points: 0,
      stop_id: null,
      source: 'user',
      status: 'active',
      done_by: null,
      done_at: null,
      created_by: a.uid,
      deleted_at: null,
    },
  });
  await syncPush(a.client, [
    {
      table: 'trip_days',
      id: listasDay,
      op: 'upsert',
      values: { trip_id: listas, date: listasDate, title: 'Laboratório', deleted_at: null },
    },
    {
      table: 'trip_days',
      id: estradaDay,
      op: 'upsert',
      values: { trip_id: estrada, date: today, title: 'Laboratório', deleted_at: null },
    },
    // a origem já foi deixada: o "Agora" está a caminho da cascata, com Chegamos!
    stop(stops.origin, 'a0', 'origin', ROAD.estrada.origin, plan.times.morning, {
      travel_minutes_to_next: 30,
      done_at: now,
      done_by: a.uid,
      departed_at: now,
    }),
    stop(stops.nature, 'a1', 'nature', ROAD.estrada.nature, plan.times.closes),
    stop(stops.food, 'a2', 'food', ROAD.estrada.food, plan.times.destination),
    item(items.before[0], 'before', ROAD.listas.before[0], 'a0'),
    item(items.before[1], 'before', ROAD.listas.before[1], 'a1'),
    item(items.pack, 'pack', ROAD.listas.pack, 'a0'),
    {
      table: 'contacts',
      id: contact,
      op: 'upsert',
      values: {
        trip_id: estrada,
        name: ROAD.estrada.contact.name,
        phone: ROAD.estrada.contact.phone,
        type: 'hotel',
        notes: null,
        deleted_at: null,
      },
    },
    {
      table: 'reservations',
      id: pousada,
      op: 'upsert',
      values: {
        trip_id: estrada,
        stop_id: stops.nature,
        type: 'hotel',
        name: ROAD.estrada.pousada.name,
        confirmation_code: ROAD.estrada.pousada.code,
        phone: ROAD.estrada.pousada.phone,
        created_by: a.uid,
        deleted_at: null,
      },
    },
    {
      table: 'reservations',
      id: ingresso,
      op: 'upsert',
      values: {
        trip_id: estrada,
        type: 'ticket',
        name: ROAD.estrada.ingresso.name,
        phone: ROAD.estrada.ingresso.phone,
        created_by: a.uid,
        deleted_at: null,
      },
    },
  ]);
  return {
    listas: {
      trip: listas,
      before: [ROAD.listas.before[0], ROAD.listas.before[1]],
      pack: ROAD.listas.pack,
    },
    estrada: { trip: estrada, stops, contact, pousada, ingresso },
  };
}
