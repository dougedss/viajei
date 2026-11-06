import type { ImportReservation } from '@shared/import-schema.ts';
import { validateImport } from '@shared/import-schema.ts';
import { toE164 } from '@shared/phone.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Reservation, type Stop, type Trip, type TripDay } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { localStampToISO } from '@/lib/time/index.ts';
import { createStop, dayId, syncDays, updateDay } from './actions.ts';

/**
 * "Carregar viagem de exemplo": só em desenvolvimento. Lê `supabase/seed/viagem-rs.json` pelo
 * schema de importação e grava dias, paradas e as hospedagens pela `mutate`. Contatos e listas
 * entram quando as fases deles existirem: este carregador é estendido por fase.
 */
export type LoadResult = { days: number; stops: number; reservations: number };

export type SeedReservationRow = Omit<
  Reservation,
  'id' | 'trip_id' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at' | 'synced_at'
>;

/**
 * Uma reserva do schema de importação como colunas: `stop_ref` é o nome de uma parada da viagem e
 * vence (a parada já diz o dia); sem ela, `day_ref` é a data de um dia; os horários vêm em hora de
 * parede de São Paulo, sem fuso; o telefone vai para E.164 quando dá (senão fica de fora).
 */
export function seedReservation(
  r: ImportReservation,
  stops: readonly Pick<Stop, 'id' | 'name' | 'deleted_at'>[],
  days: readonly Pick<TripDay, 'id' | 'date' | 'deleted_at'>[],
): SeedReservationRow {
  const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const stop = r.stop_ref
    ? stops.find((s) => s.deleted_at === null && norm(s.name) === norm(r.stop_ref ?? ''))
    : undefined;
  const day =
    !stop && r.day_ref
      ? days.find((d) => d.deleted_at === null && d.date === r.day_ref)
      : undefined;
  const phone = r.phone ? toE164(r.phone) : null;
  return {
    type: r.type,
    name: r.name.slice(0, 120),
    stop_id: stop?.id ?? null,
    trip_day_id: day?.id ?? null,
    start_at: r.start_at ? localStampToISO(r.start_at) : null,
    end_at: r.end_at ? localStampToISO(r.end_at) : null,
    confirmation_code: r.confirmation_code,
    amount: r.amount,
    cancel_policy: r.cancel_policy,
    cancel_until: r.cancel_until,
    phone: phone?.ok ? phone.e164 : null,
    address: r.address,
    booked_via: r.booked_via,
    notes: r.notes,
  };
}

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
      ...seedReservation(r, tripStops, tripDays),
      created_by: uid,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    reservations += 1;
  }
  return { days: data.days.length, stops, reservations };
}
