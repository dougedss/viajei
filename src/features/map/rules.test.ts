import { describe, expect, it } from 'vitest';
import { waypointsHashOf } from '@/features/itinerary/route-cache.ts';
import type { DayRoute, Stop } from '@/lib/db/schema.ts';
import { DAY_ID, makeDay, makeStop, makeTrip, TRIP_ID, UID } from '@/test/factories.ts';
import {
  boundsOf,
  initialSelection,
  lastSeen,
  mapDay,
  pinRole,
  routeFits,
  trackLines,
  visiblePoints,
} from './rules.ts';

const DATE = '2026-12-11';
const day = makeDay({ id: DAY_ID, date: DATE });
const done = '2026-12-11T10:00:00.000Z';

function dayStops(): Stop[] {
  return [
    makeStop({
      id: 'a',
      position: 'a0',
      kind: 'origin',
      lat: -26.4,
      lng: -50.1,
      time: '07:00',
      done_at: done,
    }),
    makeStop({ id: 'b', position: 'a1', kind: 'food', name: 'Almoço sem lugar', done_at: done }),
    makeStop({
      id: 'c',
      position: 'a2',
      kind: 'nature',
      lat: -29.3,
      lng: -51.4,
      time: '13:30',
      done_at: done,
    }),
    makeStop({ id: 'd', position: 'a3', kind: 'hotel', lat: -29.5, lng: -51.36, time: '16:30' }),
    makeStop({ id: 'e', position: 'a4', kind: 'other', lat: -29.6, lng: -51.3, skipped: true }),
  ];
}

function routeFor(stops: Stop[]): DayRoute {
  const located = stops.filter(
    (s): s is Stop & { lat: number; lng: number } => s.lat !== null && s.lng !== null,
  );
  return {
    trip_day_id: DAY_ID,
    trip_id: TRIP_ID,
    hash: waypointsHashOf(located),
    provider: 'ors',
    fetched_at: done,
    geometry: [
      [-50.1, -26.4],
      [-50.6, -27.5],
      [-51.4, -29.3],
      [-51.38, -29.4],
      [-51.36, -29.5],
      [-51.3, -29.6],
    ],
    legs: [
      { distance_m: 340_000, duration_s: 20_000 },
      { distance_m: 25_000, duration_s: 2_000 },
      { distance_m: 12_000, duration_s: 900 },
    ],
    elevation: [],
  };
}

describe('o que cada dia desenha', () => {
  it('pinos numerados na ordem da lista (as sem lugar contam), com o estado do dia de hoje', () => {
    const stops = dayStops();
    const d = mapDay({
      day,
      index: 0,
      stops,
      route: routeFor(stops),
      now: new Date(),
      today: DATE,
    });
    expect(d.pins.map((p) => `${String(p.number)} ${p.stop.id} ${p.status}`)).toEqual([
      '1 a done',
      '3 c done',
      '4 d next',
      '5 e skipped',
    ]);
    expect(d.unlocated.map((s) => s.name)).toEqual(['Almoço sem lugar']);
  });

  it('noutro dia não há "próxima": quem não foi concluído é pendente', () => {
    const d = mapDay({
      day,
      index: 0,
      stops: dayStops(),
      route: null,
      now: new Date(),
      today: '2026-12-10',
    });
    expect(d.pins.find((p) => p.stop.id === 'd')?.status).toBe('pending');
  });

  it('a rota real cortada nas paradas, e o trecho entre concluídas é o rodado', () => {
    const stops = dayStops();
    const d = mapDay({
      day,
      index: 0,
      stops,
      route: routeFor(stops),
      now: new Date(),
      today: DATE,
    });
    expect(d.routed).toBe(true);
    expect(
      d.lines.map(
        (l) => `${l.from_id}→${l.to_id} ${l.kind} ${String(l.driven)} ${String(l.points.length)}`,
      ),
    ).toEqual(['a→c route true 3', 'c→d route false 3', 'd→e route false 2']);
  });

  it('sem rota, ou com a rota de outras coordenadas, um traço reto (nunca finge ser a estrada)', () => {
    const stops = dayStops();
    const stale = routeFor(stops);
    const moved = stops.map((s) => (s.id === 'd' ? { ...s, lat: -29.45 } : s));
    for (const d of [
      mapDay({ day, index: 0, stops, route: null, now: new Date(), today: DATE }),
      mapDay({ day, index: 0, stops: moved, route: stale, now: new Date(), today: DATE }),
    ]) {
      expect(d.routed).toBe(false);
      expect(
        d.lines.map((l) => `${l.kind} ${String(l.points.length)} ${String(l.driven)}`),
      ).toEqual(['straight 2 true', 'straight 2 false', 'straight 2 false']);
    }
    expect(routeFits(stale, [])).toBe(false);
  });

  it('o rótulo da folha: a saída diz saída', () => {
    const stops = dayStops();
    const d = mapDay({ day, index: 0, stops, route: null, now: new Date(), today: DATE });
    expect(d.pins.map(pinRole)).toEqual(['saída', '3ª parada', '4ª parada', '5ª parada']);
  });
});

describe('o enquadramento e a trilha', () => {
  it('os limites do que está visível, com a trilha', () => {
    const stops = dayStops();
    const d = mapDay({ day, index: 0, stops, route: null, now: new Date(), today: DATE });
    expect(boundsOf(visiblePoints([d], [[-49.9, -26.2]]))).toEqual({
      south: -29.6,
      west: -51.4,
      north: -26.2,
      east: -49.9,
    });
    expect(boundsOf([])).toBeNull();
  });

  it('o último ponto das trilhas de hoje, e as linhas na ordem do tempo', () => {
    const tracks = [
      {
        user_id: UID,
        points: [
          [-50.1, -26.4, 100],
          [-50.2, -26.5, 300],
        ],
      },
      { user_id: 'outra', points: [[-51, -29, 200]] },
    ];
    expect(lastSeen(tracks)).toEqual({ lng: -50.2, lat: -26.5, at: 300, user_id: UID });
    expect(lastSeen([])).toBeNull();
    expect(
      trackLines([
        {
          user_id: UID,
          points: [
            [-50.2, -26.5, 300],
            [-50.1, -26.4, 100],
          ],
        },
      ]),
    ).toEqual([
      {
        user_id: UID,
        points: [
          [-50.1, -26.4],
          [-50.2, -26.5],
        ],
      },
    ]);
    expect(trackLines([{ user_id: UID, points: [[-50.1, -26.4, 1]] }])).toEqual([]);
  });
});

describe('o que o mapa abre', () => {
  const trip = makeTrip({ start_date: '2026-12-11', end_date: '2026-12-14' });
  const days = ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14'].map((date, i) =>
    makeDay({ id: `d${String(i + 1)}`, date }),
  );

  it('o dia pedido; durante a viagem, hoje; antes, o primeiro; depois, a viagem inteira', () => {
    expect(initialSelection(trip, days, '2026-12-12', 'd3')).toEqual({ kind: 'day', dayId: 'd3' });
    expect(initialSelection(trip, days, '2026-12-12', 'viagem')).toEqual({ kind: 'trip' });
    expect(initialSelection(trip, days, '2026-12-12', 'não-existe')).toEqual({
      kind: 'day',
      dayId: 'd2',
    });
    expect(initialSelection(trip, days, '2026-12-12', null)).toEqual({ kind: 'day', dayId: 'd2' });
    expect(initialSelection(trip, days, '2026-11-20', null)).toEqual({ kind: 'day', dayId: 'd1' });
    expect(initialSelection(trip, days, '2026-12-15', null)).toEqual({ kind: 'trip' });
  });
});
