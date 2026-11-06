import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Reservation } from '@/lib/db/schema.ts';
import { useTripMedia, type MediaItem } from '@/lib/media/hooks.ts';

/** As reservas vivas da viagem. `undefined` enquanto carrega. */
export function useTripReservations(tripId: string): Reservation[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.reservations.where('trip_id').equals(tripId).toArray()).filter(
        (r) => r.deleted_at === null,
      ),
    [tripId],
  );
}

export function useReservation(id: string): Reservation | null | undefined {
  return useLiveQuery(async () => {
    const r = await db.reservations.get(id);
    return r?.deleted_at === null ? r : null;
  }, [id]);
}

/** Os anexos de uma reserva (os enviados e os que esperam sinal), na ordem em que entraram. */
export function useReservationMedia(tripId: string, reservationId: string | null): MediaItem[] {
  return useTripMedia(
    tripId,
    (row) => reservationId !== null && row.reservation_id === reservationId,
  );
}

/** Quantos anexos cada reserva tem, para a lista. */
export function countByReservation(items: readonly MediaItem[]): Map<string, MediaItem[]> {
  const out = new Map<string, MediaItem[]>();
  for (const item of items) {
    const id = item.row.reservation_id;
    if (!id) continue;
    const list = out.get(id) ?? [];
    list.push(item);
    out.set(id, list);
  }
  return out;
}
