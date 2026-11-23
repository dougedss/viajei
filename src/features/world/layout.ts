import type { StopKind } from '@shared/constants.ts';
import { isAutoStop, isLocated, isWaypoint } from '@/features/itinerary/rules.ts';
import { asStopKind } from '@/features/itinerary/stop-kinds.ts';
import type { DayRoute, Stop } from '@/lib/db/schema.ts';
import type {
  CuriosityKind,
  PassingPlace,
  PlaceReading,
  SceneryKind,
  Segment,
} from '@/lib/geo/index.ts';
import { indexRoute, projectOntoRoute } from '@/lib/geo/project.ts';
import { cameraPosition, projectPoint, type Vec3 } from './math.ts';
import { MINIATURE_BOX, MINIATURE_ROAD_GAP } from '@/art/stops/types.ts';
import { cityPlaceKey, stopPlaceKey } from '@shared/landmark-keys.ts';
import { clamp, fbm, lerp, smooth } from './noise.ts';
import { hashSeed, mulberry32 } from './seed.ts';

/**
 * O layout da maquete, puro: das paradas, da rota real e da leitura do lugar saem os nós, o
 * traçado em S, o relevo, as faixas de cenário, os acidentes (lago, costa, parreirais, quadras), as
 * peças das paradas e os seus pisos, as cidades de passagem, a caixa da maquete e a função que
 * amostra o terreno em qualquer ponto. A cena só desenha o que está aqui; os testes conferem aqui.
 * Unidades da cena: 1 unidade ≈ "um quarteirão de maquete"; a quilometragem real vive em `km` e a
 * conversão é `kmToS`. A estrada começa um toco antes do primeiro nó e segue um toco depois do
 * último: o dia não nasce nem termina no vazio.
 *
 * Fase 22: a maquete é uma maquete de mesa, inteira na tela em retrato. O dia ocupa entre 72 e 124
 * unidades de comprimento (esticado quando curto, comprimido quando longo) por cerca de 76 a 84 de
 * largura (a estrada serpenteia entre ±14 e ±18, e cada lado tem 24 unidades para as peças): a
 * proporção dos esboços (64 × 132). Um trecho longo entre duas paradas ganha mais idas e vindas. O
 * layout não depende do tamanho do palco: a câmera de repouso (`camera.ts`) é quem enquadra esta
 * caixa no espaço que há.
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
  /**
   * a peça 3D da parada, ao lado da estrada, virada para ela (fases 14 e 22): a do lugar quando o
   * catálogo tem o cartão-postal da `place_key` (fase 23), senão a miniatura do tipo
   */
  | {
      kind: 'miniature';
      stop_id: string;
      stop: StopKind;
      place_key: string | null;
      x: number;
      z: number;
      angle: number;
    }
  /** quadras de cidade em volta de uma parada de cidade, hotel ou comida (fase 14) */
  | { kind: 'blocks'; x: number; z: number; radius: number; density: number };

/** O piso plano de uma peça: o terreno fica na altura do nó dentro de `r`, e a decoração não entra. */
export type LayoutPad = { x: number; z: number; r: number; y: number };

/**
 * Uma cidade de passagem (fase 22): o nome na beira da estrada, sem pílula e sem toque. Fase 23: com
 * o cartão-postal dela no catálogo (`cityPieces`), a peça atrás do nome, num piso próprio, na caixa
 * da cidade; sem lugar para o piso (os pisos das peças, a estrada que volta), fica só o nome.
 */
export type LayoutPlace = {
  name: string;
  uf: string;
  pop: number;
  km: number;
  s: number;
  side: -1 | 1;
  /** onde o nome fica ancorado, ao lado da estrada */
  position: Vec3;
  /** a chave dela no catálogo dos cartões-postais */
  key: string | null;
  /** a peça do cartão-postal: onde fica e para onde olha (null: só o nome) */
  piece: { x: number; z: number; angle: number } | null;
};

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

