import { validateImport } from '@shared/import-schema.ts';
import { reservationFromImport } from '@/features/reservations/import.ts';
import { comparePosition } from '@/lib/ids/position.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { createStop, dayId, syncDays, updateDay } from './actions.ts';
import { contactsFromImport, listItemsFromImport } from './import-rows.ts';

/**
 * "Carregar viagem de exemplo": só em desenvolvimento. Lê `supabase/seed/viagem-rs.json` pelo
 * schema de importação e grava dias, paradas, as hospedagens, os contatos, as duas listas e as
 * missões pela `mutate`. As linhas vêm de funções puras (`import-rows.ts`, `reservationFromImport`),
 * que a importação da fase 10 reaproveita. Rodar duas vezes não duplica nada.
 */
export type LoadResult = {
  days: number;
  stops: number;
  reservations: number;
  contacts: number;
  items: number;
};

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
  // contatos, uma vez por telefone
  const known = new Set(
    (await db.contacts.where('trip_id').equals(trip.id).toArray())
      .filter((c) => c.deleted_at === null)
      .map((c) => c.phone),
  );
  let contacts = 0;
  for (const c of contactsFromImport(data.contacts)) {
    if (known.has(c.phone)) continue;
    known.add(c.phone);
    const now = new Date().toISOString();
    await mutate.insert('contacts', {
      id: uuidV4(),
      trip_id: trip.id,
      ...c,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    contacts += 1;
  }

  // antes, mala e missões, uma vez por texto em cada lista, depois do que já existe
  const existing = (await db.checklist_items.where('trip_id').equals(trip.id).toArray()).filter(
    (i) => i.deleted_at === null,
  );
  const lastOf = (kind: string) =>
    existing
      .filter((i) => i.kind === kind)
      .map((i) => i.position)
      .sort(comparePosition)
      .at(-1) ?? null;
  const written = new Set(existing.map((i) => `${i.kind}:${i.text}`));
  const liveStops = await db.stops.where('trip_id').equals(trip.id).toArray();
  let items = 0;
  for (const row of listItemsFromImport(data, liveStops, {
    before: lastOf('before'),
    pack: lastOf('pack'),
    quest: lastOf('quest'),
  })) {
    if (written.has(`${row.kind}:${row.text}`)) continue;
    const now = new Date().toISOString();
    await mutate.insert('checklist_items', {
      id: uuidV4(),
      trip_id: trip.id,
      ...row,
      done_by: null,
      done_at: null,
      created_by: uid,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    items += 1;
  }
  return { days: data.days.length, stops, reservations, contacts, items };
}
