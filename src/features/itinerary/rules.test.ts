import { describe, expect, it } from 'vitest';
import { makeDay, makeReservation, makeStop } from '@/test/factories.ts';
import {
  blockedMessage,
  datesBetween,
  dayTotals,
  planDays,
  roundTravelMinutes,
  routeWaypoints,
  sortStops,
  suggestTravel,
} from './rules.ts';

describe('datesBetween', () => {
  it('inclui as duas pontas e atravessa o mês', () => {
    expect(datesBetween('2026-12-11', '2026-12-14')).toEqual([
      '2026-12-11',
      '2026-12-12',
      '2026-12-13',
      '2026-12-14',
    ]);
    expect(datesBetween('2026-11-30', '2026-12-01')).toEqual(['2026-11-30', '2026-12-01']);
    expect(datesBetween('2026-12-11', '2026-12-11')).toEqual(['2026-12-11']);
    expect(datesBetween('2026-12-12', '2026-12-11')).toEqual([]);
  });
});

describe('planDays', () => {
  const d11 = makeDay({ id: 'd11', date: '2026-12-11' });
  const d12 = makeDay({ id: 'd12', date: '2026-12-12' });
  const d13 = makeDay({ id: 'd13', date: '2026-12-13' });

  it('cria o que falta', () => {
    const plan = planDays({ start_date: '2026-12-11', end_date: '2026-12-13' }, [d11], []);
    expect(plan.create).toEqual(['2026-12-12', '2026-12-13']);
    expect(plan.retire).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  it('aposenta dia vazio que saiu do intervalo', () => {
    const plan = planDays(
      { start_date: '2026-12-11', end_date: '2026-12-12' },
      [d11, d12, d13],
      [],
    );
    expect(plan.retire.map((d) => d.id)).toEqual(['d13']);
  });

  it('bloqueia dia com paradas, listando-as em ordem', () => {
    const stops = [
      makeStop({ id: 's2', trip_day_id: 'd13', name: 'Gramado', position: 'a2' }),
      makeStop({ id: 's1', trip_day_id: 'd13', name: 'Caracol', position: 'a1' }),
      makeStop({ id: 's0', trip_day_id: 'd13', name: 'Excluída', position: 'a0', deleted_at: 'x' }),
    ];
    const plan = planDays(
      { start_date: '2026-12-11', end_date: '2026-12-12' },
      [d11, d12, d13],
      stops,
    );
    expect(plan.retire).toEqual([]);
    expect(plan.blocked).toHaveLength(1);
    expect(plan.blocked[0]?.stops.map((s) => s.name)).toEqual(['Caracol', 'Gramado']);
    expect(blockedMessage(plan.blocked)).toBe(
      'Não dá para encurtar: 13/12 tem 2 paradas (Caracol, Gramado). Mova ou exclua essas paradas antes.',
    );
  });

  it('dia vazio de paradas mas com reserva ligada também bloqueia', () => {
    const reservations = [
      makeReservation({ id: 'r1', trip_day_id: 'd13', name: 'Ingresso do Caracol' }),
      makeReservation({ id: 'r2', trip_day_id: 'd13', name: 'Apagada', deleted_at: 'x' }),
    ];
    const plan = planDays(
      { start_date: '2026-12-11', end_date: '2026-12-12' },
      [d11, d12, d13],
      [],
      reservations,
    );
    expect(plan.retire).toEqual([]);
    expect(plan.blocked[0]?.reservations.map((r) => r.name)).toEqual(['Ingresso do Caracol']);
    expect(blockedMessage(plan.blocked)).toBe(
      'Não dá para encurtar: 13/12 tem 1 reserva (Ingresso do Caracol). Mova ou exclua essas paradas e reservas antes.',
    );
  });

  it('restaura dia aposentado que volta para o intervalo, sem criar outro', () => {
    const retired = makeDay({ id: 'd13', date: '2026-12-13', deleted_at: '2026-11-01T00:00:00Z' });
    const plan = planDays(
      { start_date: '2026-12-11', end_date: '2026-12-13' },
      [d11, d12, retired],
      [],
    );
    expect(plan.create).toEqual([]);
    expect(plan.restore.map((d) => d.id)).toEqual(['d13']);
  });

  it('ignora dia já aposentado fora do intervalo', () => {
    const retired = makeDay({ id: 'd13', date: '2026-12-13', deleted_at: '2026-11-01T00:00:00Z' });
    const plan = planDays(
      { start_date: '2026-12-11', end_date: '2026-12-12' },
      [d11, d12, retired],
      [],
    );
    expect(plan.retire).toEqual([]);
    expect(plan.restore).toEqual([]);
  });
});

describe('paradas e rota', () => {
  it('sortStops ordena por position como o collate "C"', () => {
    const stops = [
      makeStop({ position: 'a2' }),
      makeStop({ position: 'Zz' }),
      makeStop({ position: 'a0' }),
    ];
    expect(sortStops(stops).map((s) => s.position)).toEqual(['Zz', 'a0', 'a2']);
  });

  it('routeWaypoints só com coordenada, em [lng, lat]', () => {
    const stops = [
      makeStop({ id: 'a', position: 'a0', lat: -26.4, lng: -50.1 }),
      makeStop({ id: 'b', position: 'a1' }),
      makeStop({ id: 'c', position: 'a2', lat: -29.2, lng: -51.3 }),
    ];
    expect(routeWaypoints(stops).map((w) => w.lngLat)).toEqual([
      [-50.1, -26.4],
      [-51.3, -29.2],
    ]);
  });

  it('roundTravelMinutes arredonda a 5 e nunca dá menos de 5', () => {
    expect(roundTravelMinutes(27559)).toBe(460);
    expect(roundTravelMinutes(1962)).toBe(35);
    expect(roundTravelMinutes(90)).toBe(5);
  });

  it('suggestTravel só para quem não tem valor e cujo próximo é o próximo waypoint', () => {
    const stops = [
      makeStop({ id: 'a', position: 'a0', lat: -26.4, lng: -50.1 }),
      makeStop({ id: 'b', position: 'a1', lat: -27.0, lng: -50.5, travel_minutes_to_next: 60 }),
      makeStop({ id: 'c', position: 'a2' }),
      makeStop({ id: 'd', position: 'a3', lat: -29.2, lng: -51.3 }),
      makeStop({ id: 'e', position: 'a4', lat: -29.5, lng: -51.4 }),
    ];
    const route = {
      legs: [
        { distance_m: 1, duration_s: 3600 },
        { distance_m: 1, duration_s: 7200 },
        { distance_m: 1, duration_s: 1800 },
      ],
    };
    const s = suggestTravel(stops, route);
    expect(s.get('a')).toBe(60);
    expect(s.has('b')).toBe(false);
    expect(s.has('c')).toBe(false);
    expect(s.get('d')).toBe(30);
    expect(suggestTravel(stops, null).size).toBe(0);
  });

  it('dayTotals soma deslocamentos e km da rota', () => {
    const stops = [
      makeStop({ travel_minutes_to_next: 390 }),
      makeStop({ travel_minutes_to_next: 30 }),
    ];
    expect(dayTotals(stops, { legs: [{ distance_m: 430_000, duration_s: 1 }] })).toEqual({
      distance_m: 430_000,
      travel_minutes: 420,
    });
    expect(dayTotals(stops, null).distance_m).toBeNull();
  });
});