export type LayoutInput = {
  /** semente determinística */
  dayId: string;
  /** paradas ativas do dia, em ordem */
  stops: readonly Stop[];
  route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> | null;
  place: PlaceReading | null;
  /** as cidades de passagem que têm cartão-postal publicado no catálogo (as chaves `city:…`), fase 23 */
  cityPieces?: ReadonlySet<string>;
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
  /** meia largura da estrada na cena */
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
  pads: LayoutPad[];
  places: LayoutPlace[];
  curiosities: LayoutCuriosity[];
  /** a caixa da maquete no chão: é até onde o terreno vai, e o corte da base */
  bounds: { x0: number; x1: number; z0: number; z1: number };
  /** de quanto abaixo do chão mais baixo a quanto acima do mais alto a maquete vai (a câmera enquadra isto) */
  yRange: { y0: number; y1: number };
  /** altura da água do mar na cena, quando há praia */
  seaLevel: number | null;
  /** altura média do caminho: para onde a câmera olha */
  yMid: number;
  kmToS(km: number): number;
  sToKm(s: number): number;
  /** fração do comprimento real da rota (o `fraction` do catch-up) */
  fractionToS(fraction: number): number;
  pathAt(s: number): PathSample;
  weightsAtKm(km: number): SceneryWeights;
  terrainAt(x: number, z: number): TerrainSample;
};

// ------------------------------------------------------------------ constantes da cena
/** meia largura mínima do S: os nós alternam entre -xHalf e +xHalf, que abre um pouco em dias longos */
export const X_HALF = 14;
export const X_HALF_MAX = 18;
/** o dia (do primeiro ao último nó, em z) fica entre estes dois: esticado quando curto, comprimido quando longo */
export const Z_MIN = 80;
export const Z_MAX = 124;
/** o mínimo de z entre dois nós: cabe uma peça de cada lado sem se cobrirem */
export const NODE_GAP = 24;
/** o toco de estrada antes do primeiro nó e depois do último */
export const STUB = 10;
/** um dia de uma parada só: a reta de um lado ao outro */
export const STUB_SINGLE = Z_MIN / 2;
/** a faixa de cada lado da estrada para as peças, o lago e os parreirais (a peça mais funda tem 16) */
export const SIDE_REACH = 22;
/** a base continua um pouco depois dos tocos */
export const END_MARGIN = 8;
/** um trecho entre dois nós com 3 vezes isto em z (o dia mais curto, `Z_MIN`) ganha 3 curvas em vez de 1 */
export const BEND_MIN_Z = 24;
export const Z_PER_KM = 0.22;
export const Z_PER_CLIMB_M = 0.012;
export const Y_PER_M = 0.024;
export const ROAD_HALF_WIDTH = 1.9;
export const COAST_OFFSET = 22;
export const LAKE_RX = 9;
export const LAKE_RZ = 7.5;
/** transição entre dois cenários vizinhos, em km (metade para cada lado da borda) */
export const BLEND_KM = 2;
/** sem rota, um deslocamento vira quilômetros a esta velocidade */
export const VIRTUAL_KMH = 60;
export const MIN_VIRTUAL_KM = 15;
export const DEFAULT_TRAVEL_MINUTES = 30;
/** até onde as quadras de cidade vão em volta de uma parada de cidade, hotel ou comida */
export const BLOCKS_RADIUS = 26;
/** os tipos de parada que trazem prédios (fase 14: poucas cidades, mais detalhadas) */
export const BLOCK_KINDS: readonly StopKind[] = ['city', 'hotel', 'food'];
export const LAKE_RE = /represa|lago|lagoa|barragem|açude/i;
/** no máximo tantas cidades de passagem por dia, as maiores (decisão 8 de 15/11) */
export const MAX_PLACES = 3;
/** o nome da cidade fica a isto do eixo da estrada */
export const PLACE_OFFSET = 7;
/** o nome da cidade de passagem anda até isto ao longo da estrada, procurando lugar fora das peças */
export const PLACE_REACH = 40;
/** quanto a maquete desce abaixo do chão mais baixo e sobe acima do mais alto (as peças) */
export const BASE_DEPTH = 6;
export const TOP_ROOM = 18;
/** o relevo em volta da estrada sobe no máximo isto acima dela: a câmera conta com essa folga */
export const RELIEF_ROOM = 5;

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
 * Cada parada ganha um km no eixo do layout. Com rota, os pontos de passagem (as paradas do roteiro
 * com coordenada) ficam na quilometragem real dos trechos; a parada que se registrou sozinha (fase
 * 15), que não é ponto de passagem, fica onde a posição dela cai na estrada, entre os vizinhos; as
 * sem coordenada são interpoladas pelos deslocamentos entre as vizinhas, e as que vêm antes da
 * primeira (ou depois da última) com lugar ganham km virtuais. Sem rota, tudo é virtual:
 * deslocamento a 60 km/h, nunca menos que 15 km, para o S ter corpo.
 */
