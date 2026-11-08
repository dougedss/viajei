import type { StopKind } from '@shared/constants.ts';
import { isLocated } from '@/features/itinerary/rules.ts';
import { asStopKind } from '@/features/itinerary/stop-kinds.ts';
import type { DayRoute, Stop } from '@/lib/db/schema.ts';
import type { CuriosityKind, PlaceReading, SceneryKind, Segment } from '@/lib/geo/index.ts';
import { cameraPosition, groundHit, projectPoint, type CameraFrame, type Vec3 } from './math.ts';
import { MINIATURE_BOX, MINIATURE_ROAD_GAP } from '@/art/stops/types.ts';
import { clamp, fbm, lerp, smooth } from './noise.ts';
import { hashSeed, mulberry32 } from './seed.ts';

/**
 * O layout da maquete, puro: das paradas, da rota real e da leitura do lugar saem os nós, o
 * traçado em S, o relevo, as faixas de cenário, os acidentes (lago, costa, parreirais, hotel,
 * quadras), o enquadramento da câmera e a função que amostra o terreno em qualquer ponto. A cena
 * só desenha o que está aqui; os testes conferem aqui. Unidades da cena: 1 unidade ≈ "um quarteirão
 * de maquete"; a quilometragem real vive em `km` e a conversão é `kmToS`. A estrada começa um toco
 * antes do primeiro nó e segue um toco depois do último: o dia não nasce nem termina no vazio.
 */
export type { CameraFrame, Vec3 } from './math.ts';

export type SceneryWeights = Record<SceneryKind, number>;
export const SCENERY_KINDS: readonly SceneryKind[] = [
  'city',
  'interior',
  'field',
  'serra',
  'beach',
];

export type PathSample = {
  x: number;
  y: number;
  z: number;
  /** comprimento percorrido no caminho da cena */
  s: number;
  /** quilometragem no eixo do layout (real onde há rota) */
  km: number;
  tx: number;
  ty: number;
  tz: number;
};

export type NodeTouch = 'lake' | 'vineyard' | null;

export type LayoutNode = {
  stop_id: string;
  kind: StopKind;
  index: number;
  s: number;
  km: number;
  position: Vec3;
  /** de que lado do eixo o S dobrou neste nó */
  side: -1 | 1;
  touch: NodeTouch;
};

export type SceneryBand = {
  kind: SceneryKind;
  from_s: number;
  to_s: number;
  from_km: number;
  to_km: number;
  /** população do município que fez a cidade, quando a leitura informa */
  pop: number | null;
};

export type LayoutFeature =
  | { kind: 'lake'; x: number; z: number; rx: number; rz: number; level: number }
  | { kind: 'coast'; side: -1 | 1; from_s: number; to_s: number; offset: number }
  | { kind: 'vineyard'; x: number; z: number; angle: number; half: number; rowStep: number }
  /** a miniatura 3D da parada, ao lado da estrada, virada para ela (fase 14) */
  | { kind: 'miniature'; stop_id: string; stop: StopKind; x: number; z: number; angle: number }
  /** quadras de cidade em volta de uma parada de cidade, hotel ou comida (fase 14) */
  | { kind: 'blocks'; x: number; z: number; radius: number; density: number };

export type LayoutCuriosity = {
  kind: CuriosityKind;
  s: number;
  km: number;
  caption: string;
  scenery?: SceneryKind;
};

export type TerrainSample = {
  h: number;
  weights: SceneryWeights;
  water: 'none' | 'sea' | 'lake';
  /** distância ao caminho, em unidades da cena */
  dist: number;
  km: number;
  s: number;
};

export type LayoutViewport = {
  width: number;
  height: number;
  /** faixas do HUD, em px, que o dia não pode cobrir */
  hudTop: number;
  hudBottom: number;
};

export type LayoutInput = {
  /** semente determinística */
  dayId: string;
  /** paradas ativas do dia, em ordem */
  stops: readonly Stop[];
  route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> | null;
  place: PlaceReading | null;
  viewport: LayoutViewport;
  /**
   * Até onde o z do caminho vai antes de comprimir (padrão `Z_MAX`, o dia inteiro na tela). O filme
   * da retrospectiva usa mais, porque a câmera sobrevoa a viagem em vez de mostrá-la de uma vez.
   */
  zMax?: number;
};

