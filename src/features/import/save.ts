import { dayId } from '@/features/itinerary/actions.ts';
import { newTripWrites } from '@/features/trips/actions.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Trip } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { filled } from '@/lib/text/filled.ts';
import { headerProblems, type NewTripHeader } from './new-trip.ts';
import {
  datesNeeded,
  planImport,
  planWrites,
  rangeFor,
  type Existing,
  type ImportPlan,
  type Review,
} from './plan.ts';

/** O que a viagem já tem no aparelho: a revisão marca o repetido, o plano encaixa o novo. */
export async function readExisting(
  trip: Pick<Trip, 'id' | 'start_date' | 'end_date'>,
): Promise<Existing> {
  const [days, stops, reservations, contacts, items] = await Promise.all([
    db.trip_days.where('trip_id').equals(trip.id).toArray(),
    db.stops.where('trip_id').equals(trip.id).toArray(),
    db.reservations.where('trip_id').equals(trip.id).toArray(),
    db.contacts.where('trip_id').equals(trip.id).toArray(),
    db.checklist_items.where('trip_id').equals(trip.id).toArray(),
  ]);
  return { trip, days, stops, reservations, contacts, items };
}

/**
 * Grava a importação revisada: lê o estado de agora (outro aparelho pode ter mexido durante a
 * revisão), monta as linhas pelo `planImport` e grava tudo numa transação da `mutate`, pela outbox.
 * Funciona sem sinal: a viagem sobe quando a rede voltar.
 */
export async function saveImport(
  review: Review,
  trip: Pick<Trip, 'id' | 'start_date' | 'end_date'>,
  uid: string,
  source: 'ai' | 'user',
): Promise<ImportPlan> {
  const existing = await readExisting(trip);
  const dates = datesNeeded(review, trip);
  const ids = await Promise.all(dates.map((date) => dayId(trip.id, date)));
  const dayIds = Object.fromEntries(dates.map((date, i) => [date, ids[i] ?? '']));
  const plan = planImport(review, existing, {
    uid,
    now: new Date().toISOString(),
    dayIds,
    newId: uuidV4,
    source,
  });
  await mutate.batch(planWrites(plan, trip.id));
  return plan;
}

/**
 * A viagem que nasce do campo (fase 17), só agora, ao salvar a revisão: a viagem com o cabeçalho que
 * a revisão decidiu (ampliado para os dias que a pessoa manteve fora dele), o dono, os avisos e o
 * roteiro, numa transação só da `mutate`. Antes disso nada existia no aparelho nem na outbox.
 * Funciona sem sinal (o formato do Viajei): a viagem sobe quando a rede voltar.
 */
export async function saveNewTrip(
  review: Review,
  header: NewTripHeader,
  uid: string,
  source: 'ai' | 'user',
): Promise<{ tripId: string; plan: ImportPlan; range: { start_date: string; end_date: string } }> {
  const problems = headerProblems(header);
  if (problems.length > 0) throw new Error(problems.join(' '));
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const range = rangeFor(header, review);
  const trip = { id: tripId, ...range };
  const existing: Existing = {
    trip,
    days: [],
    stops: [],
    reservations: [],
    contacts: [],
    items: [],
  };
  const dates = datesNeeded(review, trip);
  const ids = await Promise.all(dates.map((date) => dayId(tripId, date)));
  const dayIds = Object.fromEntries(dates.map((date, i) => [date, ids[i] ?? '']));
  const plan = planImport(review, existing, { uid, now, dayIds, newId: uuidV4, source });
  const head = await newTripWrites(
    {
      name: header.name.trim(),
      ...range,
      origin: filled(header.origin),
      budget: header.budget,
      notes: null,
    },
    uid,
    tripId,
    now,
  );
  await mutate.batch([...head, ...planWrites(plan, tripId)]);
  return { tripId, plan, range };
}
