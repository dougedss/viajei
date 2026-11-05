import { mutate } from '@/lib/db/mutate.ts';
import { db, type Stop, type TripDay } from '@/lib/db/schema.ts';
import { positionAtEnd, positionForMove } from '@/lib/ids/position.ts';
import { uuidV4, uuidV5 } from '@/lib/ids/uuid.ts';
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

async function daysAndStops(tripId: string): Promise<{ days: TripDay[]; stops: Stop[] }> {
  const [days, stops] = await Promise.all([
    db.trip_days.where('trip_id').equals(tripId).toArray(),
    db.stops.where('trip_id').equals(tripId).toArray(),
  ]);
  return { days, stops };
}

/** Só confere: o que a mudança de datas faria. Para o formulário avisar antes de salvar. */
export async function checkDays(
  tripId: string,
  range: { start_date: string; end_date: string },
): Promise<DaysPlan> {
  const { days, stops } = await daysAndStops(tripId);
  return planDays(range, days, stops);
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

export async function removeStop(stopId: string): Promise<void> {
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