function kmAxis(stops: readonly Stop[], route: LayoutInput['route']): KmAxis {
  const located = stops.flatMap((s, i) => (isWaypoint(s) ? [i] : []));
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
  // a automática: a fração da estrada onde ela cai, presa entre os vizinhos (a ordem da lista manda)
  const anchors = [...located];
  const index = stops.some(isAutoStop) ? indexRoute(route.geometry) : null;
  const realKm = along.at(-1) ?? 0;
  stops.forEach((s, i) => {
    if (!index || !isAutoStop(s) || !isLocated(s)) return;
    const prev = anchors.filter((a) => a < i).at(-1);
    const next = located.find((a) => a > i);
    const lo = prev === undefined ? 0 : (kmAt[prev] ?? 0);
    const hi = next === undefined ? realKm : (kmAt[next] ?? realKm);
    const km = projectOntoRoute(index, [s.lng, s.lat]).fraction * realKm;
    kmAt[i] = Math.min(Math.max(km, lo), Math.max(lo, hi));
    anchors.push(i);
    anchors.sort((x, y) => x - y);
  });
  // entre duas com lugar: proporcional aos deslocamentos informados
  for (let k = 0; k < anchors.length - 1; k++) {
    const a = anchors[k] ?? 0;
    const b = anchors[k + 1] ?? 0;
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
  const first = anchors[0] ?? 0;
  for (let j = first - 1; j >= 0; j--) kmAt[j] = (kmAt[j + 1] ?? 0) - virtualKm(stops[j]);
  const last = anchors.at(-1) ?? 0;
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

/** Quantas curvas (ímpar) um trecho de `L` unidades em z ganha: 1, 3 ou 5, cada uma com pelo menos `BEND_MIN_Z`. */
export function bendsFor(L: number): 1 | 3 | 5 {
  if (L >= 5 * BEND_MIN_Z) return 5;
  if (L >= 3 * BEND_MIN_Z) return 3;
  return 1;
}

/**
 * O trecho entre dois nós, sem o primeiro ponto: um S só, ou três (ou cinco) emendados com a
 * tangente vertical nas juntas, alternando os lados, para a estrada ir e voltar como no esboço.
 */
function segmentPoints(a: XZ, b: XZ): XZ[] {
  const L = b[1] - a[1];
  const bends = bendsFor(L);
  const joints: XZ[] = [a];
  for (let k = 1; k < bends; k++) joints.push([k % 2 === 1 ? b[0] : a[0], a[1] + (L * k) / bends]);
  joints.push(b);
  const out: XZ[] = [];
  for (let k = 0; k < joints.length - 1; k++) {
    const p = joints[k] ?? a;
    const q = joints[k + 1] ?? b;
    const count = Math.max(4, Math.ceil(Math.max(1e-3, q[1] - p[1]) * SAMPLES_PER_UNIT));
    const pts = bezierPoints(p, q, count);
    for (let i = 1; i < pts.length; i++) out.push(pts[i] ?? q);
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
  // o dia inteiro na tela: o comprido comprime, o curto estica, e o S abre um pouco com o comprimento
  const rawEnd = nodeXZ.at(-1)?.z ?? 0;
  const zMax = input.zMax ?? Z_MAX;
  const zScale = rawEnd > zMax ? zMax / rawEnd : rawEnd > 0 && rawEnd < Z_MIN ? Z_MIN / rawEnd : 1;
  const zEnd = rawEnd * zScale;
  const xHalf = clamp(10 + zEnd * 0.06, X_HALF, X_HALF_MAX);
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
  const stub = n <= 1 ? STUB_SINGLE : STUB;
  if (n <= 1) {
    const node = nodeAt(0);
    straight(node.x, node.z - stub, node.z + stub, node.km, false);
    nodeIndex.push(Math.floor((path.length - 1) / 2));
  } else {
    const first = nodeAt(0);
    straight(first.x, first.z - stub, first.z, first.km, false);
    nodeIndex.push(path.length - 1);
    for (let i = 0; i < n - 1; i++) {
      const A = nodeAt(i);
      const B = nodeAt(i + 1);
      const kmOf = segmentKmMap(altAt, A.km, B.km);
      const pts = segmentPoints([A.x, A.z], [B.x, B.z]);
      pts.forEach((p, k) => pushSample(p[0], p[1], kmOf((k + 1) / pts.length)));
      nodeIndex.push(path.length - 1);
    }
    const last = nodeAt(n - 1);
    straight(last.x, last.z, last.z + stub, last.km, true);
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

  const roadHalfWidth = ROAD_HALF_WIDTH;

  // acidentes e peças
  const features: LayoutFeature[] = [];
  const pads: LayoutPad[] = [];
  const stopById = new Map(stops.map((st) => [st.id, st]));
  for (const node of nodes) {
    const side = node.side;
    const [x, y, z] = node.position;
    const box = MINIATURE_BOX[node.kind];
    // a peça do tipo, do lado de fora do S, com a caixa inteira fora da estrada, centrada no nó e com a
    // frente virada para a estrada (um giro pequeno pela semente, para não ficarem todas iguais); numa
    // parada com lago a peça recua em z para a água ficar à frente dela
    const zOff = node.touch === 'lake' ? -(box.w / 2 + 1.5) : 0;
    const px = x + side * (roadHalfWidth + MINIATURE_ROAD_GAP + box.d / 2);
    const pz = z + zOff;
    const stop = stopById.get(node.stop_id);
    features.push({
      kind: 'miniature',
      stop_id: node.stop_id,
      stop: node.kind,
      place_key: stop ? stopPlaceKey(stop) : null,
      x: px,
      z: pz,
      angle: -side * (Math.PI / 2) + (rng() - 0.5) * 0.2,
    });
    pads.push({ x: px, z: pz, r: Math.hypot(box.w, box.d) / 2 + 1.5, y });
    if (node.touch === 'lake') {
      features.push({
        kind: 'lake',
        x: x + side * (roadHalfWidth + MINIATURE_ROAD_GAP + 6),
        z: z + LAKE_RZ + 2,
        rx: LAKE_RX,
        rz: LAKE_RZ,
        level: y - 0.45,
      });
    } else if (node.touch === 'vineyard') {
      // os parreirais atrás da peça (a peça da vinícola já tem os seus)
      features.push({
        kind: 'vineyard',
        x: x + side * 11,
        z: z + box.w / 2 + 9,
        angle: (rng() - 0.5) * 0.6,
        half: 7,
        rowStep: 1.3,
      });
    }
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

  // a caixa da maquete: o traçado com a faixa das peças de cada lado e as pontas
  const bounds = {
    x0: -(xHalf + SIDE_REACH),
    x1: xHalf + SIDE_REACH,
    z0: -(stub + END_MARGIN),
    z1: zEnd + stub + END_MARGIN,
  };
  const ys = path.map((p) => p.y);
  const yMid = ys.reduce((acc, y) => acc + y, 0) / Math.max(1, ys.length);
  const yRange = { y0: Math.min(...ys) - BASE_DEPTH, y1: Math.max(...ys) + TOP_ROOM };

  // as cidades de passagem: as maiores por onde a rota passa, fora dos trechos das paradas
  const places = pickPlaces({
    reading: input.place,
    axis,
    stops,
    totalKm,
    kmToS,
    pathAt,
    path,
    pads,
    roadHalfWidth,
    firstNodeS,
    lastNodeS,
    nodeS: nodes.map((nd) => nd.s),
    cityPieces: input.cityPieces ?? new Set(),
  });

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
    // o piso de cada peça: plano na altura do nó, com uma rampa curta em volta
    for (const pad of pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.r + 5) h = lerp(pad.y, h, smooth(pad.r, pad.r + 5, d));
    }
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
    pads,
    places,
    curiosities,
    bounds,
    yRange,
    seaLevel,
    yMid,
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

// ------------------------------------------------------------------ as cidades de passagem
type PlacesInput = {
  reading: PlaceReading | null;
  axis: KmAxis;
  stops: readonly Stop[];
  totalKm: number;
  kmToS: (km: number) => number;
  pathAt: (s: number) => PathSample;
  path: readonly PathSample[];
  /** os pisos das peças; a peça de uma cidade acrescenta o dela */
  pads: LayoutPad[];
  roadHalfWidth: number;
  firstNodeS: number;
  lastNodeS: number;
  /** o `s` de cada nó: o nome de uma cidade não passa das paradas em volta dela */
  nodeS: readonly number[];
  cityPieces: ReadonlySet<string>;
};

/** O raio do piso da peça de uma cidade (a caixa da cidade, como o das peças das paradas). */
const CITY_BOX = MINIATURE_BOX.city;
const CITY_PAD_R = Math.hypot(CITY_BOX.w, CITY_BOX.d) / 2 + 1.5;

/**
 * Até três cidades de passagem, as mais populosas, nunca no trecho da rota onde há uma parada com
 * coordenada (a pílula dela já diz o lugar). O nome fica no `s` do ponto mais perto do centro do
 * município, do lado de fora da curva, longe dos pisos das peças; quando ali não dá, anda um pouco
 * ao longo do trecho dela. Com o cartão-postal da cidade no catálogo (fase 23), a peça fica atrás do
 * nome, na caixa da cidade, num piso que não cobre nenhum outro piso nem a estrada que volta; sem um
 * lugar assim no trecho, a cidade fica só com o nome. Desde a fase 28 a cidade é a que a estrada
 * atravessa, e o trecho dela é curto (o pedaço da rota dentro do raio da cidade): a que não acha um
 * lugar fora das peças das paradas fica de fora, e entra a seguinte. Três por trecho (o layout é o do
 * trecho), cada nome uma vez (a leitura já não repete).
 */
function pickPlaces(input: PlacesInput): LayoutPlace[] {
  const { reading, axis, stops, totalKm, kmToS, pathAt, pads, roadHalfWidth } = input;
  if (!reading || !axis.hasRoute || reading.places.length === 0) return [];
  const stopM = stops.flatMap((s, i) =>
    isLocated(s) ? [((axis.kmAt[i] ?? 0) - axis.kmOffset) * 1000] : [],
  );
  const candidates: PassingPlace[] = reading.places.filter(
    (p) => !stopM.some((m) => m >= p.from_m - 1 && m <= p.to_m + 1),
  );
  const byPop = [...candidates].sort((a, b) => b.pop - a.pop || a.at_m - b.at_m);
  const clear = (x: number, z: number) =>
    pads.every((pad) => Math.hypot(x - pad.x, z - pad.z) > pad.r + 4);
  // o piso da peça da cidade: fora de todo piso, e a estrada só passa ao lado dele (nenhuma volta do S
  // cruza o piso: toda amostra do caminho perto dele é do mesmo trecho)
  const pieceClear = (x: number, z: number, s: number) =>
    pads.every((pad) => Math.hypot(x - pad.x, z - pad.z) > pad.r + CITY_PAD_R) &&
    input.path.every(
      (q) =>
        Math.hypot(x - q.x, z - q.z) > CITY_PAD_R + roadHalfWidth ||
        Math.abs(q.s - s) <= CITY_PAD_R * 1.6,
    );
  const out: LayoutPlace[] = [];
  for (const p of byPop) {
    if (out.length >= MAX_PLACES) break;
    const key = cityPlaceKey(p.uf, p.name);
    const wantPiece = key !== null && input.cityPieces.has(key);
    const km = clamp(axis.kmOffset + p.at_m / 1000, 0, totalKm);
    const s0 = kmToS(km);
    // o nome anda até 40 unidades ao longo da estrada (fase 28: o trecho de uma cidade atravessada é
    // curto, e num dia longo uns poucos km são menos de uma unidade), sem passar das paradas em volta:
    // a cidade fica entre as mesmas duas paradas
    const sFrom = Math.max(
      input.firstNodeS,
      s0 - PLACE_REACH,
      ...input.nodeS.filter((n) => n <= s0 + 1e-6),
    );
    const sTo = Math.min(
      input.lastNodeS,
      s0 + PLACE_REACH,
      ...input.nodeS.filter((n) => n >= s0 - 1e-6),
    );
    // o nome fora dos pisos vale mais que tudo; depois a peça da cidade; depois fora do meio do S
    const full = wantPiece ? 7 : 5;
    let best: { s: number; score: number } | null = null;
    for (let d = 0; d <= 40; d += 2) {
      for (const s of d === 0 ? [s0] : [s0 - d, s0 + d]) {
        if (s < sFrom - 1e-6 || s > sTo + 1e-6) continue;
        const q = pathAt(s);
        const side: -1 | 1 = q.x < 0 ? -1 : 1;
        const x = q.x + side * (roadHalfWidth + PLACE_OFFSET);
        // fora do piso de toda peça e fora do meio do S (onde a estrada cruza); com peça, o piso dela
        const px = q.x + side * (roadHalfWidth + MINIATURE_ROAD_GAP + CITY_BOX.d / 2);
        const score =
          (clear(x, q.z) ? 4 : 0) +
          (wantPiece && pieceClear(px, q.z, s) ? 2 : 0) +
          (Math.abs(q.x) > 5 ? 1 : 0);
        if (!best || score > best.score) best = { s, score };
        if (score === full) break;
      }
      if (best?.score === full) break;
    }
    // sem um lugar fora dos pisos das peças no trecho dela, a cidade fica de fora (o nome não cobre peça)
    if (!best || (best.score & 4) === 0) continue;
    const s = best.s;
    const q = pathAt(s);
    const side: -1 | 1 = q.x < 0 ? -1 : 1;
    let piece: LayoutPlace['piece'] = null;
    if (wantPiece && (best.score & 2) !== 0) {
      const px = q.x + side * (roadHalfWidth + MINIATURE_ROAD_GAP + CITY_BOX.d / 2);
      piece = { x: px, z: q.z, angle: -side * (Math.PI / 2) };
      pads.push({ x: px, z: q.z, r: CITY_PAD_R, y: q.y });
    }
    out.push({
      name: p.name,
      uf: p.uf,
      pop: p.pop,
      km,
      s,
      side,
      position: [q.x + side * (roadHalfWidth + PLACE_OFFSET), q.y, q.z],
      key,
      piece,
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** Onde a câmera do frame fica, para a cena copiar. */
export { cameraPosition, projectPoint };
