import { haversineM, simplify } from '@shared/geo.ts';
import type { Fix } from '@/lib/geo/geofence.ts';

/**
 * A trilha gravada, pura: amostragem (um ponto a cada 50 m ou 30 s), simplificação (Douglas-Peucker
 * 25 m, a mesma da rota real) e a política de gravação (a cada 60 s ou 20 pontos). O formato é o de
 * `trip_tracks.points`: `[lng, lat, epoch_s]`, que a fase 5 e a retrospectiva leem.
 */
export type TrackPoint = [number, number, number];

export const TRACK_MIN_DISTANCE_M = 50;
export const TRACK_MIN_INTERVAL_S = 30;
export const TRACK_TOLERANCE_M = 25;
export const TRACK_FLUSH_MS = 60_000;
export const TRACK_FLUSH_POINTS = 20;

export function toTrackPoint(fix: Fix): TrackPoint {
  return [
    Math.round(fix.lng * 1e6) / 1e6,
    Math.round(fix.lat * 1e6) / 1e6,
    Math.round(fix.t / 1000),
  ];
}

/** Acrescenta a leitura só se andou 50 m ou passaram 30 s desde o último ponto. */
export function appendPoint(points: readonly TrackPoint[], fix: Fix): TrackPoint[] {
  const next = toTrackPoint(fix);
  const last = points.at(-1);
  if (
    last &&
    haversineM(last, next) < TRACK_MIN_DISTANCE_M &&
    next[2] - last[2] < TRACK_MIN_INTERVAL_S
  ) {
    return [...points];
  }
  return [...points, next];
}

/** Douglas-Peucker em 25 m, mantendo o carimbo de cada vértice que fica. */
export function simplifyTrack(points: readonly TrackPoint[]): TrackPoint[] {
  return simplify(points, TRACK_TOLERANCE_M);
}

/** Junta o que já estava gravado com os pontos novos: ordem por tempo, sem repetição, simplificado. */
export function mergeTrack(
  existing: readonly TrackPoint[],
  fresh: readonly TrackPoint[],
): TrackPoint[] {
  const byTime = new Map<number, TrackPoint>();
  for (const p of [...existing, ...fresh]) byTime.set(p[2], p);
  return simplifyTrack([...byTime.values()].sort((a, b) => a[2] - b[2]));
}

export function shouldFlush(pending: number, lastFlushAt: number, now: number): boolean {
  if (pending === 0) return false;
  return pending >= TRACK_FLUSH_POINTS || now - lastFlushAt >= TRACK_FLUSH_MS;
}

/** Lê `trip_tracks.points` (jsonb) com segurança. */
export function parseTrackPoints(value: unknown): TrackPoint[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is TrackPoint =>
      Array.isArray(p) && p.length >= 3 && p.slice(0, 3).every((n) => typeof n === 'number'),
  );
}
