import { describe, expect, it } from 'vitest';
import type { DayRoute, Stop } from '@/lib/db/schema.ts';
import { makeStop } from '@/test/factories.ts';
import {
  currentLeg,
  legFraction,
  legGeometry,
  legNames,
  legsOf,
  legToShow,
  placeName,
  SAME_HOME_M,
  type Leg,
} from './legs.ts';

// um lugar inventado: ~111 m por milésimo de grau na latitude, ~99 m na longitude a -27°
const LAT = -27.2;
const LNG = -50.9;
const east = (km: number) => LNG + km / 99.0;
const at = (km: number) => ({ lat: LAT, lng: east(km) });

let pos = 0;
const stop = (name: string, over: Partial<Stop> = {}): Stop =>
  makeStop({ id: name, name, position: `a${String(pos++).padStart(2, '0')}`, ...over });
const home = (name = 'Saída de casa', km: number | null = 0) =>
  stop(name, { kind: 'origin', ...(km === null ? {} : at(km)) });
const arrival = (name = 'Chegada em casa', km: number | null = 0) =>
  stop(name, { kind: 'origin', ...(km === null ? {} : at(km)) });
const place = (name: string, km: number | null, over: Partial<Stop> = {}) =>
  stop(name, { kind: 'nature', ...(km === null ? {} : at(km)), ...over });
const ids = (legs: readonly Leg[]) => legs.map((l) => l.stops.map((s) => s.id));

