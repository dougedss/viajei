/**
 * Geometria de rota, pura e compartilhada entre a Edge Function `route-day` (Deno) e o client
 * (`lib/geo`): distâncias, comprimento acumulado, simplificação e amostragem. Coordenadas na
 * ordem do GeoJSON, [lng, lat], com a altitude opcional no terceiro lugar.
 */
export type LngLat = [number, number];
export type LngLatAlt = [number, number, number];

const EARTH_R = 6371008.8;
const DEG = Math.PI / 180;
/** metros por grau de latitude */
const M_PER_DEG = (EARTH_R * Math.PI) / 180;

/** Distância em metros pela fórmula de haversine (exata o bastante em qualquer escala). */
export function haversineM(a: readonly number[], b: readonly number[]): number {
  const [lng1 = 0, lat1 = 0] = a;
  const [lng2 = 0, lat2 = 0] = b;
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Projeção equirretangular local em metros, centrada em `lat0`: barata para milhares de pontos. */
export function toXY(p: readonly number[], lat0: number): [number, number] {
  const [lng = 0, lat = 0] = p;
  return [lng * M_PER_DEG * Math.cos(lat0 * DEG), lat * M_PER_DEG];
}

/** Distância aproximada em metros (equirretangular); boa até algumas centenas de km. */
export function fastDistanceM(a: readonly number[], b: readonly number[]): number {
  const lat0 = ((a[1] ?? 0) + (b[1] ?? 0)) / 2;
  const [ax, ay] = toXY(a, lat0);
  const [bx, by] = toXY(b, lat0);
  return Math.hypot(ax - bx, ay - by);
}

/** Distância acumulada em cada vértice: [0, d01, d01+d12, …]. */
export function cumulativeM(coords: readonly (readonly number[])[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    out.push((out[i - 1] ?? 0) + haversineM(coords[i - 1] ?? [], coords[i] ?? []));
  }
  return out;
}

export function lengthM(coords: readonly (readonly number[])[]): number {
  return cumulativeM(coords).at(-1) ?? 0;
}

/** Distância de `p` ao segmento `ab`, em metros, no plano local. */
function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Douglas-Peucker com tolerância em metros. Mantém a forma das curvas e tira os vértices que não
 * mudam o desenho; o terceiro valor (altitude), quando existe, acompanha o vértice mantido.
 */
export function simplify<T extends readonly number[]>(
  coords: readonly T[],
  toleranceM: number,
): T[] {
  if (coords.length <= 2) return [...coords];
  const lat0 = (coords[0]?.[1] ?? 0 + (coords.at(-1)?.[1] ?? 0)) / 2;
  const xy = coords.map((c) => toXY(c, lat0));
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const top = stack.pop();
    if (!top) break;
    const [first, last] = top;
    let maxD = 0;
    let index = -1;
    const a = xy[first];
    const b = xy[last];
    if (!a || !b) continue;
    for (let i = first + 1; i < last; i++) {
      const p = xy[i];
      if (!p) continue;
      const d = segmentDistance(p, a, b);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index !== -1 && maxD > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return coords.filter((_, i) => keep[i] === 1);
}

/** Ponto a `dist` metros do início, interpolado no traçado. Fora do intervalo, prende nas pontas. */
export function pointAtM(
  coords: readonly (readonly number[])[],
  cum: readonly number[],
  dist: number,
): number[] {
  const first = coords[0];
  const last = coords.at(-1);
  if (!first || !last) return [];
  if (dist <= 0) return [...first];
  const total = cum.at(-1) ?? 0;
  if (dist >= total) return [...last];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) <= dist) lo = mid;
    else hi = mid;
  }
  const a = coords[lo] ?? first;
  const b = coords[hi] ?? last;
  const span = (cum[hi] ?? 0) - (cum[lo] ?? 0);
  const t = span === 0 ? 0 : (dist - (cum[lo] ?? 0)) / span;
  return a.map((v, i) => v + ((b[i] ?? v) - v) * t);
}

export type Sample = { dist_m: number; point: number[] };

/** Amostras a cada `stepM` metros a partir do início, mais o ponto final. */
export function sampleEveryM(coords: readonly (readonly number[])[], stepM: number): Sample[] {
  const cum = cumulativeM(coords);
  const total = cum.at(-1) ?? 0;
  const out: Sample[] = [];
  for (let d = 0; d < total; d += stepM) out.push({ dist_m: d, point: pointAtM(coords, cum, d) });
  out.push({ dist_m: total, point: pointAtM(coords, cum, total) });
  return out;
}

/** Fração percorrida (0 a 1), distância ao traçado em metros e o índice do segmento mais perto. */
export function projectOntoLine(
  coords: readonly (readonly number[])[],
  cum: readonly number[],
  p: readonly number[],
): { fraction: number; distance_m: number; index: number } {
  const lat0 = p[1] ?? 0;
  const q = toXY(p, lat0);
  let best = { distance_m: Number.POSITIVE_INFINITY, index: 0, along: 0 };
  for (let i = 0; i < coords.length - 1; i++) {
    const a = toXY(coords[i] ?? [], lat0);
    const b = toXY(coords[i + 1] ?? [], lat0);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy));
    if (d < best.distance_m) {
      const segLen = (cum[i + 1] ?? 0) - (cum[i] ?? 0);
      best = { distance_m: d, index: i, along: (cum[i] ?? 0) + t * segLen };
    }
  }
  const total = cum.at(-1) ?? 0;
  if (coords.length === 1) {
    return { fraction: 0, distance_m: haversineM(coords[0] ?? [], p), index: 0 };
  }
  return {
    fraction: total === 0 ? 0 : best.along / total,
    distance_m: best.distance_m,
    index: best.index,
  };
}
