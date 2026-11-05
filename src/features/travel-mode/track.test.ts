import { describe, expect, it } from 'vitest';
import {
  appendPoint,
  mergeTrack,
  parseTrackPoints,
  shouldFlush,
  simplifyTrack,
  type TrackPoint,
} from './track.ts';

describe('trilha gravada', () => {
  it('amostra: guarda quando andou 50 m ou passaram 30 s', () => {
    let pts = appendPoint([], { lng: -50, lat: -26, t: 0 });
    pts = appendPoint(pts, { lng: -50.0001, lat: -26, t: 10_000 }); // 10 m, 10 s: descarta
    expect(pts).toHaveLength(1);
    pts = appendPoint(pts, { lng: -50.0001, lat: -26, t: 31_000 }); // 31 s: guarda
    expect(pts).toHaveLength(2);
    pts = appendPoint(pts, { lng: -50.001, lat: -26, t: 35_000 }); // ~90 m: guarda
    expect(pts).toHaveLength(3);
    expect(pts[2]).toEqual([-50.001, -26, 35]);
  });

  it('simplifica uma reta com ruído de poucos metros a dois pontos', () => {
    const pts: TrackPoint[] = Array.from({ length: 50 }, (_, i) => [
      -50 + i * 0.001,
      -26 + (i % 2) * 0.00005, // ~5 m de zigue-zague
      i * 30,
    ]);
    const simplified = simplifyTrack(pts);
    expect(simplified).toHaveLength(2);
    expect(simplified[0]?.[2]).toBe(0);
    expect(simplified[1]?.[2]).toBe(49 * 30);
  });

  it('mantém a curva', () => {
    const pts: TrackPoint[] = [
      [-50, -26, 0],
      [-50, -25.99, 30],
      [-49.99, -25.99, 60],
    ];
    expect(simplifyTrack(pts)).toHaveLength(3);
  });

  it('funde o que já estava gravado com o novo, por tempo e sem repetir', () => {
    const existing: TrackPoint[] = [
      [-50, -26, 0],
      [-50, -25.99, 30],
    ];
    const fresh: TrackPoint[] = [
      [-50, -25.99, 30],
      [-49.99, -25.99, 60],
    ];
    expect(mergeTrack(existing, fresh)).toEqual([
      [-50, -26, 0],
      [-50, -25.99, 30],
      [-49.99, -25.99, 60],
    ]);
  });

  it('grava a cada 60 s ou 20 pontos, nunca sem pontos', () => {
    expect(shouldFlush(0, 0, 100_000)).toBe(false);
    expect(shouldFlush(3, 0, 30_000)).toBe(false);
    expect(shouldFlush(3, 0, 60_000)).toBe(true);
    expect(shouldFlush(20, 0, 1000)).toBe(true);
  });

  it('lê points com segurança', () => {
    expect(parseTrackPoints(null)).toEqual([]);
    expect(parseTrackPoints([[1, 2, 3], [1, 2], 'x', [1, 2, 3, 4]])).toEqual([
      [1, 2, 3],
      [1, 2, 3, 4],
    ]);
  });
});
