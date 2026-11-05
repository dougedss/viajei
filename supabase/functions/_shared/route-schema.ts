import { z } from 'zod';

/**
 * Contrato da Edge Function `route-day`, o mesmo Zod no servidor e no client.
 * Entrada: as coordenadas das paradas do dia, em ordem, [lng, lat] como no GeoJSON.
 */
export const lngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const routeRequestSchema = z.object({
  waypoints: z.array(lngLatSchema).min(2).max(25),
});
export type RouteRequest = z.infer<typeof routeRequestSchema>;

export const routeLegSchema = z.object({
  distance_m: z.number().nonnegative(),
  duration_s: z.number().nonnegative(),
});

export const ROUTE_PROVIDERS = ['ors', 'osrm+open-meteo'] as const;

export const routeResponseSchema = z.object({
  provider: z.enum(ROUTE_PROVIDERS),
  fetched_at: z.string(),
  /** traçado por estrada, simplificado (Douglas-Peucker, 25 m) */
  geometry: z.array(lngLatSchema).min(2),
  /** um trecho por par de paradas consecutivas */
  legs: z.array(routeLegSchema).min(1),
  /** [distância percorrida em m, altitude em m], a cada 2 km mais o fim */
  elevation: z.array(z.tuple([z.number(), z.number()])),
});
export type RouteResponse = z.infer<typeof routeResponseSchema>;

export const ROUTE_ERROR_CODES = [
  'invalid_input',
  'no_route',
  'daily_limit',
  'provider_failed',
  'unauthorized',
  'internal',
] as const;
export type RouteErrorCode = (typeof ROUTE_ERROR_CODES)[number];

export const routeErrorSchema = z.object({
  error: z.object({ code: z.enum(ROUTE_ERROR_CODES), message: z.string() }),
});
export type RouteError = z.infer<typeof routeErrorSchema>;

/** Limite por pessoa, em 24 h móveis, guardado em `edge_calls`. */
export const ROUTE_DAILY_LIMIT = 50;
/** Passo da amostra de altitude. */
export const ELEVATION_STEP_M = 2000;
/** Tolerância da simplificação do traçado. */
export const GEOMETRY_TOLERANCE_M = 25;
