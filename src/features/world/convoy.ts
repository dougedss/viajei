import { haversineM, type LngLat } from '@shared/geo.ts';
import type { TripTrack } from '@/lib/db/schema.ts';
import { isOffRoute, projectOntoRoute, type RouteIndex } from '@/lib/geo/project.ts';

/**
 * O comboio, puro (fase 14): quem do time está em outro carro aparece pequeno na estrada, na última
 * posição que mandou. Em outro carro é estar a mais de 500 m de mim; juntos, nada aparece. Nada de
 * nomes nem rastros: só o carro. Pontos com mais de 30 min não contam (a pessoa parou de
 * compartilhar, ou o aparelho dela dormiu), e sem a minha posição não se decide se estamos juntos.
 */
export const CONVOY_MIN_DISTANCE_M = 500;
export const CONVOY_MAX_AGE_MS = 30 * 60_000;

export type TeamPoint = {
  user_id: string;
  point: LngLat;
  /** epoch em ms */
  t: number;
};

export type ConvoyCar = {
  user_id: string;
  /** fração percorrida da rota do dia, para o layout pôr o carro no caminho */
  fraction: number;
  point: LngLat;
  /** quanto tempo faz, em ms */
  age_ms: number;
  /** a que distância de mim, em metros */
  distance_m: number;
};

/** O último ponto de cada pessoa que compartilha, das trilhas do dia (sem a minha). */
export function teamPoints(tracks: readonly Pick<TripTrack, 'user_id' | 'points'>[]): TeamPoint[] {
  const out: TeamPoint[] = [];
  for (const track of tracks) {
    const points = Array.isArray(track.points) ? track.points : [];
    const last: unknown = points.at(-1);
    if (!Array.isArray(last) || last.length < 3 || !last.every((n) => typeof n === 'number')) {
      continue;
    }
    const [lng, lat, s] = last as [number, number, number];
    out.push({ user_id: track.user_id, point: [lng, lat], t: s * 1000 });
  }
  return out;
}

export function convoy(input: {
  /** a minha posição agora; sem ela, nada aparece */
  me: LngLat | null;
  team: readonly TeamPoint[];
  now: number;
  route: RouteIndex | null;
}): ConvoyCar[] {
  const { me, team, now, route } = input;
  if (!me || !route) return [];
  const out: ConvoyCar[] = [];
  for (const p of team) {
    const age_ms = now - p.t;
    if (age_ms < 0 || age_ms > CONVOY_MAX_AGE_MS) continue;
    const distance_m = haversineM(me, p.point);
    if (distance_m <= CONVOY_MIN_DISTANCE_M) continue;
    const projection = projectOntoRoute(route, p.point);
    if (isOffRoute(projection)) continue;
    out.push({
      user_id: p.user_id,
      fraction: projection.fraction,
      point: p.point,
      age_ms,
      distance_m,
    });
  }
  return out.sort((a, b) => a.fraction - b.fraction);
}
