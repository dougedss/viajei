import type { DayRoute, LngLat, Stop } from '@/lib/db/schema.ts';
import { fnv64 } from '@/lib/ids/hash.ts';
import { routeWaypoints } from './rules.ts';

/**
 * O cache da rota real, puro (sem o client do Supabase, para as regras e os testes importarem): o hash
 * das coordenadas que geraram uma rota (FNV-1a sobre as coordenadas com 5 casas, ≈ 1 m; muda só quando
 * uma parada muda de lugar) e o que falta buscar.
 */
export function waypointsHash(waypoints: readonly LngLat[]): string {
  return fnv64(JSON.stringify(waypoints.map(([lng, lat]) => [lng.toFixed(5), lat.toFixed(5)])));
}

/** O mesmo hash, das paradas com coordenada, na ordem do dia. */
export function waypointsHashOf(stops: readonly { lat: number; lng: number }[]): string {
  return waypointsHash(stops.map((s): LngLat => [s.lng, s.lat]));
}

/**
 * As rotas que faltam na viagem, ou que não valem mais para as paradas de agora (outro hash): o dia,
 * os waypoints e uma chave (dia e hash) que diz se já foi pedida.
 */
export function missingRoutes(
  days: readonly { day: { id: string }; stops: readonly Stop[] }[],
  routes: readonly Pick<DayRoute, 'trip_day_id' | 'hash'>[],
): { dayId: string; waypoints: LngLat[]; key: string }[] {
  return days.flatMap(({ day, stops }) => {
    const waypoints = routeWaypoints(stops).map((w) => w.lngLat);
    if (waypoints.length < 2) return [];
    const hash = waypointsHash(waypoints);
    return routes.some((r) => r.trip_day_id === day.id && r.hash === hash)
      ? []
      : [{ dayId: day.id, waypoints, key: `${day.id}:${hash}` }];
  });
}