export type WorldLayout = {
  seed: number;
  hasRoute: boolean;
  /** meia largura do S deste dia */
  xHalf: number;
  /** meia largura da estrada na cena, maior quando a câmera está longe */
  roadHalfWidth: number;
  /** quilometragem total do eixo do layout */
  totalKm: number;
  /** km do eixo do layout correspondente ao início da rota real (0 sem paradas virtuais à frente) */
  kmOffset: number;
  realTotalKm: number | null;
  pathLength: number;
  nodes: LayoutNode[];
  path: PathSample[];
  bands: SceneryBand[];
  features: LayoutFeature[];
  curiosities: LayoutCuriosity[];
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** altura da água do mar na cena, quando há praia */
  seaLevel: number | null;
  /** altura média do caminho: para onde a câmera olha */
  yMid: number;
  camera: CameraFrame;
  kmToS(km: number): number;
  sToKm(s: number): number;
  /** fração do comprimento real da rota (o `fraction` do catch-up) */
  fractionToS(fraction: number): number;
  pathAt(s: number): PathSample;
  weightsAtKm(km: number): SceneryWeights;
  terrainAt(x: number, z: number): TerrainSample;
};

// ------------------------------------------------------------------ constantes da cena
/** meia largura mínima do S: os nós alternam entre -xHalf e +xHalf, que abre em dias longos */
export const X_HALF = 17;
export const X_HALF_MAX = 40;
/** acima disto o dia é comprimido em z: a câmera nunca precisa se afastar demais */
export const Z_MAX = 190;
export const NODE_GAP = 18;
/** o toco de estrada antes do primeiro nó e depois do último */
export const STUB = NODE_GAP;
export const Z_PER_KM = 0.22;
export const Z_PER_CLIMB_M = 0.012;
export const Y_PER_M = 0.024;
export const ROAD_HALF_WIDTH = 1.9;
export const COAST_OFFSET = 22;
export const LAKE_RX = 12;
export const LAKE_RZ = 9;
/** transição entre dois cenários vizinhos, em km (metade para cada lado da borda) */
export const BLEND_KM = 2;
/** sem rota, um deslocamento vira quilômetros a esta velocidade */
export const VIRTUAL_KMH = 60;
export const MIN_VIRTUAL_KM = 15;
export const DEFAULT_TRAVEL_MINUTES = 30;
export const OVER_TILT = (64 * Math.PI) / 180;
export const FOV = 30;
/** espaço horizontal fora dos nós para as pílulas, em unidades da cena */
export const PILL_MARGIN = 14;
/** até onde as quadras de cidade vão em volta de uma parada de cidade, hotel ou comida */
export const BLOCKS_RADIUS = 16;
/** os tipos de parada que trazem prédios (fase 14: poucas cidades, mais detalhadas) */
export const BLOCK_KINDS: readonly StopKind[] = ['city', 'hotel', 'food'];
export const LAKE_RE = /represa|lago|lagoa|barragem|açude/i;

const SAMPLES_PER_UNIT = 5;
const COARSE_EVERY = 8;
/** alcance da mistura do terreno: a amostra grossa a mais do que isto não pesa */
const BLEND_REACH = 70;
const EMPTY_SAMPLE: PathSample = { x: 0, y: 0, z: 0, s: 0, km: 0, tx: 0, ty: 0, tz: 1 };

const zeroWeights = (): SceneryWeights => ({ city: 0, interior: 0, field: 0, serra: 0, beach: 0 });

// ------------------------------------------------------------------ eixo de quilômetros
type KmAxis = { kmAt: number[]; kmOffset: number; realTotalKm: number | null; hasRoute: boolean };

function virtualKm(stop: Stop | undefined): number {
  const minutes = stop?.travel_minutes_to_next ?? DEFAULT_TRAVEL_MINUTES;
  return Math.max(MIN_VIRTUAL_KM, (minutes / 60) * VIRTUAL_KMH);
}

/**
 * Cada parada ganha um km no eixo do layout. Com rota, as paradas com coordenada ficam na
 * quilometragem real dos trechos; as sem coordenada são interpoladas pelos deslocamentos entre as
 * vizinhas, e as que vêm antes da primeira (ou depois da última) com coordenada ganham km virtuais.
 * Sem rota, tudo é virtual: deslocamento a 60 km/h, nunca menos que 15 km, para o S ter corpo.
 */
