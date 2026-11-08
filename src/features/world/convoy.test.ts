import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import { indexRoute } from '@/lib/geo/project.ts';
import { CONVOY_MAX_AGE_MS, convoy, teamPoints } from './convoy.ts';

// um trecho reto para o norte: 0,01° de latitude ≈ 1,11 km
const ORIGIN: LngLat = [-50.0, -26.0];
const HOTEL: LngLat = [-50.0, -25.82];
const route = indexRoute([ORIGIN, [-50.0, -25.91], HOTEL]);
const NOW = 1_700_000_000_000;
const ahead = (km: number): LngLat => [-50.0, -26.0 + km / 111];

describe('o comboio', () => {
  it('quem está a mais de 500 m de mim aparece na estrada, na última posição que mandou', () => {
    const cars = convoy({
      me: ORIGIN,
      team: [{ user_id: 'ana', point: ahead(2), t: NOW - 60_000 }],
      now: NOW,
      route,
    });
    expect(cars).toHaveLength(1);
    expect(cars[0]?.user_id).toBe('ana');
    expect(cars[0]?.fraction).toBeCloseTo(2 / 20, 2);
    expect(cars[0]?.distance_m).toBeGreaterThan(1900);
    expect(cars[0]?.age_ms).toBe(60_000);
  });

  it('juntos (a 500 m ou menos), nada aparece', () => {
    expect(
      convoy({
        me: ORIGIN,
        team: [{ user_id: 'ana', point: ahead(0.3), t: NOW }],
        now: NOW,
        route,
      }),
    ).toEqual([]);
  });

  it('um ponto com mais de 30 min, do futuro, ou fora da rota não conta', () => {
    const old = { user_id: 'ana', point: ahead(5), t: NOW - CONVOY_MAX_AGE_MS - 1 };
    const future = { user_id: 'bia', point: ahead(5), t: NOW + 5_000 };
    const off = { user_id: 'caio', point: [-50.1, -25.9] as LngLat, t: NOW };
    expect(convoy({ me: ORIGIN, team: [old, future, off], now: NOW, route })).toEqual([]);
  });

  it('sem a minha posição ou sem a rota não se decide: nada', () => {
    const team = [{ user_id: 'ana', point: ahead(5), t: NOW }];
    expect(convoy({ me: null, team, now: NOW, route })).toEqual([]);
    expect(convoy({ me: ORIGIN, team, now: NOW, route: null })).toEqual([]);
  });

  it('vários carros vêm na ordem do caminho', () => {
    const cars = convoy({
      me: ORIGIN,
      team: [
        { user_id: 'bia', point: ahead(8), t: NOW },
        { user_id: 'ana', point: ahead(3), t: NOW },
      ],
      now: NOW,
      route,
    });
    expect(cars.map((c) => c.user_id)).toEqual(['ana', 'bia']);
  });

  it('teamPoints pega o último ponto de cada trilha, em ms, e ignora o que não é ponto', () => {
    const points = teamPoints([
      {
        user_id: 'ana',
        points: [
          [-50, -26, 1_700_000_000],
          [-50, -25.95, 1_700_000_060],
        ],
      },
      { user_id: 'bia', points: [] },
      { user_id: 'caio', points: [[-50, 'x', 1]] },
      { user_id: 'dani', points: 'nada' },
    ]);
    expect(points).toEqual([{ user_id: 'ana', point: [-50, -25.95], t: 1_700_000_060_000 }]);
  });
});
