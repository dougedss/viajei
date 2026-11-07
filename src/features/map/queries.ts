import { useLiveQuery } from 'dexie-react-hooks';
import { activeStops } from '@/features/itinerary/rules.ts';
import type { MemberWithProfile } from '@/features/trips/queries.ts';
import { db, type DayRoute, type Stop, type TripTrack } from '@/lib/db/schema.ts';

/** As paradas da viagem; `undefined` enquanto o Dexie lê (a busca das rotas que faltam espera). */
export function useMapStops(tripId: string): Stop[] | undefined {
  return useLiveQuery(
    async () => activeStops(await db.stops.where('trip_id').equals(tripId).toArray()),
    [tripId],
  );
}

/** As rotas reais guardadas neste aparelho para a viagem. */
export function useTripRoutes(tripId: string): DayRoute[] | undefined {
  return useLiveQuery(() => db.routes.filter((r) => r.trip_id === tripId).toArray(), [tripId]);
}

/**
 * As trilhas de hoje que o mapa pode mostrar: a da própria pessoa e as de quem compartilha a posição
 * agora (D23: quem desligou depois some do client também).
 */
export function useMapTracks(
  dayId: string | null,
  uid: string,
  members: readonly MemberWithProfile[],
): TripTrack[] {
  const sharing = members
    .flatMap((m) =>
      m.member.status === 'accepted' && m.member.share_position && m.member.user_id
        ? [m.member.user_id]
        : [],
    )
    .sort()
    .join(',');
  return useLiveQuery(
    async () => {
      if (!dayId) return [];
      const allowed = new Set(sharing === '' ? [] : sharing.split(','));
      return (await db.trip_tracks.where('trip_day_id').equals(dayId).toArray()).filter(
        (t) => t.deleted_at === null && (t.user_id === uid || allowed.has(t.user_id)),
      );
    },
    [dayId, uid, sharing],
    [],
  );
}