function kmAxis(stops: readonly Stop[], route: LayoutInput['route']): KmAxis {
  const located = stops.flatMap((s, i) => (isLocated(s) ? [i] : []));
  const hasRoute =
    route !== null &&
    located.length >= 2 &&
    route.legs.length === located.length - 1 &&
    route.geometry.length >= 2;
  const kmAt = new Array<number>(stops.length).fill(0);
  if (!hasRoute) {
    for (let i = 1; i < stops.length; i++) kmAt[i] = (kmAt[i - 1] ?? 0) + virtualKm(stops[i - 1]);
    return { kmAt, kmOffset: 0, realTotalKm: null, hasRoute: false };
  }
  const along = [0];
  for (const leg of route.legs) along.push((along.at(-1) ?? 0) + leg.distance_m / 1000);
  located.forEach((idx, k) => {
    kmAt[idx] = along[k] ?? 0;
  });
  // entre duas com coordenada: proporcional aos deslocamentos informados
  for (let k = 0; k < located.length - 1; k++) {
    const a = located[k] ?? 0;
    const b = located[k + 1] ?? 0;
    if (b - a <= 1) continue;
    const weights: number[] = [];
    for (let j = a; j < b; j++) {
      weights.push(stops[j]?.travel_minutes_to_next ?? DEFAULT_TRAVEL_MINUTES);
    }
    const total = weights.reduce((acc, w) => acc + w, 0) || 1;
    let acc = 0;
    for (let j = a + 1; j < b; j++) {
      acc += weights[j - 1 - a] ?? 0;
      kmAt[j] = (kmAt[a] ?? 0) + ((kmAt[b] ?? 0) - (kmAt[a] ?? 0)) * (acc / total);
    }
  }
  const first = located[0] ?? 0;
  for (let j = first - 1; j >= 0; j--) kmAt[j] = (kmAt[j + 1] ?? 0) - virtualKm(stops[j]);
  const last = located.at(-1) ?? 0;
  for (let j = last + 1; j < stops.length; j++)
    kmAt[j] = (kmAt[j - 1] ?? 0) + virtualKm(stops[j - 1]);
  const kmOffset = -(kmAt[0] ?? 0);
  return {
    kmAt: kmAt.map((km) => km + kmOffset),
    kmOffset,
    realTotalKm: along.at(-1) ?? 0,
    hasRoute: true,
  };
}

// ------------------------------------------------------------------ altitude
type AltFn = (kmLayout: number) => number;

function altitudeFn(axis: KmAxis, route: LayoutInput['route']): AltFn {
  if (!axis.hasRoute || !route || route.elevation.length === 0) return () => 0;
  const elev = route.elevation;
  const first = elev[0] ?? [0, 0];
  const last = elev.at(-1) ?? first;
  const at = (i: number): readonly [number, number] => elev[i] ?? first;
  return (kmLayout) => {
    const m = (kmLayout - axis.kmOffset) * 1000;
    if (m <= first[0]) return first[1];
    if (m >= last[0]) return last[1];
    let lo = 0;
    let hi = elev.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (at(mid)[0] <= m) lo = mid;
      else hi = mid;
    }
    const a = at(lo);
    const b = at(hi);
    const t = (m - a[0]) / Math.max(1e-6, b[0] - a[0]);
    return lerp(a[1], b[1], t);
  };
}

/** Subida mais descida acumuladas entre dois km, amostrando a cada 0,5 km. */
function climbBetween(altAt: AltFn, kmA: number, kmB: number): number {
  let total = 0;
  let prev = altAt(kmA);
  for (let km = kmA + 0.5; km < kmB; km += 0.5) {
    const a = altAt(km);
    total += Math.abs(a - prev);
    prev = a;
  }
  total += Math.abs(altAt(kmB) - prev);
  return total;
}

/**
 * O mapa km → fração do trecho, ponderado pela inclinação: um trecho íngreme ganha mais caminho
 * na tela, e a serra vira uma descida em vez de um degrau. Devolve a função inversa (fração → km).
 */
function segmentKmMap(altAt: AltFn, kmA: number, kmB: number): (f: number) => number {
  const span = kmB - kmA;
  if (span <= 1e-6) return () => kmA;
  const n = Math.max(2, Math.ceil(span / 0.25));
  const w = [0];
  for (let i = 1; i <= n; i++) {
    const k0 = lerp(kmA, kmB, (i - 1) / n);
    const k1 = lerp(kmA, kmB, i / n);
    const slope = Math.abs(altAt(k1) - altAt(k0)) / Math.max(1e-6, k1 - k0);
    w.push((w[i - 1] ?? 0) + 1 + slope / 14);
  }
  const total = w[n] ?? 1;
  return (f) => {
    const target = clamp(f, 0, 1) * total;
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((w[mid] ?? 0) <= target) lo = mid;
      else hi = mid;
    }
    const t = (target - (w[lo] ?? 0)) / Math.max(1e-9, (w[hi] ?? 0) - (w[lo] ?? 0));
    return lerp(kmA, kmB, (lo + t) / n);
  };
}

