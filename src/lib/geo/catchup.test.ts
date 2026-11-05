import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import { makeStop } from '@/test/factories.ts';
import { catchup, latestTeamPoint } from './catchup.ts';

// Um trecho reto para o norte: 10 km entre a origem e a parada, mais 10 km até o hotel.
// 0.01° de latitude ≈ 1,11 km.
const ORIGIN: LngLat = [-50.0, -26.0];
const PARK: LngLat = [-50.0, -25.91];
const HOTEL: LngLat = [-50.0, -25.82];
const ROUTE: LngLat[] = [ORIGIN, [-50.0, -25.955], PARK, [-50.0, -25.865], HOTEL];

const origin = () =>
  makeStop({
    id: 'o',
    position: 'a0',
    kind: 'origin',
    name: 'Saída',
    lng: ORIGIN[0],
    lat: ORIGIN[1],
  });
const park = () =>
  makeStop({ id: 'p', position: 'a1', kind: 'nature', name: 'Parque', lng: PARK[0], lat: PARK[1] });
const hotel = () =>
  makeStop({ id: 'h', position: 'a2', kind: 'hotel', name: 'Hotel', lng: HOTEL[0], lat: HOTEL[1] });

const base = (over: Partial<Parameters<typeof catchup>[0]> = {}) => {
  const o = { ...origin(), done_at: 'x', departed_at: 'x' };
  const stops = [o, park(), hotel()];
  return catchup({
    stops,
    at: o,
    next: stops[1]!,
    route: ROUTE,
    fix: null,
    teamTracks: [],
    ...over,
  });
};

describe('catchup', () => {
  it('no raio da próxima: Chegamos! automático, nada passado', () => {
    const r = base({ fix: { lng: PARK[0] + 0.0005, lat: PARK[1], t: 0 } }); // ~50 m
    expect(r.autoArrive?.id).toBe('p');
    expect(r.passed).toEqual([]);
    expect(r.position?.source).toBe('gps');
    expect(r.position?.fraction).toBeCloseTo(0.5, 1);
  });

  it('entre duas paradas: posição pela projeção na rota, dentro de 2 km', () => {
    const r = base({ fix: { lng: -50.003, lat: -25.955, t: 0 } }); // 300 m a oeste do meio do 1º trecho
    expect(r.autoArrive).toBeNull();
    expect(r.position).toMatchObject({ source: 'gps', offRoute: false });
    expect(r.position?.fraction).toBeCloseTo(0.25, 1);
    expect(r.position?.distanceM).toBeGreaterThan(200);
    expect(r.position?.distanceM).toBeLessThan(400);
  });

  it('a mais de 2 km da rota: fora da rota com a distância, sem perguntas', () => {
    const r = base({ fix: { lng: -50.03, lat: -25.955, t: 0 } }); // ~3 km a oeste
    expect(r.position?.offRoute).toBe(true);
    expect(r.position?.distanceM).toBeGreaterThan(2500);
    expect(r.passed).toEqual([]);
  });

  it('passou por paradas sem marcar: pergunta, nunca marca', () => {
    // já perto do hotel (a 1 km), com o parque ainda pendente: o parque ficou para trás
    const r = base({ fix: { lng: HOTEL[0], lat: HOTEL[1] - 0.009, t: 0 } });
    expect(r.passed.map((s) => s.id)).toEqual(['p']);
    expect(r.autoArrive).toBeNull();
  });

  it('a próxima a menos de 500 m para trás ainda não conta como passada', () => {
    const r = base({ fix: { lng: PARK[0], lat: PARK[1] + 0.003, t: 0 } }); // 330 m adiante do parque
    expect(r.passed).toEqual([]);
  });

  it('sem posição: usa o último ponto da trilha mais recente do time', () => {
    const r = base({
      teamTracks: [
        {
          user_id: 'ana',
          points: [
            [-50.0, -26.0, 100],
            [-50.0, -25.955, 200],
          ],
        },
        { user_id: 'bruno', points: [[-50.0, -26.0, 50]] },
      ],
    });
    expect(r.position).toMatchObject({ source: 'team-track' });
    expect(r.position?.fraction).toBeCloseTo(0.25, 1);
    expect(r.autoArrive).toBeNull();
    expect(r.passed).toEqual([]);
  });

  it('sem posição e sem trilha: a última concluída', () => {
    const r = base();
    expect(r.position).toMatchObject({ source: 'last-done', fraction: 0 });
  });

  it('sem nada (início do dia, sem GPS, sem trilha, sem concluída): posição nula', () => {
    const stops = [origin(), park()];
    const r = catchup({ stops, at: null, next: stops[0]!, route: null, fix: null, teamTracks: [] });
    expect(r).toEqual({ position: null, autoArrive: null, passed: [] });
  });

  it('sem rota: posição sem fração, Chegamos! ainda funciona por raio', () => {
    const r = base({ route: null, fix: { lng: PARK[0], lat: PARK[1], t: 0 } });
    expect(r.position).toMatchObject({ fraction: null, offRoute: false, source: 'gps' });
    expect(r.autoArrive?.id).toBe('p');
  });

  it('latestTeamPoint ignora trilhas vazias ou malformadas', () => {
    expect(latestTeamPoint([{ points: [] }, { points: 'x' }, { points: [[1, 2]] }])).toBeNull();
    expect(latestTeamPoint([{ points: [[1, 2, 3]] }])).toEqual({ point: [1, 2], t: 3 });
  });
});
