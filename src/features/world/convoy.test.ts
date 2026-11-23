import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import { indexRoute } from '@/lib/geo/project.ts';
import { makeProfile, OTHER_UID, UID } from '@/test/factories.ts';
import { CONVOY_MAX_AGE_MS, convoy, convoyCarFor, teamPoints } from './convoy.ts';

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

describe('o comboio no trecho da vez (fase 28)', () => {
  // uma ida e volta pela mesma reta: 20 km para o norte e de volta
  const roundTrip = indexRoute([ORIGIN, HOTEL, ORIGIN]);
  const half = roundTrip.total_m / 2;

  it('na volta, o carro do time se projeta dali em diante e anda na fração do trecho', () => {
    const cars = convoy({
      me: ahead(18),
      // a 5 km de casa, voltando: sem o piso, a projeção cairia na ida (25%)
      team: [{ user_id: 'ana', point: ahead(5), t: NOW - 60_000 }],
      now: NOW,
      route: roundTrip,
      span: { from_m: half, to_m: roundTrip.total_m },
    });
    expect(cars).toHaveLength(1);
    expect(cars[0]?.fraction).toBeCloseTo(15 / 20, 2);
  });

  it('quem já passou do fim do trecho não aparece nele', () => {
    const cars = convoy({
      me: ORIGIN,
      team: [{ user_id: 'ana', point: ahead(15), t: NOW - 60_000 }],
      now: NOW,
      route: roundTrip,
      span: { from_m: 0, to_m: roundTrip.total_m / 4 },
    });
    expect(cars).toEqual([]);
  });
});

describe('o carro de cada pessoa no comboio (fase 16)', () => {
  it('cada um com o carro do perfil dele, sem placa; quem não tem perfil aqui, o padrão', () => {
    const carFor = convoyCarFor(
      new Map([
        [UID, makeProfile({ car_model: 'kombi', car_color: 'leaf', car_finish: 'pearl' })],
        [
          OTHER_UID,
          makeProfile({
            id: OTHER_UID,
            car_model: 'pickup',
            car_color: 'night',
            car_wheels: 'steel',
            car_accessories: ['rack', 'bike'],
          }),
        ],
      ]),
    );
    expect(carFor(UID)).toMatchObject({ model: 'kombi', color: 'leaf', finish: 'pearl' });
    expect(carFor(OTHER_UID)).toEqual({
      model: 'pickup',
      color: 'night',
      finish: 'solid',
      wheels: 'steel',
      accessories: ['rack', 'bike'],
      plate: null,
    });
    expect(carFor('quem-nao-veio')).toMatchObject({ model: 'hatch', color: 'sunset' });
  });
});