// ------------------------------------------------------------------ Bézier com espaçamento igual
type XZ = [number, number];

function bezierPoints(a: XZ, b: XZ, count: number): XZ[] {
  const L = b[1] - a[1];
  const p1: XZ = [a[0], a[1] + L * 0.5];
  const p2: XZ = [b[0], b[1] - L * 0.5];
  const at = (t: number): XZ => {
    const m = 1 - t;
    const w0 = m * m * m;
    const w1 = 3 * m * m * t;
    const w2 = 3 * m * t * t;
    const w3 = t * t * t;
    return [
      w0 * a[0] + w1 * p1[0] + w2 * p2[0] + w3 * b[0],
      w0 * a[1] + w1 * p1[1] + w2 * p2[1] + w3 * b[1],
    ];
  };
  const dense = Math.max(count * 4, 16);
  const pts: XZ[] = [];
  const cum = [0];
  for (let i = 0; i <= dense; i++) {
    const p = at(i / dense);
    const prev = pts.at(-1);
    pts.push(p);
    if (prev) cum.push((cum.at(-1) ?? 0) + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
  }
  const total = cum.at(-1) ?? 0;
  const out: XZ[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const target = (k / count) * total;
    while (j < cum.length - 2 && (cum[j + 1] ?? 0) < target) j++;
    const c0 = cum[j] ?? 0;
    const c1 = cum[j + 1] ?? c0;
    const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    const q0 = pts[j] ?? a;
    const q1 = pts[j + 1] ?? q0;
    out.push([lerp(q0[0], q1[0], t), lerp(q0[1], q1[1], t)]);
  }
  return out;
}

// ------------------------------------------------------------------ o layout
type NodeXZ = { x: number; z: number; km: number };

export function buildLayout(input: LayoutInput): WorldLayout {
  const stops = input.stops;
  const seed = hashSeed(input.dayId);
  const rng = mulberry32(seed);
  const axis = kmAxis(stops, input.route);
  const altAt = altitudeFn(axis, input.route);
  const n = stops.length;

  // nós: x alternado, z acumulado por distância e subida
  const nodeXZ: NodeXZ[] = [];
  let zAcc = 0;
  for (let i = 0; i < n; i++) {
    const km = axis.kmAt[i] ?? 0;
    if (i > 0) {
      const prevKm = axis.kmAt[i - 1] ?? 0;
      zAcc += NODE_GAP + Z_PER_KM * (km - prevKm) + Z_PER_CLIMB_M * climbBetween(altAt, prevKm, km);
    }
    nodeXZ.push({ x: 0, z: zAcc, km });
  }
  // dias longos: comprime o z para o dia inteiro caber a uma distância legível, e abre o S
  const rawEnd = nodeXZ.at(-1)?.z ?? 0;
  const zMax = input.zMax ?? Z_MAX;
  const zScale = rawEnd > zMax ? zMax / rawEnd : 1;
  const zEnd = rawEnd * zScale;
  const xHalf = clamp(zEnd * 0.16, X_HALF, X_HALF_MAX);
  nodeXZ.forEach((nd, i) => {
    nd.z *= zScale;
    nd.x = i % 2 === 0 ? -xHalf : xHalf;
  });
  const nodeAt = (i: number): NodeXZ => nodeXZ[i] ?? { x: 0, z: 0, km: 0 };

  // caminho amostrado: toco de entrada, os trechos em S, toco de saída
  const path: PathSample[] = [];
  const nodeIndex: number[] = [];
  const pushSample = (x: number, z: number, km: number) => {
    path.push({ x, y: altAt(km) * Y_PER_M, z, s: 0, km, tx: 0, ty: 0, tz: 1 });
  };
  const straight = (x: number, z0: number, z1: number, km: number, skipFirst: boolean) => {
    const count = Math.max(2, Math.ceil(Math.abs(z1 - z0) * SAMPLES_PER_UNIT));
    for (let k = skipFirst ? 1 : 0; k <= count; k++) pushSample(x, lerp(z0, z1, k / count), km);
  };
  if (n <= 1) {
    const node = nodeAt(0);
    straight(node.x, node.z - STUB, node.z + STUB, node.km, false);
    nodeIndex.push(Math.floor((path.length - 1) / 2));
  } else {
    const first = nodeAt(0);
    straight(first.x, first.z - STUB, first.z, first.km, false);
    nodeIndex.push(path.length - 1);
    for (let i = 0; i < n - 1; i++) {
      const A = nodeAt(i);
      const B = nodeAt(i + 1);
      const L = Math.max(1e-3, B.z - A.z);
      const kmOf = segmentKmMap(altAt, A.km, B.km);
      const count = Math.max(4, Math.ceil(L * SAMPLES_PER_UNIT));
      const pts = bezierPoints([A.x, A.z], [B.x, B.z], count);
      for (let k = 1; k <= count; k++) {
        const p = pts[k] ?? [B.x, B.z];
        pushSample(p[0], p[1], kmOf(k / count));
      }
      nodeIndex.push(path.length - 1);
    }
    const last = nodeAt(n - 1);
    straight(last.x, last.z, last.z + STUB, last.km, true);
  }
  const sample = (i: number): PathSample => path[i] ?? EMPTY_SAMPLE;
  // suaviza o perfil para a estrada não serrilhar
  {
    const ys = path.map((p) => p.y);
    path.forEach((p, i) => {
      let sum = 0;
      let cnt = 0;
      for (let k = -6; k <= 6; k++) {
        sum += ys[clamp(i + k, 0, path.length - 1)] ?? 0;
        cnt++;
      }
      p.y = sum / cnt;
    });
  }
  path.forEach((p, i) => {
    if (i === 0) return;
    const a = sample(i - 1);
    p.s = a.s + Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
  });
  path.forEach((p, i) => {
    const a = sample(Math.max(0, i - 1));
    const b = sample(Math.min(path.length - 1, i + 1));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const l = Math.hypot(dx, dy, dz) || 1;
    p.tx = dx / l;
    p.ty = dy / l;
    p.tz = dz / l;
  });
  const pathLength = path.at(-1)?.s ?? 0;
  const totalKm = Math.max(0, axis.kmAt.at(-1) ?? 0);
  const firstNodeS = sample(nodeIndex[0] ?? 0).s;
  const lastNodeS = sample(nodeIndex.at(-1) ?? 0).s;

  const pathAt = (s: number): PathSample => {
    const sc = clamp(s, 0, pathLength);
    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sample(mid).s <= sc) lo = mid;
      else hi = mid;
    }
    const a = sample(lo);
    const b = sample(hi);
    const t = (sc - a.s) / Math.max(1e-6, b.s - a.s);
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      z: lerp(a.z, b.z, t),
      s: sc,
      km: lerp(a.km, b.km, t),
      tx: lerp(a.tx, b.tx, t),
      ty: lerp(a.ty, b.ty, t),
      tz: lerp(a.tz, b.tz, t),
    };
  };
  const kmToS = (km: number): number => {
    if (totalKm <= 0 || km <= 0) return firstNodeS;
    if (km >= totalKm) return lastNodeS;
    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (sample(mid).km <= km) lo = mid;
      else hi = mid;
    }
    const a = sample(lo);
    const b = sample(hi);
    const t = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
    return lerp(a.s, b.s, t);
  };
  const sToKm = (s: number): number => pathAt(s).km;
  const fractionToS = (fraction: number): number => {
    const f = clamp(fraction, 0, 1);
    if (axis.realTotalKm !== null) return kmToS(axis.kmOffset + f * axis.realTotalKm);
    return kmToS(f * totalKm);
  };

  const nodes: LayoutNode[] = stops.map((stop, i) => {
    const p = sample(nodeIndex[i] ?? 0);
    const xz = nodeAt(i);
    return {
      stop_id: stop.id,
      kind: asStopKind(stop.kind),
      index: i,
      s: p.s,
      km: xz.km,
      position: [p.x, p.y, p.z],
      side: xz.x < 0 ? -1 : 1,
      touch: touchOf(stop),
    };
  });

  const weightsAtKm = (km: number): SceneryWeights => {
    const w = zeroWeights();
    let sum = 0;
    const half = BLEND_KM / 2;
    for (const b of bands) {
      const v =
        smooth(b.from_km - half, b.from_km + half, km) *
        (1 - smooth(b.to_km - half, b.to_km + half, km));
      w[b.kind] += v;
      sum += v;
    }
    if (sum <= 1e-9) return { ...zeroWeights(), interior: 1 };
    for (const k of SCENERY_KINDS) w[k] /= sum;
    return w;
  };

  // faixas de cenário
  const bands = buildBands(input.place?.segments ?? null, axis, totalKm, kmToS);

  // a estrada: de perto (a câmera segue o carro, fase 14) a largura natural
  const roadHalfWidth = ROAD_HALF_WIDTH;

  // acidentes
  const features: LayoutFeature[] = [];
  for (const node of nodes) {
    const side = node.side;
    const [x, y, z] = node.position;
    if (node.touch === 'lake') {
      features.push({
        kind: 'lake',
        x: x + side * 20,
        z: z + 1,
        rx: LAKE_RX,
        rz: LAKE_RZ,
        level: y - 0.45,
      });
    } else if (node.touch === 'vineyard') {
      features.push({
        kind: 'vineyard',
        x: x + side * 11,
        z,
        angle: (rng() - 0.5) * 0.6,
        half: 7,
        rowStep: 1.3,
      });
    }
    // a miniatura do tipo, do lado de fora do S, com a caixa inteira fora da estrada e a frente
    // virada para ela (um pequeno giro pela semente, para não ficarem todas iguais)
    const box = MINIATURE_BOX[node.kind];
    features.push({
      kind: 'miniature',
      stop_id: node.stop_id,
      stop: node.kind,
      x: x + side * (roadHalfWidth + MINIATURE_ROAD_GAP + box.d / 2),
      z: z + 1.5,
      angle: -side * (Math.PI / 2) + (rng() - 0.5) * 0.3,
    });
    if (BLOCK_KINDS.includes(node.kind)) {
      // a densidade pela cidade do lugar (a faixa de cenário em que o nó cai), quando a leitura a dá
      const band = bands.find((b) => node.km >= b.from_km && node.km <= b.to_km);
      const density =
        band?.kind === 'city' && band.pop ? clamp((Math.log10(band.pop) - 4.5) / 1.3, 0.3, 1) : 0.5;
      features.push({ kind: 'blocks', x, z, radius: BLOCKS_RADIUS, density });
    }
  }
  let seaLevel: number | null = null;
  for (const band of bands) {
    if (band.kind === 'beach') {
      const mid = (band.from_s + band.to_s) / 2;
      let side: -1 | 1 = 1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const nd of nodes) {
        const d = Math.abs(nd.s - mid);
        if (d < bestDist) {
          bestDist = d;
          side = nd.side;
        }
      }
      features.push({
        kind: 'coast',
        side,
        from_s: band.from_s,
        to_s: band.to_s,
        offset: COAST_OFFSET,
      });
      let minY = Number.POSITIVE_INFINITY;
      for (const p of path) if (p.s >= band.from_s && p.s <= band.to_s) minY = Math.min(minY, p.y);
      if (!Number.isFinite(minY)) minY = pathAt(mid).y;
      seaLevel = Math.min(seaLevel ?? Number.POSITIVE_INFINITY, minY - 0.3);
    }
  }

  // curiosidades
  const curiosities: LayoutCuriosity[] = (input.place?.curiosities ?? [])
    .map((c) => {
      const km = axis.kmOffset + c.at_m / 1000;
      return {
        kind: c.kind,
        km,
        s: kmToS(km),
        caption: c.caption,
        ...(c.scenery ? { scenery: c.scenery } : {}),
      };
    })
    .filter((c) => axis.hasRoute && c.km >= 0 && c.km <= totalKm)
    .sort((a, b) => a.s - b.s);

  // câmera: o quadro largo do dia inteiro entre as faixas do HUD (a abertura; a câmera que segue o
  // carro sai de `camera.ts`)
  const yMid = path.reduce((acc, p) => acc + p.y, 0) / Math.max(1, path.length);
  const camera = fitCamera(input.viewport, zEnd, yMid, xHalf);
  const bounds = terrainBounds(camera, input.viewport, zEnd, yMid, xHalf);

  // terreno: amostras grossas da trilha com o cenário de cada uma
  const coarse = path
    .filter((_, i) => i % COARSE_EVERY === 0)
    .map((p) => ({ x: p.x, z: p.z, y: p.y, s: p.s, km: p.km, w: weightsAtKm(p.km) }));
  const seedOff = (seed % 1000) / 10;
  const lakes = features.filter((f) => f.kind === 'lake');
  const coasts = features.filter((f) => f.kind === 'coast');

  // as amostras grossas vêm em ordem de z (o S só avança): dá para olhar só a vizinhança de um ponto
  const coarseZ = coarse.map((c) => c.z);
  const firstCoarseFrom = (z: number): number => {
    let lo = 0;
    let hi = coarseZ.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((coarseZ[mid] ?? 0) < z) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const terrainAt = (x: number, z: number): TerrainSample => {
    // o ponto do caminho mais perto, e a média ponderada das amostras grossas da vizinhança
    // (a mais de BLEND_REACH o peso já é desprezível)
    let bi = -1;
    let bd = Number.POSITIVE_INFINITY;
    let wsum = 0;
    let ysum = 0;
    const blend = zeroWeights();
    const zFrom = z - BLEND_REACH;
    const zTo = z + BLEND_REACH;
    const visit = (c: (typeof coarse)[number], i: number) => {
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d2 < bd) {
        bd = d2;
        bi = i;
      }
      const base = d2 + 40;
      const w = 1 / (base * Math.sqrt(base));
      wsum += w;
      ysum += c.y * w;
      for (const k of SCENERY_KINDS) blend[k] += c.w[k] * w;
    };
    for (let i = firstCoarseFrom(zFrom); i < coarse.length; i++) {
      const c = coarse[i];
      if (!c || c.z > zTo) break;
      visit(c, i);
    }
    // longe de todo o caminho (cantos do terreno): a amostra mais perto em z, e só ela
    if (bi < 0) {
      const i = Math.min(coarse.length - 1, firstCoarseFrom(z));
      const c = coarse[i];
      if (c) visit(c, i);
      bi = Math.max(0, bi);
    }
    for (const k of SCENERY_KINDS) blend[k] /= wsum || 1;
    const center = bi * COARSE_EVERY;
    let best = sample(clamp(center, 0, path.length - 1));
    let bd2 = Number.POSITIVE_INFINITY;
    const from = Math.max(0, center - COARSE_EVERY - 1);
    const to = Math.min(path.length - 1, center + COARSE_EVERY + 1);
    for (let i = from; i <= to; i++) {
      const p = sample(i);
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd2) {
        bd2 = d;
        best = p;
      }
    }
    const dist = Math.sqrt(bd2);
    const yBlend = ysum / (wsum || 1);
    const mixv = smooth(4, 18, dist);
    const exact = weightsAtKm(best.km);
    const weights = zeroWeights();
    for (const k of SCENERY_KINDS) weights[k] = lerp(exact[k], blend[k], mixv);

    const amp =
      0.35 +
      4 * weights.serra +
      0.8 * weights.interior +
      0.6 * weights.field +
      0.25 * weights.city +
      0.25 * weights.beach;
    const fade = smooth(3.6, 11, dist);
    let h =
      lerp(best.y, yBlend, mixv) +
      (fbm(x * 0.045 + 7 + seedOff, z * 0.045 + 3 + seedOff, 3) - 0.46) * amp * fade +
      (fbm(x * 0.25 + seedOff, z * 0.25, 2) - 0.5) * 0.22 * fade;
    let water: TerrainSample['water'] = 'none';

    for (const lake of lakes) {
      const er = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
      if (er < 1) {
        h = Math.min(h, lake.level - 1.4 + 1.2 * smooth(0.5, 1, er));
        water = 'lake';
      } else if (er < 1.3) {
        h = lerp(Math.min(h, lake.level + 0.1), h, smooth(1, 1.3, er));
      }
    }
    if (seaLevel !== null) {
      // de que lado da estrada o ponto está, pela tangente do caminho
      const sideSign = Math.sign((x - best.x) * best.tz - (z - best.z) * best.tx) || 1;
      for (const coast of coasts) {
        if (sideSign !== coast.side) continue;
        const endFade = smooth(0, 10, best.s - coast.from_s) * smooth(0, 10, coast.to_s - best.s);
        if (endFade <= 0) continue;
        const shore = coast.offset - dist;
        let hc = h;
        if (shore < 0) hc = Math.min(h, seaLevel - 0.4 + shore * 0.1);
        else if (shore < 9) hc = lerp(seaLevel + 0.14, h, smooth(0, 1, shore / 9));
        h = lerp(h, hc, endFade);
        if (shore < 0 && endFade > 0.5) water = 'sea';
      }
      if (water === 'none') h = Math.max(h, seaLevel + 0.05);
    }
    return { h, weights, water, dist, km: best.km, s: best.s };
  };

  return {
    seed,
    hasRoute: axis.hasRoute,
    xHalf,
    roadHalfWidth,
    totalKm,
    kmOffset: axis.kmOffset,
    realTotalKm: axis.realTotalKm,
    pathLength,
    nodes,
    path,
    bands,
    features,
    curiosities,
    bounds,
    seaLevel,
    yMid,
    camera,
    kmToS,
    sToKm,
    fractionToS,
    pathAt,
    weightsAtKm,
    terrainAt,
  };
}

