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
    route: { geometry: ROUTE },
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
    expect(r.position).toMatchObject({ source: 'last-done', fraction: 0, alongM: 0 });
  });

  it('sem nada (início do dia, sem GPS, sem trilha, sem concluída): posição nula', () => {
    const stops = [origin(), park()];
    const r = catchup({ stops, at: null, next: stops[0]!, route: null, fix: null, teamTracks: [] });
    expect(r).toEqual({ position: null, autoArrive: null, passed: [] });
  });

  it('sem rota: posição sem fração, Chegamos! ainda funciona por raio', () => {
    const r = base({ route: null, fix: { lng: PARK[0], lat: PARK[1], t: 0 } });
    expect(r.position).toMatchObject({
      fraction: null,
      alongM: null,
      offRoute: false,
      source: 'gps',
    });
    expect(r.autoArrive?.id).toBe('p');
  });

  it('latestTeamPoint ignora trilhas vazias ou malformadas', () => {
    expect(latestTeamPoint([{ points: [] }, { points: 'x' }, { points: [[1, 2]] }])).toBeNull();
    expect(latestTeamPoint([{ points: [[1, 2, 3]] }])).toEqual({ point: [1, 2], t: 3 });
  });
});

// A ida e volta pela mesma estrada (o teste de 15/11): casa → café, 10 km ao norte → casa. A saída e
// a chegada têm a mesma coordenada; a rota passa duas vezes por cada ponto.
describe('catchup numa ida e volta (fase 24)', () => {
  const HOME: LngLat = [-50.0, -26.0];
  const CAFE: LngLat = [-50.0, -25.91];
  const GOING: LngLat[] = [HOME, [-50.0, -25.955], CAFE];
  const TRIP = {
    geometry: [...GOING, [-50.0, -25.955], HOME] as LngLat[],
    legs: [{ distance_m: 10_000 }, { distance_m: 10_000 }],
  };
  const saida = () =>
    makeStop({
      id: 's',
      position: 'a0',
      kind: 'origin',
      name: 'Saída de casa',
      lng: HOME[0],
      lat: HOME[1],
    });
  const cafe = () =>
    makeStop({ id: 'c', position: 'a1', kind: 'food', name: 'Café', lng: CAFE[0], lat: CAFE[1] });
  const chegada = () =>
    makeStop({
      id: 'h',
      position: 'a2',
      kind: 'origin',
      name: 'Chegada em casa',
      lng: HOME[0],
      lat: HOME[1],
    });
  const at = (lat: number) => ({ lng: -50.0, lat, t: 0 });

  it('ao sair de casa, ninguém pergunta pela chegada em casa', () => {
    const s = { ...saida(), done_at: 'x', departed_at: 'x' };
    const stops = [s, cafe(), chegada()];
    const r = catchup({
      stops,
      at: s,
      next: stops[1]!,
      route: TRIP,
      fix: at(-25.99),
      teamTracks: [],
      arrivalId: 'h',
    });
    expect(r.passed).toEqual([]);
    expect(r.position?.fraction).toBeCloseTo(0.056, 2);
  });

  it('na volta, a fração segue da última concluída em diante e nunca volta para a ida', () => {
    const s = { ...saida(), done_at: 'x', departed_at: 'x' };
    const c = { ...cafe(), done_at: 'y', departed_at: 'y' };
    const stops = [s, c, chegada()];
    const seen = [-25.92, -25.95, -25.98, -25.995].map(
      (lat) =>
        catchup({
          stops,
          at: c,
          next: stops[2]!,
          route: TRIP,
          fix: at(lat),
          teamTracks: [],
          arrivalId: 'h',
        }).position?.fraction ?? 0,
    );
    // 46% → 28% → 11% → 0% em 15/11; agora 55% → 72% → 89% → 97%
    expect(seen[0]).toBeCloseTo(0.55, 1);
    expect(seen.at(-1)).toBeGreaterThan(0.95);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1] ?? 1);
  });

  it('a chegada em casa nunca é passada, e as passadas param na primeira que o carro não passou', () => {
    const s = { ...saida(), done_at: 'x', departed_at: 'x' };
    const stops = [s, cafe(), chegada()];
    // o carro já esteve depois do café nesta tela (o piso), e está chegando em casa
    const r = catchup({
      stops,
      at: s,
      next: stops[1]!,
      route: TRIP,
      fix: at(-25.995),
      teamTracks: [],
      arrivalId: 'h',
      floor_m: 12_000,
    });
    expect(r.position?.fraction).toBeGreaterThan(0.95);
    expect(r.passed.map((p) => p.id)).toEqual(['c']);
  });

  it('a chegada concluída põe o carro no fim da rota, não no começo', () => {
    const stops = [
      { ...saida(), done_at: 'x', departed_at: 'x' },
      { ...cafe(), done_at: 'y', departed_at: 'y' },
      { ...chegada(), done_at: 'z' },
    ];
    const r = catchup({ stops, at: stops[2]!, next: null, route: TRIP, fix: null, teamTracks: [] });
    expect(r.position?.source).toBe('last-done');
    expect(r.position?.fraction).toBeCloseTo(1, 6);
  });
});
