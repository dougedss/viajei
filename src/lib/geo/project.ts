import { cumulativeM, projectOntoLine, type LngLat } from '@shared/geo.ts';

export type RouteIndex = { coords: readonly LngLat[]; cum: number[]; total_m: number };

/** Prepara a rota uma vez (distâncias acumuladas) para projetar muitos pontos nela. */
export function indexRoute(geometry: readonly LngLat[]): RouteIndex {
  const cum = cumulativeM(geometry);
  return { coords: geometry, cum, total_m: cum.at(-1) ?? 0 };
}

export type Projection = {
  /** fração percorrida, 0 a 1 */
  fraction: number;
  /** metros desde o início da rota */
  along_m: number;
  /** distância do ponto ao traçado, em metros */
  distance_m: number;
};

/** Onde um ponto cai na rota: a fração percorrida e a que distância está do traçado. */
export function projectOntoRoute(route: RouteIndex, point: LngLat): Projection {
  const p = projectOntoLine(route.coords, route.cum, point);
  return {
    fraction: p.fraction,
    along_m: p.fraction * route.total_m,
    distance_m: p.distance_m,
  };
}

/** Mais de 2 km do traçado é "fora da rota" (sem recálculo: o carrinho aparece fora da trilha). */
export const OFF_ROUTE_M = 2000;

export function isOffRoute(projection: Projection): boolean {
  return projection.distance_m > OFF_ROUTE_M;
}

/**
 * Dois trechos da rota a menos disto do mesmo ponto são a mesma estrada (a ida e a volta): o GPS e a
 * simplificação do traçado (25 m de cada lado) não distinguem um do outro, e vale o primeiro.
 */
export const SAME_ROAD_M = 60;

// a projeção num trecho, em metros num plano local em volta do ponto (as distâncias são curtas)
const M_PER_DEG = 111_320;
function onSegment(
  a: LngLat,
  b: LngLat,
  p: LngLat,
  cosLat: number,
): { t: number; distance_m: number } {
  const ax = (a[0] - p[0]) * M_PER_DEG * cosLat;
  const ay = (a[1] - p[1]) * M_PER_DEG;
  const dx = (b[0] - a[0]) * M_PER_DEG * cosLat;
  const dy = (b[1] - a[1]) * M_PER_DEG;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return { t, distance_m: Math.hypot(ax + t * dx, ay + t * dy) };
}

/**
 * Onde um ponto cai na rota **dali em diante** (fase 24): só os trechos a partir de `floor_m` (o
 * lugar da última parada concluída, ou de onde o carro já estava) contam, e entre os que ficam a até
 * 2 km do ponto vale o primeiro que é a mesma estrada do mais perto. Numa ida e volta pela mesma
 * estrada, o ponto mais perto da rota inteira é a ida quando o carro está na volta, e a fração andava
 * para trás (46% → 28% → 11% → 0% no teste de 15/11); com o piso, ela nunca anda para trás enquanto o
 * carro segue a rota. Nada a até 2 km dali em diante: o carro saiu da rota, e vale o ponto mais perto
 * da rota inteira, como antes.
 */
export function projectFrom(route: RouteIndex, point: LngLat, floor_m: number): Projection {
  const floor = Math.max(0, Math.min(floor_m, route.total_m));
  const { coords, cum } = route;
  if (coords.length < 2 || route.total_m === 0) return projectOntoRoute(route, point);
  const cosLat = Math.cos((point[1] * Math.PI) / 180);
  const near: { along_m: number; distance_m: number }[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const from = cum[i] ?? 0;
    const to = cum[i + 1] ?? 0;
    if (to < floor) continue;
    const b = coords[i + 1];
    let a = coords[i];
    if (!a || !b) continue;
    let start = from;
    // o trecho que o piso corta começa no piso
    if (from < floor && to > from) {
      const k = (floor - from) / (to - from);
      a = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      start = floor;
    }
    const hit = onSegment(a, b, point, cosLat);
    if (hit.distance_m > OFF_ROUTE_M) continue;
    near.push({ along_m: start + hit.t * (to - start), distance_m: hit.distance_m });
  }
  if (near.length === 0) return projectOntoRoute(route, point);
  const closest = Math.min(...near.map((n) => n.distance_m));
  const first = near.find((n) => n.distance_m <= closest + SAME_ROAD_M) ?? near[0];
  const along = first?.along_m ?? floor;
  return {
    fraction: along / route.total_m,
    along_m: along,
    distance_m: first?.distance_m ?? closest,
  };
}

/** Um trecho da `route-day`: a distância entre dois pontos de passagem consecutivos. */
export type RouteLegLength = { distance_m: number };

/**
 * Onde cada ponto de passagem fica na rota (fase 24): a soma dos trechos até ele, na escala do
 * traçado (os trechos são a distância do provedor; o traçado simplificado mede um pouco menos). A
 * saída e a chegada em casa têm a mesma coordenada; pelo ponto mais perto, as duas caíam no começo da
 * rota, e "Vocês passaram por Chegada em…?" aparecia ao sair de casa. `waypoints` são os ids, na
 * ordem da rota. Sem trechos que batam com eles (a rota guardada de antes de uma parada mudar),
 * `null`: quem chama projeta pelo ponto mais perto, como antes.
 */
export function waypointAlongs(
  route: RouteIndex,
  legs: readonly RouteLegLength[] | null,
  waypoints: readonly string[],
): Map<string, number> | null {
  if (!legs || legs.length === 0 || legs.length !== waypoints.length - 1) return null;
  const sum = legs.reduce((n, l) => n + l.distance_m, 0);
  if (sum <= 0) return null;
  const scale = route.total_m / sum;
  const out = new Map<string, number>();
  let acc = 0;
  waypoints.forEach((id, i) => {
    out.set(id, Math.min(route.total_m, acc * scale));
    acc += legs[i]?.distance_m ?? 0;
  });
  return out;
}
