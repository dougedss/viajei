import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import {
  routeErrorSchema,
  routeResponseSchema,
  type RouteErrorCode,
} from '@shared/route-schema.ts';
import { connectivity, useOnline } from '@/lib/db/connectivity.ts';
import { db, type DayRoute, type LngLat, type Stop } from '@/lib/db/schema.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useCachedRoute } from './queries.ts';
import { routeWaypoints } from './rules.ts';

/**
 * A rota real do dia é dado exclusivo de servidor (Edge Function `route-day`), então passa pelo
 * TanStack Query; o resultado vai para `routes` no Dexie, por dia, com o hash das coordenadas.
 * Só recalcula quando as coordenadas mudam ou a pessoa pede. Offline, usa o que está em cache.
 */
export class RouteRequestError extends Error {
  readonly code: RouteErrorCode | 'offline';
  constructor(code: RouteErrorCode | 'offline', message: string) {
    super(message);
    this.code = code;
  }
}

/** FNV-1a sobre as coordenadas com 5 casas (≈ 1 m): muda só quando uma parada muda de lugar. */
export function waypointsHash(waypoints: readonly LngLat[]): string {
  const text = JSON.stringify(waypoints.map(([lng, lat]) => [lng.toFixed(5), lat.toFixed(5)]));
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export async function fetchDayRoute(
  tripId: string,
  dayId: string,
  waypoints: LngLat[],
): Promise<DayRoute> {
  const response = await supabase.functions.invoke<unknown>('route-day', { body: { waypoints } });
  const data: unknown = response.data;
  const error: unknown = response.error;
  if (error) {
    if (error instanceof FunctionsFetchError) {
      connectivity.markOffline();
      throw new RouteRequestError('offline', 'Sem conexão para calcular a rota.');
    }
    let body: unknown = null;
    if (error instanceof FunctionsHttpError) {
      const ctx: unknown = error.context;
      if (ctx instanceof Response) body = await ctx.json().catch(() => null);
    }
    const parsed = routeErrorSchema.safeParse(body);
    throw new RouteRequestError(
      parsed.success ? parsed.data.error.code : 'internal',
      parsed.success ? parsed.data.error.message : 'Não deu para calcular a rota.',
    );
  }
  connectivity.markOnline();
  const parsed = routeResponseSchema.safeParse(data);
  if (!parsed.success)
    throw new RouteRequestError('internal', 'A rota veio num formato inesperado.');
  const route: DayRoute = {
    trip_day_id: dayId,
    trip_id: tripId,
    hash: waypointsHash(waypoints),
    ...parsed.data,
  };
  await db.routes.put(route);
  return route;
}

export type RouteStatus = 'insufficient' | 'ready' | 'loading' | 'offline' | 'error';

export type DayRouteState = {
  route: DayRoute | null;
  /** o cache local já respondeu (com rota ou sem): antes disso ninguém decide nada pela rota */
  loaded: boolean;
  /** a rota em cache não corresponde às paradas de agora */
  stale: boolean;
  status: RouteStatus;
  error: RouteRequestError | null;
  waypointCount: number;
  refresh: () => void;
};

export function useDayRoute(tripId: string, dayId: string, stops: readonly Stop[]): DayRouteState {
  const online = useOnline();
  const cached = useCachedRoute(dayId);
  const waypoints = routeWaypoints(stops).map((w) => w.lngLat);
  const hash = waypointsHash(waypoints);
  const enough = waypoints.length >= 2;
  // `cached` é undefined enquanto o Dexie carrega: nada se decide antes disso
  const stale = enough && cached !== undefined && cached?.hash !== hash;

  const query = useQuery({
    queryKey: ['route', dayId, hash],
    queryFn: () => fetchDayRoute(tripId, dayId, waypoints),
    enabled: online && stale,
    retry: false,
    staleTime: Infinity,
  });

  const route = query.data ?? cached ?? null;
  const queryError: unknown = query.error;
  const error = queryError instanceof RouteRequestError ? queryError : null;
  let status: RouteStatus = 'ready';
  if (!enough) status = 'insufficient';
  else if (query.isFetching) status = 'loading';
  else if (error) status = error.code === 'offline' ? 'offline' : 'error';
  else if (stale && !online) status = 'offline';

  return {
    route,
    loaded: cached !== undefined,
    stale: stale && route?.hash !== hash,
    status,
    error,
    waypointCount: waypoints.length,
    refresh: () => void query.refetch(),
  };
}
