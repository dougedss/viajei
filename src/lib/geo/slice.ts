import type { LngLat } from '@shared/geo.ts';

/**
 * O corte de uma rota entre dois pontos dela (fase 28: o mapa por trechos), puro. O traçado sai pelas
 * distâncias acumuladas dele (`cum`, as de `indexRoute`), com as pontas interpoladas; o perfil de
 * altitude sai pela distância dele e volta a contar do zero no começo do corte. Quem decide onde cortar
 * (os trechos da `route-day`, a soma dos `legs` até cada ponto de passagem) é `travel-mode/legs.ts`.
 */

/** O ponto a `at` metros do começo do traçado, na reta entre os dois vértices em volta. */
function pointAt(coords: readonly LngLat[], cum: readonly number[], at: number): LngLat {
  const first = coords[0] ?? [0, 0];
  if (at <= 0 || coords.length < 2) return [first[0], first[1]];
  const last = coords.at(-1) ?? first;
  const total = cum.at(-1) ?? 0;
  if (at >= total) return [last[0], last[1]];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((cum[mid] ?? 0) <= at) lo = mid;
    else hi = mid;
  }
  const a = coords[lo] ?? first;
  const b = coords[hi] ?? last;
  const span = (cum[hi] ?? 0) - (cum[lo] ?? 0);
  const t = span > 0 ? (at - (cum[lo] ?? 0)) / span : 0;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * O traçado entre `from_m` e `to_m`: o ponto do começo, os vértices de dentro e o ponto do fim. Sempre
 * com pelo menos dois pontos (um corte de comprimento zero repete o ponto), porque é o que a maquete e a
 * leitura do lugar pedem de uma rota.
 */
export function cutLine(
  coords: readonly LngLat[],
  cum: readonly number[],
  from_m: number,
  to_m: number,
): LngLat[] {
  const a = Math.min(from_m, to_m);
  const b = Math.max(from_m, to_m);
  const out: LngLat[] = [pointAt(coords, cum, a)];
  coords.forEach((p, i) => {
    const d = cum[i] ?? 0;
    if (d > a && d < b) out.push([p[0], p[1]]);
  });
  out.push(pointAt(coords, cum, b));
  return out;
}

/**
 * O perfil de altitude (`[distância em m, altitude em m]`, em ordem) entre `from_m` e `to_m`, com a
 * altitude das pontas interpolada e a distância contada do começo do corte. Sem perfil, nada.
 */
export function cutProfile(
  profile: readonly (readonly [number, number])[],
  from_m: number,
  to_m: number,
): [number, number][] {
  if (profile.length === 0) return [];
  const a = Math.min(from_m, to_m);
  const b = Math.max(from_m, to_m);
  const altAt = (m: number): number => {
    const first = profile[0] ?? [0, 0];
    const last = profile.at(-1) ?? first;
    if (m <= first[0]) return first[1];
    if (m >= last[0]) return last[1];
    for (let i = 1; i < profile.length; i++) {
      const q = profile[i] ?? last;
      if (q[0] < m) continue;
      const p = profile[i - 1] ?? first;
      const span = q[0] - p[0];
      return span > 0 ? p[1] + ((q[1] - p[1]) * (m - p[0])) / span : q[1];
    }
    return last[1];
  };
  const out: [number, number][] = [[0, altAt(a)]];
  for (const [d, alt] of profile) if (d > a && d < b) out.push([d - a, alt]);
  out.push([b - a, altAt(b)]);
  return out;
}