function touchOf(stop: Stop): NodeTouch {
  const kind = asStopKind(stop.kind);
  if (kind === 'winery') return 'vineyard';
  if (kind === 'nature' && LAKE_RE.test(stop.name)) return 'lake';
  return null;
}

function buildBands(
  segments: readonly Segment[] | null,
  axis: KmAxis,
  totalKm: number,
  kmToS: (km: number) => number,
): SceneryBand[] {
  const band = (
    kind: SceneryKind,
    from_km: number,
    to_km: number,
    pop: number | null,
  ): SceneryBand => ({
    kind,
    from_km,
    to_km,
    from_s: kmToS(from_km),
    to_s: kmToS(to_km),
    pop,
  });
  if (!segments || segments.length === 0 || !axis.hasRoute)
    return [band('interior', 0, totalKm, null)];
  const out: SceneryBand[] = [];
  for (const seg of segments) {
    const from = clamp(axis.kmOffset + seg.from_m / 1000, 0, totalKm);
    const to = clamp(axis.kmOffset + seg.to_m / 1000, 0, totalKm);
    if (to - from <= 1e-6) continue;
    out.push(band(seg.kind, from, to, seg.pop ?? null));
  }
  const first = out[0];
  const last = out.at(-1);
  if (!first || !last) return [band('interior', 0, totalKm, null)];
  // km virtuais antes da rota e depois dela são interior
  if (first.from_km > 0.5) out.unshift(band('interior', 0, first.from_km, null));
  if (last.to_km < totalKm - 0.5) out.push(band('interior', last.to_km, totalKm, null));
  return out;
}

