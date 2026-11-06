import { validateImport } from '@shared/import-schema.ts';
import { reservationFromImport } from '@/features/reservations/import.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { createStop, dayId, syncDays, updateDay } from './actions.ts';

/**
 * "Carregar viagem de exemplo": só em desenvolvimento. Lê `supabase/seed/viagem-rs.json` pelo
 * schema de importação e grava dias, paradas e as hospedagens pela `mutate`. Contatos e listas
 * entram quando as fases deles existirem: este carregador é estendido por fase.
 */
export type LoadResult = { days: number; stops: number; reservations: number };

export async function loadExampleTrip(trip: Trip, uid: string): Promise<LoadResult> {
  const { default: raw } = await import('../../../supabase/seed/viagem-rs.json');
  const data = validateImport(raw);
  const dates = data.days.map((d) => d.date);
  const first = dates[0] ?? trip.start_date;
  const last = dates.at(-1) ?? trip.end_date;
  if (first < trip.start_date || last > trip.end_date) {
    throw new Error(
      `A viagem de exemplo vai de ${first} a ${last}: ajuste as datas da viagem antes.`,
    );
  }
  await syncDays(trip.id, trip);
  let stops = 0;
  for (const day of data.days) {
    const id = await dayId(trip.id, day.date);
    const existing = await db.stops
      .where('trip_day_id')
      .equals(id)
      .filter((s) => s.deleted_at === null)
      .count();
    if (existing > 0) continue;
    if (day.title) await updateDay(id, { title: day.title });
    for (const stop of day.stops) {
      await createStop(trip.id, id, {
        kind: stop.kind,
        name: stop.name,
        time: stop.time,
        closes_at: stop.closes_at,
        address: stop.address,
        lat: stop.lat,
        lng: stop.lng,
        travel_minutes_to_next: stop.travel_minutes_to_next,
        notes: stop.notes,
        url: stop.url,
      });
      stops += 1;
    }
  }

  // as hospedagens do seed, uma vez por nome
  const [tripStops, tripDays, current] = await Promise.all([
    db.stops.where('trip_id').equals(trip.id).toArray(),
    db.trip_days.where('trip_id').equals(trip.id).toArray(),
    db.reservations.where('trip_id').equals(trip.id).toArray(),
  ]);
  const taken = new Set(current.filter((r) => r.deleted_at === null).map((r) => r.name));
  let reservations = 0;
  for (const r of data.reservations) {
    if (taken.has(r.name)) continue;
    const now = new Date().toISOString();
    await mutate.insert('reservations', {
      id: uuidV4(),
      trip_id: trip.id,
      ...reservationFromImport(r, tripStops, tripDays),
      created_by: uid,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    reservations += 1;
  }
  return { days: data.days.length, stops, reservations };
}