describe('legsOf: o dia em trechos', () => {
  it('o objetivo dito no meio do dia: a ida até ele com as paradas, e a volta para casa', () => {
    const day = [
      home(),
      place('Parque em Quitandinha', 40),
      place('Curitiba', 90, { kind: 'city', objective: true }),
      arrival(),
    ];
    const legs = legsOf(day);
    expect(ids(legs)).toEqual([
      ['Saída de casa', 'Parque em Quitandinha', 'Curitiba'],
      ['Curitiba', 'Chegada em casa'],
    ]);
    expect(legs.map((l) => [l.from.id, l.to.id, l.home])).toEqual([
      ['Saída de casa', 'Curitiba', false],
      ['Curitiba', 'Chegada em casa', true],
    ]);
  });

  it('dois objetivos: três trechos, e a volta é o último', () => {
    const day = [
      home(),
      place('Joinville', 60, { kind: 'city', objective: true }),
      place('Café', 70),
      place('Blumenau', 100, { kind: 'city', objective: true }),
      arrival(),
    ];
    const legs = legsOf(day);
    expect(ids(legs)).toEqual([
      ['Saída de casa', 'Joinville'],
      ['Joinville', 'Café', 'Blumenau'],
      ['Blumenau', 'Chegada em casa'],
    ]);
    expect(legs.map((l) => l.home)).toEqual([false, false, true]);
  });

  it('o objetivo marcado vale mais que a regra de reserva, mesmo não sendo o mais longe', () => {
    const day = [home(), place('Perto', 10, { objective: true }), place('Longe', 80), arrival()];
    expect(ids(legsOf(day))).toEqual([
      ['Saída de casa', 'Perto'],
      ['Perto', 'Longe', 'Chegada em casa'],
    ]);
  });

  it('sem objetivo marcado, a ida e volta se divide na parada mais longe de casa', () => {
    const day = [home(), place('Café', 12), place('Mirante', 55), place('Padaria', 30), arrival()];
    expect(ids(legsOf(day))).toEqual([
      ['Saída de casa', 'Café', 'Mirante'],
      ['Mirante', 'Padaria', 'Chegada em casa'],
    ]);
  });

  it('"cachoeira e depois café" é um objetivo só: a cachoeira, e o café fica na volta', () => {
    const day = [home(), place('Cachoeira', 48), place('Café', 20, { kind: 'food' }), arrival()];
    const legs = legsOf(day);
    expect(ids(legs)).toEqual([
      ['Saída de casa', 'Cachoeira'],
      ['Cachoeira', 'Café', 'Chegada em casa'],
    ]);
  });

  it('um dia que não volta é um trecho só', () => {
    const day = [home(), place('Café', 30), place('Montenegro', 200, { kind: 'city' })];
    const legs = legsOf(day);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.to.id).toBe('Montenegro');
    expect(legs[0]?.home).toBe(false);
  });

  it('o último dia de uma viagem longa começa no caminho: termina em casa, mas é um trecho só', () => {
    const day = [place('Hotel', 300, { kind: 'hotel' }), place('Almoço', 150), arrival()];
    const legs = legsOf(day);
    expect(legs).toHaveLength(1);
    expect(legs[0]?.home).toBe(true);
  });

  it('a "chegada" longe da saída não é a mesma casa: um trecho só', () => {
    const day = [home('Saída de Lages', 0), place('Parque', 30), arrival('Chegada em Lages', 15)];
    expect(legsOf(day)).toHaveLength(2);
    const far = [
      home('Saída de Lages', 0),
      place('Parque', 30),
      arrival('Chegada em Mafra', SAME_HOME_M / 1000 + 5),
    ];
    expect(legsOf(far)).toHaveLength(1);
  });

  it('a parada sem coordenada não concorre; sem nenhuma com coordenada, um trecho só', () => {
    const day = [home(), place('Longe sem lugar', null), place('Perto', 15), arrival()];
    expect(ids(legsOf(day))).toEqual([
      ['Saída de casa', 'Longe sem lugar', 'Perto'],
      ['Perto', 'Chegada em casa'],
    ]);
    const blind = [
      home('Saída', null),
      place('A', null),
      place('B', null),
      arrival('Chegada', null),
    ];
    expect(legsOf(blind)).toHaveLength(1);
  });

  it('a parada automática fica no trecho em que cai, e nunca é objetivo', () => {
    const day = [
      home(),
      place('Posto', 20, { kind: 'fuel', source: 'auto', objective: true }),
      place('Parque', 60),
      place('Padaria', 40, { kind: 'food', source: 'auto' }),
      arrival(),
      place('Em casa, parado', 0, { kind: 'other', source: 'auto' }),
    ];
    const legs = legsOf(day);
    expect(ids(legs)).toEqual([
      ['Saída de casa', 'Posto', 'Parque'],
      ['Parque', 'Padaria', 'Chegada em casa', 'Em casa, parado'],
    ]);
    // a chegada é o objetivo do último trecho, mesmo com a automática depois dela
    expect(legs[1]?.to.id).toBe('Chegada em casa');
  });

  it('o dia de uma parada só, ou só a ida e a volta, é um trecho; sem paradas, nenhum', () => {
    expect(legsOf([place('Parque', 10)])).toHaveLength(1);
    expect(legsOf([home(), arrival()])).toHaveLength(1);
    expect(legsOf([])).toEqual([]);
  });

  it('as paradas excluídas não entram', () => {
    const day = [
      home(),
      place('Longe excluída', 90, { deleted_at: '2026-11-22T10:00:00Z' }),
      place('Parque', 30),
      arrival(),
    ];
    expect(ids(legsOf(day))).toEqual([
      ['Saída de casa', 'Parque'],
      ['Parque', 'Chegada em casa'],
    ]);
  });
});