/**
 * A câmera parada que mostra o dia inteiro entre as faixas do HUD: inclinação fixa, distância pela
 * altura útil e pela largura, e o alvo deslocado para o centro do dia cair no centro da área útil.
 */
export function fitCamera(
  viewport: LayoutViewport,
  zEnd: number,
  yMid: number,
  xHalf = X_HALF,
): CameraFrame {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const aspect = width / height;
  const usable = Math.max(0.4, (height - viewport.hudTop - viewport.hudBottom) / height);
  const tanHalf = Math.tan(((FOV / 2) * Math.PI) / 180);
  const span = zEnd + 2 * STUB + 10;
  const distH = ((span * Math.sin(OVER_TILT)) / (2 * tanHalf * usable)) * 1.08;
  const xSpan = 2 * xHalf + 2 * PILL_MARGIN;
  const distW = (xSpan / (2 * tanHalf * aspect)) * 1.08;
  const frame: CameraFrame = {
    target: [0, yMid, zEnd / 2],
    distance: Math.max(60, distH, distW),
    tilt: OVER_TILT,
    fov: FOV,
  };
  // o centro da área útil, em coordenadas normalizadas (y para cima)
  const yCenter = (viewport.hudBottom - viewport.hudTop) / height;
  const hit = groundHit(frame, aspect, 0, yCenter, yMid);
  if (hit) frame.target = [0, yMid, frame.target[2] + (frame.target[2] - hit[2])];
  return frame;
}

