import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import {
  routeErrorSchema,
  routeResponseSchema,
  type RouteErrorCode,
} from '@shared/route-schema.ts';
import { connectivity, useOnline } from '@/lib/db/connectivity.ts';
import { db, type DayRoute, type LngLat, type Stop } from '@/lib/db/schema.ts';
import { waypointsHash } from './route-hash.ts';
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

export { waypointsHash } from './route-hash.ts';

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

/**
 * As rotas que faltam na viagem, ou que não valem mais para as paradas de agora (outro hash), uma por
 * vez. Serve às telas que mostram a viagem inteira (o mapa e a retrospectiva, D124): o resto do app
 * busca a rota do dia aberto pelo `useDayRoute`.
 */
export async function fetchMissingRoutes(
  tripId: string,
  days: readonly { day: { id: string }; stops: readonly Stop[] }[],
  routes: readonly Pick<DayRoute, 'trip_day_id' | 'hash'>[],
): Promise<void> {
  for (const { day, stops } of days) {
    const wps = routeWaypoints(stops).map((w) => w.lngLat);
    if (wps.length < 2) continue;
    const hash = waypointsHash(wps);
    if (routes.some((r) => r.trip_day_id === day.id && r.hash === hash)) continue;
    await fetchDayRoute(tripId, day.id, wps).catch(() => undefined);
  }
}

/** Uma vez por tela aberta, com rede e com as paradas e as rotas guardadas já lidas. */
export function useMissingRoutes(
  tripId: string,
  days: readonly { day: { id: string }; stops: readonly Stop[] }[],
  routes: readonly Pick<DayRoute, 'trip_day_id' | 'hash'>[] | undefined,
  ready: boolean,
): void {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !ready || !routes || !connectivity.canTry()) return;
    asked.current = true;
    void fetchMissingRoutes(tripId, days, routes);
  }, [tripId, days, routes, ready]);
}
