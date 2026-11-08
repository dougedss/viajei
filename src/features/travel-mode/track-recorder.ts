import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import type { Fix } from '@/lib/geo/geofence.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import {
  appendPoint,
  mergeTrack,
  parseTrackPoints,
  shouldFlush,
  simplifyTrack,
  toTrackPoint,
  type TrackPoint,
} from './track.ts';

/**
 * Grava a trilha em `trip_tracks` pela `mutate`: `insert` na primeira vez (id v5(trip_day_id,
 * user_id)), `patch` de `points` depois; a outbox funde os patches, e há um só escritor por linha.
 * `share_position` desligado não impede gravar: só impede os outros de ler (D23).
 */
export type TrackContext = { tripId: string; dayId: string; uid: string };

export async function writeTrack(ctx: TrackContext, fresh: readonly TrackPoint[]): Promise<void> {
  if (fresh.length === 0) return;
  const id = await uuidV5(ctx.dayId, ctx.uid);
  const existing = await db.trip_tracks.get(id);
  if (!existing) {
    const now = new Date().toISOString();
    await mutate.insert('trip_tracks', {
      id,
      trip_id: ctx.tripId,
      trip_day_id: ctx.dayId,
      user_id: ctx.uid,
      points: simplifyTrack(fresh),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    return;
  }
  await mutate.patch('trip_tracks', id, {
    points: mergeTrack(parseTrackPoints(existing.points), fresh),
  });
}

/** Um ponto esparso (catch-up): entra direto na trilha do dia. */
export function recordCatchupFix(ctx: TrackContext, fix: Fix): Promise<void> {
  return writeTrack(ctx, [toTrackPoint(fix)]);
}

export type TrackRecorder = {
  push: (fix: Fix) => void;
  flush: () => Promise<void>;
  pending: () => number;
};

/** Acumula leituras do acompanhamento e grava a cada 60 s ou 20 pontos. */
export function createTrackRecorder(
  ctx: TrackContext,
  now: () => number = Date.now,
): TrackRecorder {
  let pending: TrackPoint[] = [];
  let lastFlushAt = now();
  let writing: Promise<void> = Promise.resolve();

  const flush = async () => {
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    lastFlushAt = now();
    writing = writing
      .then(() => writeTrack(ctx, batch))
      .catch((err: unknown) => {
        console.warn('viajei: trilha não gravada', err);
      });
    await writing;
  };

  return {
    push(fix) {
      pending = appendPoint(pending, fix);
      if (shouldFlush(pending.length, lastFlushAt, now())) void flush();
    },
    flush,
    pending: () => pending.length,
  };
}
