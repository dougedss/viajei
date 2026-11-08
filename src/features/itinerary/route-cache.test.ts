import { describe, expect, it } from 'vitest';
import { makeStop } from '@/test/factories.ts';
import { missingRoutes, waypointsHash, waypointsHashOf } from './route-cache.ts';

const located = (id: string, day: string, position: string, lat: number, lng: number) =>
  makeStop({ id, trip_day_id: day, position, lat, lng });

describe('as rotas que faltam', () => {
  const d1 = [located('a', 'd1', 'a0', -26.4, -50.1), located('b', 'd1', 'a1', -29.5, -51.4)];
  const d2 = [
    located('c', 'd2', 'a0', -29.3, -50.9),
    makeStop({ trip_day_id: 'd2', position: 'a1' }),
  ];
  const d3 = [located('e', 'd3', 'a0', -29.4, -50.9), located('f', 'd3', 'a1', -29.2, -51.6)];
  const days = [
    { day: { id: 'd1' }, stops: d1 },
    { day: { id: 'd2' }, stops: d2 },
    { day: { id: 'd3' }, stops: d3 },
  ];

  it('o dia sem rota guardada, e o de rota feita para outras coordenadas; nunca o de um ponto só', () => {
    const routes = [
      {
        trip_day_id: 'd1',
        hash: waypointsHashOf(d1.map((s) => ({ lat: s.lat ?? 0, lng: s.lng ?? 0 }))),
      },
      { trip_day_id: 'd3', hash: 'de-antes-de-mudar' },
    ];
    expect(missingRoutes(days, routes).map((m) => m.dayId)).toEqual(['d3']);
    const [d3Missing] = missingRoutes(days, routes);
    expect(d3Missing?.waypoints).toEqual([
      [-50.9, -29.4],
      [-51.6, -29.2],
    ]);
    // a chave muda com as paradas: a mesma rota velha não é pedida de novo, a parada que mudou é
    expect(d3Missing?.key).toBe(`d3:${waypointsHash(d3Missing?.waypoints ?? [])}`);
    expect(missingRoutes(days, []).map((m) => m.dayId)).toEqual(['d1', 'd3']);
  });

  it('o hash olha as coordenadas com 5 casas, na ordem', () => {
    expect(waypointsHash([[-50.123451, -26.1]])).toBe(waypointsHash([[-50.123449, -26.1]]));
    expect(
      waypointsHash([
        [1, 2],
        [3, 4],
      ]),
    ).not.toBe(
      waypointsHash([
        [3, 4],
        [1, 2],
      ]),
    );
  });
});
