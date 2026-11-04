import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Profile, type Trip, type TripMember } from '@/lib/db/schema.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { sortMembers, sortTrips, todayISO } from './rules.ts';

export const invitesKeys = { pending: ['invites', 'pending'] as const };

/** Convites pendentes do e-mail confirmado (RPC my_pending_invites). Online; some ao aceitar ou recusar. */
export function usePendingInvites() {
  return useQuery({
    queryKey: invitesKeys.pending,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_pending_invites');
      if (error) throw error;
      return data;
    },
  });
}

export type MemberWithProfile = { member: TripMember; profile: Profile | null };

async function membersOf(tripId: string): Promise<MemberWithProfile[]> {
  const members = await db.trip_members
    .where('trip_id')
    .equals(tripId)
    .filter((m) => m.deleted_at === null)
    .toArray();
  const ids = members.map((m) => m.user_id).filter((id): id is string => id !== null);
  const profiles = await db.profiles.bulkGet(ids);
  const byId = new Map(profiles.filter((p): p is Profile => p !== undefined).map((p) => [p.id, p]));
  return sortMembers(members).map((member) => ({
    member,
    profile: member.user_id ? (byId.get(member.user_id) ?? null) : null,
  }));
}

export type TripListItem = { trip: Trip; members: MemberWithProfile[]; pendingOps: number };

/** As viagens deste aparelho (Dexie, ao vivo), com o time e se há alterações por enviar. `undefined` enquanto carrega. */
export function useTrips(): TripListItem[] | undefined {
  return useLiveQuery(async () => {
    const trips = sortTrips(
      await db.trips.filter((t) => t.deleted_at === null).toArray(),
      todayISO(),
    );
    return Promise.all(
      trips.map(async (trip) => ({
        trip,
        members: (await membersOf(trip.id)).filter((m) => m.member.status === 'accepted'),
        pendingOps: await db.outbox.where('trip_id').equals(trip.id).count(),
      })),
    );
  }, []);
}

/** Uma viagem: `undefined` carregando, `null` quando não existe (ou foi excluída) neste aparelho. */
export function useTrip(tripId: string): Trip | null | undefined {
  return useLiveQuery(async () => {
    const trip = await db.trips.get(tripId);
    return trip?.deleted_at === null ? trip : null;
  }, [tripId]);
}

export function useTripMembers(tripId: string): MemberWithProfile[] {
  return useLiveQuery(() => membersOf(tripId), [tripId], []);
}

export function useIsOwner(trip: Pick<Trip, 'owner_id'> | null | undefined): boolean {
  const { session } = useSession();
  return !!trip && !!session && trip.owner_id === session.user.id;
}
