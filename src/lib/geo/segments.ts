import { cumulativeM, pointAtM, projectOntoLine, sampleEveryM, type LngLat } from '@shared/geo.ts';
import { biomeAt } from './biomes.ts';
import type { BiomeCode } from './codec.ts';
import { distanceToCoast } from './coast.ts';
import {
  largestMunicipalityWithin,
  municipalitiesWithin,
  nearestMunicipality,
} from './municipalities.ts';

/**
 * Leitura do lugar: cada amostra de 2 km da rota é classificada cruzando altitude e inclinação,
 * distância até o mar, população do município mais próximo e bioma. O resultado são cerca de
 * quatro partes por dia (cidade grande, interior, plantação, praia; a serra pela inclinação),
 * com transições suaves. A escala é "partes do dia", não metro a metro. A fase 5 desenha.
 */
export type SceneryKind = 'city' | 'interior' | 'field' | 'serra' | 'beach';

export const SCENERY_LABELS: Record<SceneryKind, string> = {
  city: 'cidade grande',
  interior: 'interior',
  field: 'plantação',
  serra: 'serra',
  beach: 'praia',
};

export type PlaceSample = {
  dist_m: number;
  lng: number;
  lat: number;
  alt_m: number;
  /** inclinação média em volta da amostra (m/m, sinal = subindo) */
  slope: number;
  /** desnível entre o maior e o menor ponto num raio de 3 amostras */
  relief_m: number;
  coast_m: number;
  /** município mais próximo e a distância ao centro dele */
  town: { name: string; uf: string; pop: number; distance_m: number } | null;
  /** o município mais populoso num raio de 12 km, quando existe */
  city: { name: string; uf: string; pop: number; distance_m: number } | null;
  biome: BiomeCode | null;
};

export type RouteShape = {
  geometry: readonly LngLat[];
  /** [dist_m, alt_m] */
  elevation: readonly (readonly [number, number])[];
};

export const CITY_RADIUS_M = 12_000;
export const BIG_CITY_POP = 100_000;
export const TOWN_CENTER_POP = 20_000;
export const TOWN_CENTER_M = 3_000;
/** A costa embutida (Natural Earth 1:10m) tem erro de 1 a 2 km; a estrada litorânea passa a 2 a 5 km dela. */
export const BEACH_COAST_M = 4_000;
export const SERRA_SLOPE = 0.03;
export const SERRA_RELIEF_M = 150;
export const FLAT_RELIEF_M = 60;
export const FLAT_SLOPE = 0.015;

/** Uma amostra por ponto do perfil de altitude, com tudo que a classificação precisa. */
export function samplePlaces(route: RouteShape): PlaceSample[] {
  const cum = cumulativeM(route.geometry);
  const elev = route.elevation;
  return elev.map(([dist_m, alt_m], i) => {
    const [lng = 0, lat = 0] = pointAtM(route.geometry, cum, dist_m);
    const prev = elev[Math.max(0, i - 1)] ?? [dist_m, alt_m];
    const next = elev[Math.min(elev.length - 1, i + 1)] ?? [dist_m, alt_m];
    const span = next[0] - prev[0];
    const slope = span > 0 ? (next[1] - prev[1]) / span : 0;
    let lo = alt_m;
    let hi = alt_m;
    for (let k = Math.max(0, i - 3); k <= Math.min(elev.length - 1, i + 3); k++) {
      const a = elev[k]?.[1] ?? alt_m;
      if (a < lo) lo = a;
      if (a > hi) hi = a;
    }
    const near = nearestMunicipality(lng, lat);
    const big = largestMunicipalityWithin(lng, lat, CITY_RADIUS_M);
    return {
      dist_m,
      lng,
      lat,
      alt_m,
      slope,
      relief_m: hi - lo,
      coast_m: distanceToCoast(lng, lat),
      town: near ? { ...pick(near.municipality), distance_m: near.distance_m } : null,
      city: big ? { ...pick(big.municipality), distance_m: big.distance_m } : null,
      biome: biomeAt(lng, lat),
    };
  });
}

function pick(m: { name: string; uf: string; pop: number }) {
  return { name: m.name, uf: m.uf, pop: m.pop };
}

/**
 * A classe de uma amostra, por prioridade: cidade grande, praia, centro de cidade média, serra,
 * plantação, interior. A praia vence o centro de uma cidade média (Ubatuba é praia), mas não
 * uma metrópole (o Rio é cidade grande).
 */
