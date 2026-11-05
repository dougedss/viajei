import { useLiveQuery } from 'dexie-react-hooks';
import type { MemberWithProfile } from '@/features/trips/queries.ts';
import { db, type TripTrack } from '@/lib/db/schema.ts';
import { askKeys } from '@/features/notifications/ask.ts';

/**
 * As trilhas do dia que este aparelho pode usar como posição do time: dos outros membros, e só de
 * quem compartilha posição agora (D23: quem desligou depois some do client também).
 */
export function useTeamTracks(
  dayId: string,
  uid: string,
  members: readonly MemberWithProfile[],
): TripTrack[] {
  const sharing = new Set(
    members.flatMap((m) =>
      m.member.status === 'accepted' && m.member.share_position && m.member.user_id
        ? [m.member.user_id]
        : [],
    ),
  );
  const key = [...sharing].sort().join(',');
  return useLiveQuery(
    async () =>
      (await db.trip_tracks.where('trip_day_id').equals(dayId).toArray()).filter(
        (t) => t.deleted_at === null && t.user_id !== uid && sharing.has(t.user_id),
      ),
    [dayId, uid, key],
    [],
  );
}

export type GeoConsent = {
  /** já permitiu usar a posição neste aparelho */
  allowed: boolean;
  /** disse "agora não" nas últimas 24 h */
  declined: boolean;
  loaded: boolean;
};

const DECLINE_MS = 24 * 60 * 60 * 1000;

/** A resposta à pergunta de posição, por aparelho (sync_state). */
export function useGeoConsent(): GeoConsent {
  return useLiveQuery(
    async () => {
      const asked = await db.sync_state.get(askKeys.geoAsked);
      const declined = await db.sync_state.get(askKeys.geoDeclinedAt);
      return {
        allowed: asked?.value === 'granted',
        declined: declined !== undefined && Date.now() - Number(declined.value) < DECLINE_MS,
        loaded: true,
      };
    },
    [],
    { allowed: false, declined: false, loaded: false },
  );
}

export async function grantGeo(): Promise<void> {
  await db.sync_state.put({ key: askKeys.geoAsked, value: 'granted' });
}

export async function declineGeo(): Promise<void> {
  await db.sync_state.put({ key: askKeys.geoDeclinedAt, value: String(Date.now()) });
}
