import { describe, expect, it } from 'vitest';
import seedDay1 from './__fixtures__/seed-dia-1.json';
import spUbatuba from './__fixtures__/sp-ubatuba.json';
import { biomeAt } from './biomes.ts';
import { distanceToCoast } from './coast.ts';
import { curiosities } from './curiosities.ts';
import { arrivalAt, hasArrived, hasDeparted } from './geofence.ts';
import { readPlace } from './index.ts';
import { cumulativeM } from '@shared/geo.ts';
import {
  largestMunicipalityWithin,
  municipalitiesWithin,
  nearestMunicipality,
} from './municipalities.ts';
import { municipalities } from './municipalities-data.ts';
import { indexRoute, isOffRoute, projectOntoRoute } from './project.ts';
import {
  classifySegments,
  crossingRadiusM,
  passingPlaces,
  samplePlaces,
  type RouteShape,
} from './segments.ts';

type Fixture = { geometry: number[][]; elevation: number[][] };
const SP = { lng: -46.6339, lat: -23.5505 };
const UBATUBA = { lng: -45.0711, lat: -23.4339 };
const PAPANDUVA = { lng: -50.14241, lat: -26.40854 };
const route = (f: Fixture): RouteShape => ({
  geometry: f.geometry as [number, number][],
  elevation: f.elevation as [number, number][],
});

describe('costa', () => {
  it('Ubatuba está no mar, São Paulo a dezenas de km, Papanduva longe', () => {
    expect(distanceToCoast(UBATUBA.lng, UBATUBA.lat)).toBeLessThan(3_000);
    const sp = distanceToCoast(SP.lng, SP.lat);
    expect(sp).toBeGreaterThan(30_000);
    expect(sp).toBeLessThan(80_000);
    expect(distanceToCoast(PAPANDUVA.lng, PAPANDUVA.lat)).toBeGreaterThan(60_000);
  });
});

describe('municípios', () => {
  it('acha o mais próximo com população', () => {
    const sp = nearestMunicipality(SP.lng, SP.lat);
    expect(sp?.municipality.name).toBe('São Paulo');
    expect(sp?.municipality.uf).toBe('SP');
    expect(sp?.municipality.pop).toBeGreaterThan(10_000_000);
    const pap = nearestMunicipality(PAPANDUVA.lng, PAPANDUVA.lat);
    expect(pap?.municipality.name).toBe('Papanduva');
    expect(pap?.municipality.uf).toBe('SC');
    expect(pap?.distance_m).toBeLessThan(10_000);
  });

  it('o mais populoso num raio', () => {
    expect(largestMunicipalityWithin(SP.lng, SP.lat, 12_000)?.municipality.name).toBe('São Paulo');
    expect(largestMunicipalityWithin(-30, -20, 12_000)).toBeNull();
  });
});

describe('biomas', () => {
  it('um ponto por bioma, e nada fora do Brasil', () => {
    expect(biomeAt(SP.lng, SP.lat)).toBe('mata_atlantica');
    expect(biomeAt(-47.8825, -15.7942)).toBe('cerrado');
    expect(biomeAt(-60.0217, -3.119)).toBe('amazonia');
    expect(biomeAt(-51.2287, -30.0277)).toBe('pampa');
    expect(biomeAt(-40.5008, -9.3891)).toBe('caatinga');
    expect(biomeAt(-57.6533, -19.0078)).toBe('pantanal');
    expect(biomeAt(-58.38, -34.6)).toBeNull();
    expect(biomeAt(-30, -20)).toBeNull();
  });
});

describe('projeção na rota', () => {
  const idx = indexRoute(spUbatuba.geometry as [number, number][]);

  it('início, fim e um ponto do meio', () => {
    expect(projectOntoRoute(idx, [SP.lng, SP.lat]).fraction).toBeLessThan(0.01);
    const end = projectOntoRoute(idx, [UBATUBA.lng, UBATUBA.lat]);
    expect(end.fraction).toBeGreaterThan(0.99);
    const mid = idx.coords[250] as [number, number];
    const p = projectOntoRoute(idx, mid);
    expect(p.distance_m).toBeLessThan(1);
    expect(p.fraction).toBeGreaterThan(0.2);
    expect(p.fraction).toBeLessThan(0.8);
    expect(p.along_m).toBeCloseTo(p.fraction * idx.total_m, 3);
    expect(isOffRoute(p)).toBe(false);
  });

  it('a 5 km do traçado é fora da rota', () => {
    const p = projectOntoRoute(idx, [SP.lng, SP.lat - 0.05]);
    expect(p.distance_m).toBeGreaterThan(4_000);
    expect(isOffRoute(p)).toBe(true);
  });
});

