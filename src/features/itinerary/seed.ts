import { validateImport } from '@shared/import-schema.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { createStop, dayId, syncDays, updateDay } from './actions.ts';

/**
 * "Carregar viagem de exemplo": só em desenvolvimento. Lê `supabase/seed/viagem-rs.json` pelo
 * schema de importação e grava dias e paradas pela `mutate`. Reservas, contatos e listas entram
 * quando as fases delas existirem: este carregador é estendido por fase.
 */
export async function loadExampleTrip(trip: Trip): Promise<{ days: number; stops: number }> {
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
  return { days: data.days.length, stops };
}