describe('o trecho da vez e o que a maquete mostra', () => {
  const done = '2026-12-05T10:00:00Z';
  const day = (over: { park?: Partial<Stop>; home?: Partial<Stop> } = {}) =>
    legsOf([
      home('Saída de casa', 0),
      place('Parque', 40, over.park),
      arrival('Chegada em casa', 0),
    ]).map((l) => ({
      ...l,
      to: l.to.id === 'Chegada em casa' ? { ...l.to, ...over.home } : l.to,
    }));

  it('o primeiro trecho cujo objetivo não foi feito nem pulado', () => {
    expect(currentLeg(day())).toBe(0);
    expect(currentLeg(day({ park: { done_at: done } }))).toBe(1);
    expect(currentLeg(day({ park: { skipped: true } }))).toBe(1);
    expect(currentLeg(day({ park: { done_at: done }, home: { done_at: done } }))).toBe(1);
    expect(currentLeg([])).toBe(0);
  });

  it('a troca só depois do "Como foi?": a tela segura o trecho até a folha fechar', () => {
    const legs = day({ park: { done_at: done } });
    const current = currentLeg(legs);
    expect(legToShow({ legs, current, hold: 'Parque', peek: null })).toBe(0);
    expect(legToShow({ legs, current, hold: null, peek: null })).toBe(1);
    // o "Como foi?" de outra parada não segura nada
    expect(legToShow({ legs, current, hold: 'Saída de casa', peek: null })).toBe(1);
  });

  it('o Partiu! do objetivo encerra a espera, mesmo com o "Como foi?" sem resposta', () => {
    const legs = day({ park: { done_at: done, departed_at: done } });
    expect(legToShow({ legs, current: currentLeg(legs), hold: 'Parque', peek: null })).toBe(1);
  });

  it('o "Desfazer" da chegada volta ao trecho anterior', () => {
    const legs = day();
    expect(legToShow({ legs, current: currentLeg(legs), hold: 'Parque', peek: null })).toBe(0);
  });

  it('espiar mostra o trecho tocado, e fora do intervalo não vale', () => {
    const legs = day({ park: { done_at: done } });
    const current = currentLeg(legs);
    expect(legToShow({ legs, current, hold: null, peek: 0 })).toBe(0);
    expect(legToShow({ legs, current, hold: 'Parque', peek: 1 })).toBe(1);
    expect(legToShow({ legs, current, hold: null, peek: 7 })).toBe(1);
  });
});

describe('os nomes dos trechos', () => {
  it('uma ida e volta: "ida" e "volta", com o lugar de cada um', () => {
    const names = legNames(
      legsOf([
        home(),
        place('Canoinhas', 30, { objective: true }),
        arrival('Chegada em Major Vieira'),
      ]),
    );
    expect(names).toEqual([
      { short: 'ida', name: 'Ida, até Canoinhas', progress: 'do trecho até Canoinhas' },
      { short: 'volta', name: 'Volta, até Major Vieira', progress: 'da volta' },
    ]);
  });

  it('mais de dois: o número de cada um, e o total no nome', () => {
    const names = legNames(
      legsOf([
        home(),
        place('Joinville', 60, { objective: true }),
        place('Blumenau', 100, { objective: true }),
        arrival(),
      ]),
    );
    expect(names.map((n) => n.short)).toEqual(['1', '2', '3']);
    expect(names[1]?.name).toBe('Trecho 2 de 3, até Blumenau');
    expect(names[2]?.progress).toBe('da volta');
  });

  it('dois trechos sem volta para casa não são "ida e volta"', () => {
    const names = legNames(
      legsOf([home(), place('Joinville', 60, { objective: true }), place('Hotel', 70)]),
    );
    expect(names.map((n) => n.short)).toEqual(['1', '2']);
  });

  it('o nome da casa sem o "Chegada em"', () => {
    expect(placeName({ name: 'Chegada em Papanduva' })).toBe('Papanduva');
    expect(placeName({ name: 'Mirante' })).toBe('Mirante');
  });
});

