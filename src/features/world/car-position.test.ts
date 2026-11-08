import { describe, expect, it } from 'vitest';
import type { CatchupPosition } from '@/lib/geo/catchup.ts';
import { makeStop } from '@/test/factories.ts';
import { AT_NODE_EPSILON, placeCar, ROAD_STEP_MIN } from './car-position.ts';
import { buildLayout } from './layout.ts';

const stops = [
  makeStop({ id: 'a', kind: 'origin', name: 'Saída', travel_minutes_to_next: 60 }),
  makeStop({ id: 'b', kind: 'nature', name: 'Parque', travel_minutes_to_next: 60 }),
  makeStop({ id: 'c', kind: 'hotel', name: 'Hotel', travel_minutes_to_next: 30 }),
  makeStop({ id: 'd', kind: 'food', name: 'Jantar' }),
];
const layout = buildLayout({
  dayId: 'd',
  stops,
  route: null,
  place: null,
  viewport: { width: 390, height: 520, hudTop: 36, hudBottom: 64 },
});
const node = (id: string) => layout.nodes.find((n) => n.stop_id === id)!;
const pos = (over: Partial<CatchupPosition> = {}): CatchupPosition => ({
  fraction: 0.5,
  offRoute: false,
  distanceM: 40,
  source: 'gps',
  point: [0, 0],
  ...over,
});
const idle = { at: null, onRoad: false, next: stops[0]!, finished: false };

describe('placeCar: prioridade das fontes', () => {
  it('a posição deste aparelho vence tudo e aparece como gps', () => {
    const p = placeCar({ state: idle, position: pos(), layout });
    expect(p.source).toBe('gps');
    expect(p.s).toBeCloseTo(layout.fractionToS(0.5), 6);
    expect(p.offRoute).toBeNull();
  });

  it('GPS é gps; trilha do time é team-track', () => {
    expect(placeCar({ state: idle, position: pos(), layout }).source).toBe('gps');
    const team = placeCar({
      state: idle,
      position: pos({ source: 'team-track', fraction: 0.2 }),
      layout,
    });
    expect(team.source).toBe('team-track');
    expect(team.s).toBeCloseTo(layout.fractionToS(0.2), 6);
  });

  it('a posição "última concluída" do catch-up é só o nó, não uma posição', () => {
    const state = { at: stops[1]!, onRoad: false, next: stops[2]!, finished: false };
    const p = placeCar({
      state,
      position: pos({ source: 'last-done', fraction: 0.33 }),
      layout,
    });
    expect(p.source).toBe('node');
    expect(p.s).toBe(node('b').s);
    expect(p.atNodeId).toBe('b');
  });

  it('posição sem fração (sem rota) cai na regra do nó', () => {
    const p = placeCar({ state: idle, position: pos({ fraction: null }), layout });
    expect(p.source).toBe('node');
    expect(p.s).toBe(node('a').s);
  });

  it('num nó, a posição diz em que nó está', () => {
    const f = node('b').s / layout.pathLength;
    const exact = layout.fractionToS(0.5);
    // a fração que cai exatamente no nó b
    const fB = (() => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (layout.fractionToS(mid) < node('b').s) lo = mid;
        else hi = mid;
      }
      return hi;
    })();
    expect(f).toBeGreaterThan(0);
    expect(exact).toBeGreaterThan(0);
    const p = placeCar({ state: idle, position: pos({ fraction: fB }), layout });
    expect(Math.abs(p.s - node('b').s)).toBeLessThan(AT_NODE_EPSILON);
    expect(p.atNodeId).toBe('b');
  });
});

describe('placeCar: sem posição', () => {
  it('no início do dia o carro está no primeiro nó', () => {
    const p = placeCar({ state: idle, position: null, layout });
    expect(p).toEqual({ s: node('a').s, offRoute: null, source: 'node', atNodeId: 'a' });
  });

  it('parado na última concluída, fica no nó dela', () => {
    const state = { at: stops[1]!, onRoad: false, next: stops[2]!, finished: false };
    const p = placeCar({ state, position: null, layout });
    expect(p.s).toBe(node('b').s);
    expect(p.atNodeId).toBe('b');
  });

  it('na estrada sem posição, aparece logo depois do nó de saída, nunca no meio do trecho', () => {
    const state = { at: stops[1]!, onRoad: true, next: stops[2]!, finished: false };
    const p = placeCar({ state, position: null, layout });
    expect(p.s).toBeGreaterThan(node('b').s);
    expect(p.s - node('b').s).toBeGreaterThanOrEqual(ROAD_STEP_MIN);
    expect(p.s).toBeLessThan((node('b').s + node('c').s) / 2);
    expect(p.atNodeId).toBeNull();
    expect(p.source).toBe('node');
  });

  it('dia concluído: no último nó', () => {
    const state = { at: stops[3]!, onRoad: false, next: null, finished: true };
    const p = placeCar({ state, position: null, layout });
    expect(p.s).toBe(node('d').s);
    expect(p.atNodeId).toBe('d');
  });

  it('última concluída que não está no layout cai no primeiro nó', () => {
    const state = { at: makeStop({ id: 'zzz' }), onRoad: true, next: stops[2]!, finished: false };
    const p = placeCar({ state, position: null, layout });
    expect(p.s).toBe(node('a').s);
  });
});

describe('placeCar: fora da rota', () => {
  it('mantém o s projetado, carrega a distância e não está em nó nenhum', () => {
    const p = placeCar({
      state: idle,
      position: pos({ offRoute: true, distanceM: 3049.6, fraction: 0.4 }),
      layout,
    });
    expect(p.offRoute).toEqual({ distance_m: 3050 });
    expect(p.s).toBeCloseTo(layout.fractionToS(0.4), 6);
    expect(p.atNodeId).toBeNull();
  });
});