export function classifySample(s: PlaceSample): SceneryKind {
  if (s.city && s.city.pop >= BIG_CITY_POP) return 'city';
  if (s.coast_m <= BEACH_COAST_M) return 'beach';
  if (s.town && s.town.pop >= TOWN_CENTER_POP && s.town.distance_m <= TOWN_CENTER_M) return 'city';
  if (Math.abs(s.slope) >= SERRA_SLOPE || s.relief_m >= SERRA_RELIEF_M) return 'serra';
  const openBiome = s.biome === 'cerrado' || s.biome === 'pampa' || s.biome === 'caatinga';
  const flat = s.relief_m <= FLAT_RELIEF_M && Math.abs(s.slope) <= FLAT_SLOPE;
  if (openBiome || flat) return 'field';
  return 'interior';
}

export type Segment = {
  kind: SceneryKind;
  from_m: number;
  to_m: number;
  /** cidade grande: a população do município que a fez, para a maquete dosar as quadras */
  pop?: number;
};

/**
 * Uma cidade de passagem (fase 22; revista na fase 28): **um município que a estrada atravessa**. Os
 * dados embutidos dos municípios são o centro e a população, sem o polígono, então "atravessa" se diz
 * assim: a rota passa a até `crossingRadiusM(pop)` do centro dele. `at_m` é o ponto da rota mais perto
 * do centro; `from_m` e `to_m`, o pedaço da rota dentro desse raio (a corda do círculo). Uma vez por
 * município: a ida e a volta pela mesma cidade não a repetem. A maquete escreve o nome das maiores na
 * beira da estrada; quem decide quais (e exclui as das paradas) é o layout.
 */
export type PassingPlace = {
  name: string;
  uf: string;
  pop: number;
  from_m: number;
  to_m: number;
  /** o ponto da rota mais perto do centro do município */
  at_m: number;
  /** a que distância do centro a rota passa, em metros */
  distance_m: number;
};

/** O menor e o maior raio de uma cidade atravessada: a vila e a capital. */
export const CROSSING_MIN_M = 2_000;
export const CROSSING_MAX_M = 10_000;
/** o raio de uma cidade de 10 mil habitantes, antes do mínimo */
export const CROSSING_M_PER_10K = 1_200;

/**
 * Até onde do centro de uma cidade a estrada ainda a atravessa (fase 28): a mancha da cidade cresce com
 * a população (a área, mais ou menos na proporção dela), então o raio cresce com a raiz da população,
 * de 2 km (a vila) a 10 km (a capital). Medido na rota do seed (D321): a regra de 2 km mais 1 km por 100
 * mil habitantes deixava Lages (173 mil) de fora com a estrada a 3,96 km do centro do IBGE; com a raiz,
 * o raio de Lages é 4,99 km, e Monte Castelo (7,7 mil) continua de fora com a estrada a 9 km.
 */
export function crossingRadiusM(pop: number): number {
  const r = CROSSING_M_PER_10K * Math.sqrt(Math.max(0, pop) / 10_000);
  return Math.min(CROSSING_MAX_M, Math.max(CROSSING_MIN_M, r));
}

/** os candidatos saem de um ponto da rota a cada 2 km, até o maior raio mais a metade do passo */
const CANDIDATE_STEP_M = 2_000;

/**
 * Os municípios que a rota atravessa, em ordem ao longo dela, cada um uma vez. A distância ao longo da
 * rota (`at_m`, `from_m`, `to_m`) é a do perfil de altitude, a mesma das outras leituras (as partes do
 * cenário e as curiosidades): o traçado simplificado mede um pouco menos que a estrada.
 */
export function passingPlaces(route: RouteShape): PassingPlace[] {
  const geometry = route.geometry;
  if (geometry.length < 2) return [];
  const cum = cumulativeM(geometry);
  const length = cum.at(-1) ?? 0;
  if (length <= 0) return [];
  const profile = route.elevation.at(-1)?.[0] ?? length;
  const scale = profile > 0 ? profile / length : 1;
  const candidates = new Map<
    string,
    { name: string; uf: string; pop: number; lng: number; lat: number }
  >();
  for (const sample of sampleEveryM(geometry, CANDIDATE_STEP_M)) {
    const [lng = 0, lat = 0] = sample.point;
    for (const m of municipalitiesWithin(lng, lat, CROSSING_MAX_M + CANDIDATE_STEP_M / 2)) {
      candidates.set(`${m.name}|${m.uf}`, m);
    }
  }
  const out: PassingPlace[] = [];
  for (const m of candidates.values()) {
    const hit = projectOntoLine(geometry, cum, [m.lng, m.lat]);
    const r = crossingRadiusM(m.pop);
    if (hit.distance_m > r) continue;
    const at = hit.fraction * length * scale;
    const half = Math.sqrt(r * r - hit.distance_m * hit.distance_m) * scale;
    out.push({
      name: m.name,
      uf: m.uf,
      pop: m.pop,
      from_m: Math.max(0, at - half),
      to_m: Math.min(profile, at + half),
      at_m: at,
      distance_m: hit.distance_m,
    });
  }
  return out.sort((a, b) => a.at_m - b.at_m || b.pop - a.pop);
}

