import { useLiveQuery } from 'dexie-react-hooks';
import { activeStops } from '@/features/itinerary/rules.ts';
import { readCelebrations, type CelebrationState } from '@/features/progression/celebrations.ts';
import {
  db,
  type ChecklistItem,
  type Contact,
  type Expense,
  type Reservation,
  type Stop,
  type Trip,
  type TripDay,
} from '@/lib/db/schema.ts';
import { membersOf, type MemberWithProfile } from './queries.ts';

export type TripOverview = {
  trip: Trip | null;
  members: MemberWithProfile[];
  days: TripDay[];
  stops: Stop[];
  reservations: Reservation[];
  items: ChecklistItem[];
  contacts: Contact[];
  expenses: Expense[];
  celebrations: CelebrationState;
};

const alive = <T extends { deleted_at: string | null }>(rows: T[]) =>
  rows.filter((r) => r.deleted_at === null);

/**
 * Tudo o que a visão geral mostra, numa leitura só do aparelho (fase 12, D162). Com uma leitura por
 * seção, cada uma chegava num momento e empurrava as de baixo (o cartão do resumo, a prontidão,
 * os atalhos): o Lighthouse media 0,36 de mudança de layout. `undefined` enquanto lê; a tela espera
 * e pinta inteira, e daí em diante a leitura acompanha as mudanças como as outras.
 */
export function useTripOverview(tripId: string): TripOverview | undefined {
  return useLiveQuery(async () => {
    const [trip, members, days, stops, reservations, items, contacts, expenses, celebrations] =
      await Promise.all([
        db.trips.get(tripId),
        membersOf(tripId),
        db.trip_days.where('trip_id').equals(tripId).toArray(),
        db.stops.where('trip_id').equals(tripId).toArray(),
        db.reservations.where('trip_id').equals(tripId).toArray(),
        db.checklist_items.where('trip_id').equals(tripId).toArray(),
        db.contacts.where('trip_id').equals(tripId).toArray(),
        db.expenses.where('trip_id').equals(tripId).toArray(),
        readCelebrations(),
      ]);
    return {
      trip: trip?.deleted_at === null ? trip : null,
      members,
      days: alive(days).sort((a, b) => a.date.localeCompare(b.date)),
      stops: activeStops(stops),
      reservations: alive(reservations),
      items: alive(items),
      contacts: alive(contacts),
      expenses: alive(expenses),
      celebrations,
    };
  }, [tripId]);
}
