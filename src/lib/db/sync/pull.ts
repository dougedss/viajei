import { syncKeys, type ViajeiDb } from '../schema.ts';
import {
  applyTripPull,
  applyUserPull,
  parseTripPull,
  parseUserPull,
  type ApplyStats,
  type MembershipChange,
} from './apply-pull.ts';

export type PullTripRpc = (tripId: string, since: string) => Promise<unknown>;
export type PullUserRpc = (since: string) => Promise<unknown>;

const EPOCH = '1970-01-01T00:00:00.000Z';
/** `synced_at` é atribuído antes do commit; 5 s de sobreposição garantem que nada se perde (o upsert local é idempotente). */
const OVERLAP_MS = 5_000;

export async function sinceFor(db: ViajeiDb, key: string): Promise<string> {
  const cursor = await db.sync_state.get(key);
  if (!cursor) return EPOCH;
  const t = Date.parse(cursor.value);
  return Number.isNaN(t) ? EPOCH : new Date(t - OVERLAP_MS).toISOString();
}

export async function pullTrip(
  db: ViajeiDb,
  tripId: string,
  rpc: PullTripRpc,
): Promise<ApplyStats> {
  const since = await sinceFor(db, syncKeys.tripCursor(tripId));
  const payload = parseTripPull(await rpc(tripId, since));
  return applyTripPull(db, tripId, payload);
}

export async function pullUser(db: ViajeiDb, rpc: PullUserRpc): Promise<MembershipChange> {
  const since = await sinceFor(db, syncKeys.userCursor);
  const payload = parseUserPull(await rpc(since));
  return applyUserPull(db, payload);
}