/** A caixa de terreno que a câmera enxerga, com folga; nunca menor que o caminho e suas margens. */
function terrainBounds(
  camera: CameraFrame,
  viewport: LayoutViewport,
  zEnd: number,
  yMid: number,
  xHalf: number,
): WorldLayout['bounds'] {
  const aspect = Math.max(0.3, viewport.width / Math.max(1, viewport.height));
  // a câmera que segue o carro (fase 14) olha para a frente a partir de cada nó: folga para o
  // horizonte depois do último e para a posição dela antes do primeiro
  let x0 = -(xHalf + 30);
  let x1 = xHalf + 30;
  let z0 = -(STUB + 30);
  let z1 = zEnd + STUB + 70;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const hit = groundHit(camera, aspect, sx, sy, yMid) ?? groundHit(camera, aspect, sx, 0.6, yMid);
    if (!hit) continue;
    x0 = Math.min(x0, hit[0]);
    x1 = Math.max(x1, hit[0]);
    z0 = Math.min(z0, hit[2]);
    z1 = Math.max(z1, hit[2]);
  }
  const padX = (x1 - x0) * 0.08;
  const padZ = (z1 - z0) * 0.08;
  return {
    x0: Math.max(-300, Math.floor(x0 - padX)),
    x1: Math.min(300, Math.ceil(x1 + padX)),
    z0: Math.max(-90, Math.floor(z0 - padZ)),
    z1: Math.min(zEnd + 180, Math.ceil(z1 + padZ)),
  };
}

/** Onde a câmera do frame fica, para a cena copiar. */
export { cameraPosition, projectPoint };
