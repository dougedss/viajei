import type { LngLat } from '@shared/geo.ts';
import type { Stop, TripTrack } from '@/lib/db/schema.ts';
import { ARRIVAL_RADIUS_M, isWithin, type Fix } from './geofence.ts';
import {
  indexRoute,
  isOffRoute,
  OFF_ROUTE_M,
  projectOntoRoute,
  type RouteIndex,
} from './project.ts';

/**
 * Catch-up ao abrir (e ao voltar do plano de fundo), puro: uma leitura de posição, ou nenhuma,
 * vira onde o carro está, o que marcar sozinho e o que perguntar. Nunca inventa horário: o
 * `autoArrive` usa a hora de agora (com desfazer), e as `passed` são perguntas, não marcações.
 *
 * Sem posição, a melhor estimativa é o último ponto da trilha mais recente de quem compartilha
 * posição (o mapa aberto em outro aparelho) ou, na falta dela, a última parada concluída pelo time.
 */
export type PositionSource = 'gps' | 'team-track' | 'last-done';

export type CatchupPosition = {
  /** fração percorrida da rota do dia (0 a 1); null sem rota */
  fraction: number | null;
  /** a mais de 2 km do traçado: o carrinho aparece fora da trilha, sem recálculo */
  offRoute: boolean;
  /** distância ao traçado, em metros; null sem rota */
  distanceM: number | null;
  source: PositionSource;
  point: LngLat;
};

export type CatchupInput = {
  /** paradas ativas do dia, em ordem */
  stops: readonly Stop[];
  /** última concluída (onde o carro está) e próxima, do dayState */
  at: Stop | null;
  next: Stop | null;
  /** rota real do dia, quando existe em cache */
  route: readonly LngLat[] | null;
  /** a leitura de posição deste aparelho, ou null (sem permissão, sem sinal, tempo esgotado) */
  fix: Fix | null;
  /** trilhas do dia de quem compartilha posição (sem a própria) */
  teamTracks: readonly Pick<TripTrack, 'user_id' | 'points'>[];
};

export type CatchupResult = {
  position: CatchupPosition | null;
  /** no raio da próxima: marcar Chegamos! com toast "Desfazer" */
  autoArrive: Stop | null;
  /** paradas que ficaram para trás sem marcação: perguntar, com hora ajustável */
  passed: Stop[];
};

/** Uma parada só conta como "passada" quando o carro está pelo menos isto adiante dela na rota. */
export const PASSED_MARGIN_M = 500;

type Located = Stop & { lat: number; lng: number };
function located(stop: Stop): stop is Located {
  return stop.lat !== null && stop.lng !== null;
}

type TrackPoint = [number, number, number];
function isTrackPoint(p: unknown): p is TrackPoint {
  return Array.isArray(p) && p.length >= 3 && p.every((n) => typeof n === 'number');
}

/** O último ponto da trilha mais recente (maior carimbo), entre as de quem compartilha. */
export function latestTeamPoint(
  tracks: readonly Pick<TripTrack, 'points'>[],
): { point: LngLat; t: number } | null {
  let best: { point: LngLat; t: number } | null = null;
  for (const track of tracks) {
    const points = Array.isArray(track.points) ? track.points : [];
    const last = points.at(-1);
    if (!isTrackPoint(last)) continue;
    if (!best || last[2] > best.t) best = { point: [last[0], last[1]], t: last[2] };
  }
  return best;
}

function project(route: RouteIndex | null, point: LngLat, source: PositionSource): CatchupPosition {
  if (!route) return { fraction: null, offRoute: false, distanceM: null, source, point };
  const p = projectOntoRoute(route, point);
  return {
    fraction: p.fraction,
    offRoute: isOffRoute(p),
    distanceM: p.distance_m,
    source,
    point,
  };
}

export function catchup(input: CatchupInput): CatchupResult {
  const route = input.route && input.route.length >= 2 ? indexRoute(input.route) : null;

  let position: CatchupPosition | null = null;
  if (input.fix) {
    position = project(route, [input.fix.lng, input.fix.lat], 'gps');
  } else {
    const team = latestTeamPoint(input.teamTracks);
    if (team) position = project(route, team.point, 'team-track');
    else if (input.at && located(input.at)) {
      position = project(route, [input.at.lng, input.at.lat], 'last-done');
    }
  }

  // Chegamos! automático só com a posição deste aparelho, dentro do raio da próxima
  const next = input.next;
  const autoArrive =
    input.fix && next && located(next) && isWithin(input.fix, next, ARRIVAL_RADIUS_M) ? next : null;

  // Passou por paradas sem marcar: só com GPS e rota, e só o que ficou claramente para trás
  let passed: Stop[] = [];
  if (input.fix && route && position && !position.offRoute && position.fraction !== null) {
    const alongM = position.fraction * route.total_m;
    passed = input.stops.filter((stop) => {
      if (stop.done_at !== null || stop.skipped || !located(stop)) return false;
      if (stop.id === autoArrive?.id) return false;
      const p = projectOntoRoute(route, [stop.lng, stop.lat]);
      return p.distance_m <= OFF_ROUTE_M && alongM - p.along_m >= PASSED_MARGIN_M;
    });
  }

  return { position, autoArrive, passed };
}
