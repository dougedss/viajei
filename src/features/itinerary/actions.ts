import { mutate } from '@/lib/db/mutate.ts';
import { db, type TripDay } from '@/lib/db/schema.ts';
import { removeAllMedia } from '@/lib/media/actions.ts';
import { mergeMedia } from '@/lib/media/hooks.ts';
import { positionAtEnd, positionForMove } from '@/lib/ids/position.ts';
import { uuidV4, uuidV5 } from '@/lib/ids/uuid.ts';
import { stopRemovalPlan } from './removal.ts';
import { blockedMessage, planDays, sortStops, type DaysPlan } from './rules.ts';
import type { StopFormValues } from './schemas.ts';

export class DaysBlockedError extends Error {
  readonly blocked: DaysPlan['blocked'];
  constructor(blocked: DaysPlan['blocked']) {
    super(blockedMessage(blocked));
    this.blocked = blocked;
  }
}

/** O id de um dia é v5(trip_id, 'YYYY-MM-DD'): dois aparelhos sem sinal criam a mesma linha. */
export function dayId(tripId: string, date: string): Promise<string> {
  return uuidV5(tripId, date);
}

async function daysAndStops(tripId: string) {
  const [days, stops, reservations] = await Promise.all([
    db.trip_days.where('trip_id').equals(tripId).toArray(),
    db.stops.where('trip_id').equals(tripId).toArray(),
    db.reservations.where('trip_id').equals(tripId).toArray(),
  ]);
  return { days, stops, reservations };
}

/** Só confere: o que a mudança de datas faria. Para o formulário avisar antes de salvar. */
export async function checkDays(
  tripId: string,
  range: { start_date: string; end_date: string },
): Promise<DaysPlan> {
  const { days, stops, reservations } = await daysAndStops(tripId);
  return planDays(range, days, stops, reservations);
}

/**
 * Alinha os dias da viagem às datas: cria os que faltam (um upsert idempotente por dia), restaura
 * os aposentados que voltaram e aposenta os vazios que saíram. Com parada em dia que sairia,
 * lança `DaysBlockedError` sem tocar em nada.
 */
export async function syncDays(
  tripId: string,
  range: { start_date: string; end_date: string },
): Promise<void> {
  const plan = await checkDays(tripId, range);
  if (plan.blocked.length > 0) throw new DaysBlockedError(plan.blocked);
  const now = new Date().toISOString();
  for (const date of plan.create) {
    await mutate.insert('trip_days', {
      id: await dayId(tripId, date),
      trip_id: tripId,
      date,
      title: null,
      notes: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
  }
  for (const day of plan.restore) await mutate.patch('trip_days', day.id, { deleted_at: null });
  for (const day of plan.retire) await mutate.remove('trip_days', day.id);
}

export async function updateDay(
  dayId: string,
  changes: Partial<Pick<TripDay, 'title' | 'notes'>>,
): Promise<void> {
  await mutate.patch('trip_days', dayId, changes);
}

function stopColumns(values: StopFormValues) {
  return {
    kind: values.kind,
    name: values.name,
    time: values.time,
    closes_at: values.closes_at,
    address: values.address,
    lat: values.lat,
    lng: values.lng,
    travel_minutes_to_next: values.travel_minutes_to_next,
    notes: values.notes,
    url: values.url,
  };
}

/** Parada nova no fim do dia. Devolve o id. */
export async function createStop(
  tripId: string,
  tripDayId: string,
  values: StopFormValues,
): Promise<string> {
  const siblings = sortStops(
    await db.stops
      .where('trip_day_id')
      .equals(tripDayId)
      .filter((s) => s.deleted_at === null)
      .toArray(),
  );
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('stops', {
    id,
    trip_id: tripId,
    trip_day_id: tripDayId,
    position: positionAtEnd(siblings.map((s) => s.position)),
    ...stopColumns(values),
    departed_at: null,
    done_at: null,
    done_by: null,
    skipped: false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function updateStop(stopId: string, values: StopFormValues): Promise<void> {
  await mutate.patch('stops', stopId, stopColumns(values));
}

/**
 * Excluir a parada. A reserva ligada a ela continua (a hospedagem existe mesmo fora do roteiro) e
 * passa para o dia da parada. A memória e as fotos da própria pessoa saem junto; as dos outros só a
 * RLS de cada um tiraria, então ficam no servidor sem parada (o expurgo leva) e somem deste
 * aparelho com a lápide da parada. Listas e gastos seguem `stopRemovalPlan`: a missão de sistema
 * sai, a missão de alguém e o gasto ficam sem o vínculo (o dinheiro foi gasto de verdade).
 */
export async function removeStop(stopId: string, uid: string, isOwner: boolean): Promise<void> {
  const stop = await db.stops.get(stopId);
  if (!stop) return;
  const [reservations, memories, rows, jobs, items, expenses] = await Promise.all([
    db.reservations.where('stop_id').equals(stopId).toArray(),
    db.stop_memories.where('stop_id').equals(stopId).toArray(),
    db.attachments.where('stop_id').equals(stopId).toArray(),
    db.uploads.where('trip_id').equals(stop.trip_id).toArray(),
    db.checklist_items.where('stop_id').equals(stopId).toArray(),
    db.expenses.where('stop_id').equals(stopId).toArray(),
  ]);
  const plan = stopRemovalPlan(stopId, items, expenses);
  for (const id of plan.removeItems) await mutate.remove('checklist_items', id);
  for (const id of plan.unlinkItems) await mutate.patch('checklist_items', id, { stop_id: null });
  for (const id of plan.unlinkExpenses) await mutate.patch('expenses', id, { stop_id: null });
  for (const r of reservations.filter((x) => x.deleted_at === null)) {
    await mutate.patch('reservations', r.id, { stop_id: null, trip_day_id: stop.trip_day_id });
  }
  const mine = mergeMedia(rows, jobs, (row) => row.stop_id === stopId && row.created_by === uid);
  await removeAllMedia(mine, uid, isOwner);
  for (const m of memories.filter((x) => x.user_id === uid && x.deleted_at === null)) {
    await mutate.remove('stop_memories', m.id);
  }
  await mutate.remove('stops', stopId);
}

/** Um arrasto, um patch: só a posição da parada movida muda. */
export async function moveStop(tripDayId: string, from: number, to: number): Promise<void> {
  const siblings = sortStops(
    await db.stops
      .where('trip_day_id')
      .equals(tripDayId)
      .filter((s) => s.deleted_at === null)
      .toArray(),
  );
  const moved = siblings[from];
  const position = positionForMove(
    siblings.map((s) => s.position),
    from,
    to,
  );
  if (!moved || position === null) return;
  await mutate.patch('stops', moved.id, { position });
}

/** Mover para outro dia: vai para o fim do dia de destino. */
export async function moveStopToDay(stopId: string, tripDayId: string): Promise<void> {
  const siblings = sortStops(
    await db.stops
      .where('trip_day_id')
      .equals(tripDayId)
      .filter((s) => s.deleted_at === null)
      .toArray(),
  );
  await mutate.patch('stops', stopId, {
    trip_day_id: tripDayId,
    position: positionAtEnd(siblings.map((s) => s.position)),
  });
}

/** A pessoa confirmou a sugestão de deslocamento vinda da rota real. */
export async function acceptTravelSuggestion(stopId: string, minutes: number): Promise<void> {
  await mutate.patch('stops', stopId, { travel_minutes_to_next: minutes });
}
