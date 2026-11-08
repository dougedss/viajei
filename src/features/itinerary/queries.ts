import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DayRoute, type Stop, type TripDay } from '@/lib/db/schema.ts';
import { activeStops } from './rules.ts';

/** Os dias da viagem, em ordem de data, sem os aposentados. `undefined` enquanto carrega. */
export function useTripDays(tripId: string): TripDay[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.trip_days.where('trip_id').equals(tripId).toArray())
        .filter((d) => d.deleted_at === null)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [tripId],
  );
}

export function useTripDay(dayId: string): TripDay | null | undefined {
  return useLiveQuery(async () => {
    const day = await db.trip_days.get(dayId);
    return day?.deleted_at === null ? day : null;
  }, [dayId]);
}

/** Paradas de um dia, em ordem, sem as excluídas; `undefined` enquanto lê. */
export function useDayStops(dayId: string): Stop[] | undefined {
  return useLiveQuery(
    async () => activeStops(await db.stops.where('trip_day_id').equals(dayId).toArray()),
    [dayId],
  );
}

/** Todas as paradas da viagem (para contagens por dia). */
export function useTripStops(tripId: string): Stop[] {
  return useLiveQuery(
    async () => activeStops(await db.stops.where('trip_id').equals(tripId).toArray()),
    [tripId],
    [],
  );
}

/** A rota real em cache deste aparelho, se existe. */
export function useCachedRoute(dayId: string): DayRoute | null | undefined {
  return useLiveQuery(async () => (await db.routes.get(dayId)) ?? null, [dayId]);
}