function contiguous(segments: { from_m: number; to_m: number }[], total: number) {
  expect(segments[0]?.from_m).toBe(0);
  expect(segments.at(-1)?.to_m).toBeCloseTo(total, 0);
  for (let i = 1; i < segments.length; i++) {
    expect(segments[i]?.from_m).toBe(segments[i - 1]?.to_m);
  }
}

describe('leitura do lugar', () => {
  it('São Paulo → Ubatuba: sai da cidade grande, cruza a serra e chega à praia', () => {
    const r = route(spUbatuba);
    const segments = classifySegments(r);
    contiguous(segments, r.elevation.at(-1)?.[0] ?? 0);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    expect(segments.length).toBeLessThanOrEqual(6);
    expect(segments[0]?.kind).toBe('city');
    expect(segments.at(-1)?.kind).toBe('beach');
    expect(segments.some((s) => s.kind === 'serra')).toBe(true);
  });

  it('dia 1 do seed: interior e serra, sem praia', () => {
    const r = route(seedDay1);
    const segments = classifySegments(r);
    contiguous(segments, r.elevation.at(-1)?.[0] ?? 0);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    expect(segments.length).toBeLessThanOrEqual(6);
    expect(segments.some((s) => s.kind === 'beach')).toBe(false);
    expect(segments.some((s) => s.kind === 'interior' || s.kind === 'field')).toBe(true);
  });

  it('as amostras trazem município, bioma e inclinação', () => {
    const samples = samplePlaces(route(spUbatuba));
    expect(samples.length).toBe(spUbatuba.elevation.length);
    expect(samples[0]?.town?.name).toBe('São Paulo');
    expect(samples[0]?.biome).toBe('mata_atlantica');
    expect(samples.at(-1)?.coast_m).toBeLessThan(4_000);
    expect(Math.max(...samples.map((s) => Math.abs(s.slope)))).toBeGreaterThan(0.03);
  });

  it('curiosidades: mar perto, descida da serra e ponto mais alto', () => {
    const r = route(spUbatuba);
    const samples = samplePlaces(r);
    const list = curiosities(r.elevation, samples, classifySegments(r));
    const kinds = list.map((c) => c.kind);
    expect(kinds).toContain('sea');
    expect(kinds).toContain('descent');
    expect(kinds).toContain('highest');
    expect(kinds).toContain('scenery');
    expect(list.find((c) => c.kind === 'descent')?.caption).toMatch(/^desce \d{3,} m em \d+ km$/);
    expect(list.find((c) => c.kind === 'highest')?.caption).toMatch(
      /^ponto mais alto do dia: \d{3} m$/,
    );
    for (let i = 1; i < list.length; i++)
      expect(list[i]!.at_m).toBeGreaterThanOrEqual(list[i - 1]!.at_m);
  });

  it('readPlace junta tudo e é determinística', () => {
    const a = readPlace(route(seedDay1));
    const b = readPlace(route(seedDay1));
    expect(a).toEqual(b);
    expect(a.segments.length).toBeGreaterThan(0);
    expect(a.places.length).toBeGreaterThan(0);
  });

  it('as cidades de passagem do seed (fase 28): as que a estrada atravessa, em ordem, uma vez cada', () => {
    const places = passingPlaces(route(seedDay1));
    // medido com o dado embutido: a estrada a até o raio de cada uma (D321). Papanduva, de onde se
    // sai, fica a 2,8 km do centro e não conta; Lages, a 4,0 km, conta (o raio dela é 5,0 km)
    expect(places.map((p) => p.name)).toEqual([
      'Monte Castelo',
      'Santa Cecília',
      'Ponte Alta do Norte',
      'São Cristovão do Sul',
      'Ponte Alta',
      'Correia Pinto',
      'Lages',
      'Vacaria',
      'Caxias do Sul',
      'Farroupilha',
      'São Vendelino',
      'Bom Princípio',
    ]);
    const biggest = [...places].sort((a, b) => b.pop - a.pop)[0];
    expect(biggest?.name).toBe('Caxias do Sul');
    let last = -1;
    for (const p of places) {
      expect(p.at_m).toBeGreaterThan(last);
      expect(p.from_m).toBeLessThanOrEqual(p.at_m);
      expect(p.to_m).toBeGreaterThanOrEqual(p.at_m);
      expect(p.distance_m).toBeLessThanOrEqual(crossingRadiusM(p.pop));
      expect(p.uf).toMatch(/^[A-Z]{2}$/);
      last = p.at_m;
    }
    expect(new Set(places.map((p) => `${p.name}|${p.uf}`)).size).toBe(places.length);
    // a leitura do dia usa a mesma regra
    expect(readPlace(route(seedDay1)).places).toEqual(places);
  });

  it('o raio da cidade atravessada cresce com a raiz da população, de 2 a 10 km', () => {
    expect(crossingRadiusM(0)).toBe(2_000);
    expect(crossingRadiusM(7_540)).toBe(2_000);
    expect(crossingRadiusM(57_169)).toBeCloseTo(2_869, 0);
    expect(crossingRadiusM(173_278)).toBeCloseTo(4_995, 0);
    expect(crossingRadiusM(1_832_183)).toBe(10_000);
  });

  // a rota de 21/11 em miniatura (o print do Douglas): de Papanduva a Canoinhas e de volta, pela mesma
  // estrada, passando a 0,9 km do centro de Major Vieira e a 9 km do de Monte Castelo (a regra da D220
  // punha "Monte Castelo" duas vezes na maquete e nenhuma vez Major Vieira)
  const centro = (name: string) => {
    const m = municipalities().find((x) => x.name === name && x.uf === 'SC');
    if (!m) throw new Error(`sem ${name} no dado embutido`);
    return m;
  };
  const M_LAT = 111_320;
  const mLng = (lat: number) => M_LAT * Math.cos((lat * Math.PI) / 180);
  const idaEVolta = (): RouteShape => {
    const mc = centro('Monte Castelo');
    const mv = centro('Major Vieira');
    const can = centro('Canoinhas');
    const lat9 = mc.lat + 9_000 / M_LAT; // a estrada a 9 km ao norte do centro de Monte Castelo
    const ida: [number, number][] = [
      [mc.lng + 9_000 / mLng(lat9), lat9],
      [mc.lng - 6_000 / mLng(lat9), lat9],
      [mv.lng, mv.lat + 900 / M_LAT], // a 0,9 km do centro de Major Vieira
      [can.lng, can.lat],
    ];
    const geometry = [...ida, ...[...ida].reverse().slice(1)];
    const total = cumulativeM(geometry).at(-1) ?? 0;
    return {
      geometry,
      elevation: [
        [0, 800],
        [total, 800],
      ],
    };
  };

  it('o caso de 21/11: Major Vieira uma vez, Monte Castelo nenhuma', () => {
    const places = passingPlaces(idaEVolta());
    const names = places.map((p) => p.name);
    expect(names.filter((n) => n === 'Major Vieira')).toHaveLength(1);
    expect(names).not.toContain('Monte Castelo');
    const mv = places.find((p) => p.name === 'Major Vieira');
    expect(mv?.distance_m).toBeLessThanOrEqual(900 + 1);
    // Monte Castelo é candidato (a 9 km), mas a estrada não chega ao raio dele
    const mc = centro('Monte Castelo');
    expect(crossingRadiusM(mc.pop)).toBe(2_000);
  });

  it('uma vila a 1,5 km da estrada é atravessada; a 2,5 km, não', () => {
    const mv = centro('Major Vieira');
    const line = (offset_m: number): RouteShape => {
      const lat = mv.lat + offset_m / M_LAT;
      const geometry: [number, number][] = [
        [mv.lng - 8_000 / mLng(lat), lat],
        [mv.lng + 8_000 / mLng(lat), lat],
      ];
      return {
        geometry,
        elevation: [
          [0, 800],
          [16_000, 800],
        ],
      };
    };
    expect(passingPlaces(line(1_500)).map((p) => p.name)).toContain('Major Vieira');
    expect(passingPlaces(line(2_500)).map((p) => p.name)).not.toContain('Major Vieira');
    // e os candidatos vêm do raio maior: a vila a 2,5 km está entre eles
    expect(
      municipalitiesWithin(mv.lng, mv.lat + 2_500 / M_LAT, 3_000).map((m) => m.name),
    ).toContain('Major Vieira');
  });
});

describe('geofence', () => {
  const stop = { lat: -29.28522, lng: -51.41185 };
  const near = (t: number, dLat = 0) => ({ lng: stop.lng, lat: stop.lat + dLat, t });
  const T0 = 1_765_440_000_000;

  it('chegada: dentro de 150 m por 3 min', () => {
    const fixes = [near(T0), near(T0 + 60_000, 0.0005), near(T0 + 120_000), near(T0 + 180_000)];
    expect(arrivalAt(fixes, stop)).toBe(T0 + 180_000);
    expect(hasArrived(fixes.slice(0, 3), stop)).toBe(false);
  });

  it('sair do raio zera a contagem', () => {
    const fixes = [near(T0), near(T0 + 60_000, 0.01), near(T0 + 120_000), near(T0 + 240_000)];
    expect(arrivalAt(fixes, stop)).toBeNull();
    expect(arrivalAt([...fixes, near(T0 + 300_000)], stop)).toBe(T0 + 300_000);
  });

  it('saída: mais de 300 m', () => {
    expect(hasDeparted(near(T0, 0.002), stop)).toBe(false);
    expect(hasDeparted(near(T0, 0.004), stop)).toBe(true);
  });
});