function cityPop(s: PlaceSample): number {
  return Math.max(s.city?.pop ?? 0, s.town?.pop ?? 0);
}

/** Runs consecutivos de uma mesma classe. */
function runs(samples: readonly PlaceSample[], kinds: readonly SceneryKind[]): Segment[] {
  const out: Segment[] = [];
  samples.forEach((s, i) => {
    const kind = kinds[i] ?? 'interior';
    const last = out.at(-1);
    const to = samples[i + 1]?.dist_m ?? s.dist_m;
    if (last?.kind === kind) {
      last.to_m = to;
      if (kind === 'city') last.pop = Math.max(last.pop ?? 0, cityPop(s));
    } else {
      const seg: Segment = { kind, from_m: s.dist_m, to_m: to };
      if (kind === 'city' && cityPop(s) > 0) seg.pop = cityPop(s);
      out.push(seg);
    }
  });
  return out;
}

function mergeInto(segments: Segment[], index: number): void {
  const seg = segments[index];
  if (!seg) return;
  const prev = segments[index - 1];
  const next = segments[index + 1];
  // funde com o vizinho maior; o primeiro só tem o próximo, o último só o anterior
  const target =
    prev && next
      ? prev.to_m - prev.from_m >= next.to_m - next.from_m
        ? prev
        : next
      : (prev ?? next);
  if (!target) return;
  target.from_m = Math.min(target.from_m, seg.from_m);
  target.to_m = Math.max(target.to_m, seg.to_m);
  if (target.kind === 'city' && seg.pop) target.pop = Math.max(target.pop ?? 0, seg.pop);
  segments.splice(index, 1);
  // vizinhos iguais depois da fusão viram um só
  for (let i = segments.length - 1; i > 0; i--) {
    const a = segments[i - 1];
    const b = segments[i];
    if (!a || !b) continue;
    if (a.kind === b.kind) {
      a.to_m = b.to_m;
      if (b.pop) a.pop = Math.max(a.pop ?? 0, b.pop);
      segments.splice(i, 1);
    }
  }
}

export type ClassifyOptions = {
  /** trecho menor que isto é absorvido pelo vizinho maior (padrão: 10 km ou 5% do dia, o que for maior); as pontas ficam */
  minRunM?: number;
  /** no máximo tantas partes (padrão 6) */
  maxParts?: number;
};

/**
 * Cerca de quatro partes por dia. Classifica amostra a amostra, depois absorve trechos curtos
 * no vizinho maior e, se ainda houver partes demais, funde as menores até caber.
 */
export function classifySegments(route: RouteShape, opts: ClassifyOptions = {}): Segment[] {
  const samples = samplePlaces(route);
  if (samples.length === 0) return [];
  const total = samples.at(-1)?.dist_m ?? 0;
  const minRun = opts.minRunM ?? Math.max(10_000, total * 0.05);
  const maxParts = opts.maxParts ?? 6;
  const segments = runs(samples, samples.map(classifySample));
  // as pontas são de onde se sai e aonde se chega: nunca são absorvidas
  const threshold = (index: number) => (index === 0 || index === segments.length - 1 ? 0 : minRun);
  for (;;) {
    if (segments.length <= 1) break;
    let victim = -1;
    let victimLength = Number.POSITIVE_INFINITY;
    segments.forEach((seg, i) => {
      const length = seg.to_m - seg.from_m;
      if (length < threshold(i) && length < victimLength) {
        victim = i;
        victimLength = length;
      }
    });
    if (victim === -1) break;
    mergeInto(segments, victim);
  }
  while (segments.length > maxParts) {
    mergeInto(segments, findShortest(segments).index);
  }
  return segments;
}

function findShortest(segments: readonly Segment[]): { index: number; length: number } {
  let best = { index: 0, length: Number.POSITIVE_INFINITY };
  segments.forEach((s, i) => {
    const length = s.to_m - s.from_m;
    if (length < best.length) best = { index: i, length };
  });
  return best;
}
