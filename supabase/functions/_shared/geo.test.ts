import { describe, expect, it } from 'vitest';
import {
  cumulativeM,
  fastDistanceM,
  haversineM,
  lengthM,
  pointAtM,
  projectOntoLine,
  sampleEveryM,
  simplify,
} from './geo.ts';

const PAPANDUVA = [-50.1433, -26.3786];
const FARROUPILHA = [-51.3451, -29.2241];

describe('_shared/geo', () => {
  it('haversine e equirretangular concordam em distâncias curtas', () => {
    const a = [-50.1433, -26.3786];
    const b = [-50.1533, -26.3886];
    const h = haversineM(a, b);
    expect(h).toBeGreaterThan(1400);
    expect(h).toBeLessThan(1600);
    expect(Math.abs(fastDistanceM(a, b) - h)).toBeLessThan(2);
  });

  it('Papanduva a Farroupilha em linha reta tem uns 340 km', () => {
    const d = haversineM(PAPANDUVA, FARROUPILHA);
    expect(d).toBeGreaterThan(330_000);
    expect(d).toBeLessThan(350_000);
  });

  it('cumulativeM e lengthM', () => {
    const line = [
      [0, 0],
      [0, 0.01],
      [0, 0.02],
    ];
    const cum = cumulativeM(line);
    expect(cum[0]).toBe(0);
    expect(cum[2]).toBeCloseTo(lengthM(line), 6);
    expect(lengthM(line)).toBeGreaterThan(2200);
  });

  it('simplify tira o vértice colinear e mantém o que faz curva', () => {
    const line: [number, number][] = [
      [0, 0],
      [0.001, 0.000001],
      [0.002, 0],
      [0.002, 0.002],
    ];
    expect(simplify(line, 20)).toEqual([
      [0, 0],
      [0.002, 0],
      [0.002, 0.002],
    ]);
    expect(simplify(line, 0.01)).toHaveLength(4);
    expect(simplify([[0, 0]], 10)).toEqual([[0, 0]]);
  });

  it('simplify preserva a altitude do vértice mantido', () => {
    const line: [number, number, number][] = [
      [0, 0, 100],
      [0.001, 0.001, 150],
      [0.002, 0.002, 200],
    ];
    expect(simplify(line, 20)).toEqual([
      [0, 0, 100],
      [0.002, 0.002, 200],
    ]);
  });

  it('pointAtM interpola, inclusive a altitude, e prende nas pontas', () => {
    const line = [
      [0, 0, 100],
      [0, 0.01, 200],
    ];
    const cum = cumulativeM(line);
    const mid = pointAtM(line, cum, (cum[1] ?? 0) / 2);
    expect(mid[1]).toBeCloseTo(0.005, 6);
    expect(mid[2]).toBeCloseTo(150, 6);
    expect(pointAtM(line, cum, -5)).toEqual([0, 0, 100]);
    expect(pointAtM(line, cum, 1e9)).toEqual([0, 0.01, 200]);
  });

  it('sampleEveryM devolve o início, cada passo e o fim', () => {
    const line = [
      [0, 0],
      [0, 0.05],
    ];
    const samples = sampleEveryM(line, 2000);
    expect(samples[0]?.dist_m).toBe(0);
    expect(samples.at(-1)?.dist_m).toBeCloseTo(lengthM(line), 6);
    expect(samples.length).toBe(Math.ceil(lengthM(line) / 2000) + 1);
  });

  it('projectOntoLine dá a fração e a distância ao traçado', () => {
    const line = [
      [0, 0],
      [0.1, 0],
      [0.1, 0.1],
    ];
    const cum = cumulativeM(line);
    const p = projectOntoLine(line, cum, [0.05, 0.001]);
    expect(p.index).toBe(0);
    expect(p.fraction).toBeCloseTo(0.25, 2);
    expect(p.distance_m).toBeGreaterThan(100);
    expect(p.distance_m).toBeLessThan(120);
    const end = projectOntoLine(line, cum, [0.1, 0.1]);
    expect(end.fraction).toBeCloseTo(1, 6);
    expect(end.distance_m).toBeCloseTo(0, 3);
  });
});
