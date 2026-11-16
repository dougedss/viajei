import type { LngLat } from '@shared/geo.ts';
import type { Stop, TripTrack } from '@/lib/db/schema.ts';
import { ARRIVAL_RADIUS_M, isWithin, type Fix } from './geofence.ts';
import {
  indexRoute,
  isOffRoute,
  OFF_ROUTE_M,
  projectFrom,
  projectOntoRoute,
  waypointAlongs,
  type RouteIndex,
  type RouteLegLength,
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
  /** os metros percorridos da rota do dia; null sem rota */
  alongM: number | null;
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
  /**
   * rota real do dia, quando existe em cache: o traçado e os trechos (um por par de pontos de
   * passagem, como a `route-day` devolve), que dizem onde cada parada fica na rota
   */
  route: { geometry: readonly LngLat[]; legs?: readonly RouteLegLength[] | null } | null;
  /** a leitura de posição deste aparelho, ou null (sem permissão, sem sinal, tempo esgotado) */
  fix: Fix | null;
  /** trilhas do dia de quem compartilha posição (sem a própria) */
  teamTracks: readonly Pick<TripTrack, 'user_id' | 'points'>[];
  /** a chegada em casa do dia (o `dayState`): nunca é uma parada "passada" */
  arrivalId?: string | null;
  /**
   * onde o carro já estava na rota nesta tela (metros), enquanto a última concluída é a mesma: a
   * fração nunca anda para trás dele (fase 24)
   */
  floor_m?: number | null;
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
/** ponto de passagem da rota: uma parada do roteiro com coordenada (a automática não é) */
const isWaypoint = (stop: Stop): stop is Located => located(stop) && stop.source !== 'auto';

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

function project(
  route: RouteIndex | null,
  point: LngLat,
  source: PositionSource,
  floor_m: number,
): CatchupPosition {
  if (!route)
    return { fraction: null, alongM: null, offRoute: false, distanceM: null, source, point };
  const p = projectFrom(route, point, floor_m);
  return {
    fraction: p.fraction,
    alongM: p.along_m,
    offRoute: isOffRoute(p),
    distanceM: p.distance_m,
    source,
    point,
  };
}

/**
 * Onde cada parada fica na rota, em metros: os pontos de passagem pelos trechos da rota (a saída no
 * começo, a chegada em casa no fim, mesmo com a mesma coordenada); as outras com coordenada, pelo
 * ponto mais perto (a rota guardada que não bate com as paradas, a parada automática).
 */
export function stopAlongs(stops: readonly Stop[], route: RouteIndex, legs: CatchupInput['route']) {
  const waypoints = stops.filter(isWaypoint);
  const byLeg = waypointAlongs(
    route,
    legs?.legs ?? null,
    waypoints.map((w) => w.id),
  );
  const out = new Map<string, number>();
  for (const stop of stops) {
    if (!located(stop)) continue;
    const along = byLeg?.get(stop.id);
    out.set(stop.id, along ?? projectOntoRoute(route, [stop.lng, stop.lat]).along_m);
  }
  return out;
}

export function catchup(input: CatchupInput): CatchupResult {
  const geometry = input.route?.geometry ?? null;
  const route = geometry && geometry.length >= 2 ? indexRoute(geometry) : null;
  const alongs = route ? stopAlongs(input.stops, route, input.route) : new Map<string, number>();

  // o piso: o lugar da última concluída que tem lugar na rota, ou de onde o carro já estava
  const lastDone = input.stops.filter((s) => s.done_at !== null && alongs.has(s.id)).at(-1);
  const floor = Math.max(lastDone ? (alongs.get(lastDone.id) ?? 0) : 0, input.floor_m ?? 0);

  let position: CatchupPosition | null = null;
  if (input.fix) {
    position = project(route, [input.fix.lng, input.fix.lat], 'gps', floor);
  } else {
    const team = latestTeamPoint(input.teamTracks);
    if (team) position = project(route, team.point, 'team-track', floor);
    else if (input.at && located(input.at)) {
      const at = alongs.get(input.at.id);
      position =
        route && at !== undefined
          ? {
              fraction: at / route.total_m,
              alongM: at,
              offRoute: false,
              distanceM: 0,
              source: 'last-done',
              point: [input.at.lng, input.at.lat],
            }
          : project(route, [input.at.lng, input.at.lat], 'last-done', floor);
    }
  }

  // Chegamos! automático só com a posição deste aparelho, dentro do raio da próxima
  const next = input.next;
  const autoArrive =
    input.fix && next && located(next) && isWithin(input.fix, next, ARRIVAL_RADIUS_M) ? next : null;

  // Passou por paradas sem marcar: só com GPS e rota, só o que ficou claramente para trás, e só em
  // ordem a partir da próxima (fase 24): a primeira que o carro ainda não passou encerra a lista, e a
  // chegada em casa nunca é "passada" (ela é o fim do caminho)
  const passed: Stop[] = [];
  if (input.fix && route && position && !position.offRoute && position.fraction !== null) {
    const alongM = position.fraction * route.total_m;
    for (const stop of input.stops) {
      if (stop.done_at !== null || stop.skipped) continue;
      if (stop.id === input.arrivalId || stop.id === autoArrive?.id) break;
      const at = alongs.get(stop.id);
      if (at === undefined || !located(stop)) continue;
      const near = projectOntoRoute(route, [stop.lng, stop.lat]).distance_m <= OFF_ROUTE_M;
      if (!near || alongM - at < PASSED_MARGIN_M) break;
      passed.push(stop);
    }
  }

  return { position, autoArrive, passed };
}