describe('a rota de cada trecho', () => {
  // a estrada reta para leste: a ida até o parque (40 km) e a volta pela mesma linha
  const day = [home(), place('Parque', 40), arrival()];
  const line = (from: number, to: number, n: number): [number, number][] =>
    Array.from({ length: n + 1 }, (_, i) => [east(from + ((to - from) * i) / n), LAT]);
  const route: Pick<DayRoute, 'hash' | 'geometry' | 'elevation' | 'legs'> = {
    hash: 'h',
    geometry: [...line(0, 40, 20), ...line(40, 0, 20).slice(1)],
    legs: [
      { distance_m: 40_000, duration_s: 1800 },
      { distance_m: 40_000, duration_s: 1800 },
    ],
    elevation: Array.from({ length: 41 }, (_, i): [number, number] => [i * 2000, 800 + i]),
  };

  it('com os trechos batendo, cada trecho tem o traçado, o perfil e os legs dele', () => {
    const legs = legsOf(day);
    const geo = legGeometry(day, route, legs);
    expect(geo).toHaveLength(2);
    const [ida, volta] = geo;
    expect(ida?.route?.legs).toHaveLength(1);
    expect(volta?.route?.legs).toHaveLength(1);
    expect(ida?.route?.hash).toBe('h#0-1');
    expect(volta?.route?.hash).toBe('h#1-2');
    // a ida vai de casa ao parque, a volta do parque para casa (a mesma estrada, uma vez em cada)
    expect(ida?.route?.geometry[0]?.[0]).toBeCloseTo(east(0), 5);
    expect(ida?.route?.geometry.at(-1)?.[0]).toBeCloseTo(east(40), 5);
    expect(volta?.route?.geometry[0]?.[0]).toBeCloseTo(east(40), 5);
    expect(volta?.route?.geometry.at(-1)?.[0]).toBeCloseTo(east(0), 5);
    // o perfil conta do zero no começo de cada trecho, com a altitude cortada junto
    expect(volta?.route?.elevation[0]).toEqual([0, 820]);
    expect(volta?.route?.elevation.at(-1)?.[0]).toBeCloseTo(40_000, 0);
    expect(volta?.route?.elevation.at(-1)?.[1]).toBeCloseTo(840, 5);
    // onde cada trecho fica na rota do dia, na escala do traçado
    expect(ida?.span?.from_m).toBe(0);
    expect(volta?.span?.from_m).toBeCloseTo(ida?.span?.to_m ?? -1, 3);
  });

  it('sem trechos que batam com as paradas, nenhum trecho tem rota (o km virtual)', () => {
    const legs = legsOf(day);
    const stale = { ...route, legs: [{ distance_m: 80_000, duration_s: 3600 }] };
    expect(legGeometry(day, stale, legs)).toEqual([
      { span: null, route: null },
      { span: null, route: null },
    ]);
    expect(legGeometry(day, null, legs).every((g) => g.route === null)).toBe(true);
  });

  it('o trecho com menos de dois pontos de passagem vai sem rota', () => {
    const blind = [home('Saída', null), place('Parque', 40), arrival('Chegada', 0)];
    const legs = legsOf(blind);
    expect(legs).toHaveLength(2);
    const r = { ...route, legs: [route.legs[0]!] };
    const geo = legGeometry(blind, r, legs);
    expect(geo[0]?.route).toBeNull();
    expect(geo[1]?.route?.legs).toHaveLength(1);
  });

  it('num dia de um trecho só, a rota do dia como está', () => {
    const oneWay = [home(), place('Parque', 40)];
    const r = { ...route, legs: [route.legs[0]!] };
    const geo = legGeometry(oneWay, r, legsOf(oneWay));
    expect(geo).toHaveLength(1);
    expect(geo[0]?.route).toBe(r);
  });

  it('a fração do trecho: presa entre 0 e 1, e null sem os metros ou o trecho', () => {
    const span = { from_m: 40_000, to_m: 80_000 };
    expect(legFraction(30_000, span)).toBe(0);
    expect(legFraction(60_000, span)).toBe(0.5);
    expect(legFraction(90_000, span)).toBe(1);
    expect(legFraction(null, span)).toBeNull();
    expect(legFraction(10, null)).toBeNull();
  });
});
