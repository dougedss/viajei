import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import {
  cumulativeM,
  pointAtM,
  sampleEveryM,
  simplify,
  type LngLat,
  type LngLatAlt,
} from '../_shared/geo.ts';
import {
  ELEVATION_STEP_M,
  GEOMETRY_TOLERANCE_M,
  ROUTE_DAILY_LIMIT,
  routeRequestSchema,
  type RouteErrorCode,
  type RouteResponse,
} from '../_shared/route-schema.ts';

/**
 * route-day: a rota real de um dia (traçado por estrada, distância e duração por trecho,
 * altitude ao longo do caminho). Roda como o usuário (`auth: 'user'`, RLS vale), sem chave
 * secreta do Supabase. Produção: OpenRouteService pela HeiGIT API, com `ORS_API_KEY` em
 * `supabase secrets`. Desenvolvimento ou sem chave: OSRM público para a geometria e Open-Meteo
 * para a altitude. Se o ORS falhar por cota ou erro, cai no OSRM e diz qual provedor respondeu.
 * Limite: 50 chamadas por pessoa em 24 h, contadas por `edge_call` em `edge_calls`.
 */
const ORS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving/';
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';
const TIMEOUT_MS = 25_000;
const USER_AGENT = 'Viajei/0.1 (route-day)';

class NoRouteError extends Error {}
class ProviderError extends Error {}

function fail(status: number, code: RouteErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const toLngLat = (c: readonly number[]): LngLat => [round6(c[0] ?? 0), round6(c[1] ?? 0)];

/** Perfil de altitude a cada 2 km mais o fim, a partir de coordenadas que já trazem altitude. */
function profileFrom3D(coords: readonly LngLatAlt[]): [number, number][] {
  return sampleEveryM(coords, ELEVATION_STEP_M).map((s) => [
    Math.round(s.dist_m),
    Math.round((s.point[2] ?? 0) * 10) / 10,
  ]);
}

// ----------------------------------------------------------------- OpenRouteService (HeiGIT)
const orsSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
        properties: z.object({
          segments: z.array(z.object({ distance: z.number(), duration: z.number() })).optional(),
        }),
      }),
    )
    .min(1),
});

async function ors(key: string, waypoints: LngLat[]): Promise<RouteResponse> {
  const res = await fetch(ORS_URL, {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    // instructions: true porque sem elas o ORS omite os segments (distância e duração por trecho);
    // os passos vêm junto e são descartados aqui, nunca chegam ao celular
    body: JSON.stringify({ coordinates: waypoints, elevation: true, instructions: true }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    // códigos 2009 (sem rota) e 2010 (ponto longe de qualquer estrada) são do pedido, não do provedor
    if (res.status === 404 && /"code"\s*:\s*20(?:09|10)/.test(body)) throw new NoRouteError(body);
    throw new ProviderError(`ORS ${res.status}: ${body.slice(0, 200)}`);
  }
  const parsed = orsSchema.safeParse(await res.json());
  if (!parsed.success) throw new ProviderError('ORS: resposta fora do formato esperado');
  const feature = parsed.data.features[0]!;
  const coords = feature.geometry.coordinates;
  const coords3: LngLatAlt[] = coords.map((c) => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0]);
  const segments = feature.properties.segments ?? [];
  if (segments.length !== waypoints.length - 1) {
    throw new ProviderError(`ORS: ${segments.length} trechos para ${waypoints.length} pontos`);
  }
  return {
    provider: 'ors',
    fetched_at: new Date().toISOString(),
    geometry: simplify(coords3, GEOMETRY_TOLERANCE_M).map(toLngLat),
    legs: segments.map((s) => ({
      distance_m: Math.round(s.distance),
      duration_s: Math.round(s.duration),
    })),
    elevation: profileFrom3D(coords3),
  };
}

// ------------------------------------------------------------------ OSRM público + Open-Meteo
const osrmSchema = z.object({
  code: z.string(),
  routes: z
    .array(
      z.object({
        geometry: z.object({ coordinates: z.array(z.array(z.number()).min(2)) }),
        legs: z.array(z.object({ distance: z.number(), duration: z.number() })),
      }),
    )
    .optional(),
});

const openMeteoSchema = z.object({ elevation: z.array(z.number()) });

async function openMeteo(points: readonly (readonly number[])[]): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 100) {
    const batch = points.slice(i, i + 100);
    const url = new URL(OPEN_METEO_URL);
    url.searchParams.set('latitude', batch.map((p) => (p[1] ?? 0).toFixed(5)).join(','));
    url.searchParams.set('longitude', batch.map((p) => (p[0] ?? 0).toFixed(5)).join(','));
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ProviderError(`Open-Meteo ${res.status}`);
    const parsed = openMeteoSchema.safeParse(await res.json());
    if (!parsed.success || parsed.data.elevation.length !== batch.length) {
      throw new ProviderError('Open-Meteo: resposta fora do formato esperado');
    }
    out.push(...parsed.data.elevation);
  }
  return out;
}

async function osrm(waypoints: LngLat[]): Promise<RouteResponse> {
  const path = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const res = await fetch(`${OSRM_URL}${path}?overview=full&geometries=geojson&steps=false`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const parsed = osrmSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success)
    throw new ProviderError(`OSRM ${res.status}: resposta fora do formato esperado`);
  if (parsed.data.code === 'NoRoute' || parsed.data.code === 'NoSegment')
    throw new NoRouteError(parsed.data.code);
  const route = parsed.data.routes?.[0];
  if (parsed.data.code !== 'Ok' || !route) throw new ProviderError(`OSRM: ${parsed.data.code}`);
  const coords: LngLat[] = route.geometry.coordinates.map(toLngLat);
  const samples = sampleEveryM(coords, ELEVATION_STEP_M);
  const alts = await openMeteo(samples.map((s) => s.point));
  return {
    provider: 'osrm+open-meteo',
    fetched_at: new Date().toISOString(),
    geometry: simplify(coords, GEOMETRY_TOLERANCE_M),
    legs: route.legs.map((l) => ({
      distance_m: Math.round(l.distance),
      duration_s: Math.round(l.duration),
    })),
    elevation: samples.map((s, i) => [Math.round(s.dist_m), Math.round((alts[i] ?? 0) * 10) / 10]),
  };
}

async function resolveRoute(key: string | undefined, waypoints: LngLat[]): Promise<RouteResponse> {
  if (key) {
    try {
      return await ors(key, waypoints);
    } catch (err) {
      if (err instanceof NoRouteError) throw err;
      console.warn('ORS falhou, caindo no OSRM:', err instanceof Error ? err.message : err);
    }
  }
  return osrm(waypoints);
}

// --------------------------------------------------------------------------------- handler
export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'invalid_input', 'Use POST.');
    const body: unknown = await req.json().catch(() => null);
    const parsed = routeRequestSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'invalid_input', 'Envie de 2 a 25 pontos [lng, lat].');

    const { error } = await ctx.supabase.rpc('edge_call', {
      p_fn: 'route-day',
      p_limit: ROUTE_DAILY_LIMIT,
    });
    if (error) {
      if (error.code === '54000') {
        return fail(
          429,
          'daily_limit',
          `Você já calculou ${ROUTE_DAILY_LIMIT} rotas hoje. Amanhã libera de novo.`,
        );
      }
      return fail(500, 'internal', error.message);
    }

    try {
      const route = await resolveRoute(
        Deno.env.get('ORS_API_KEY') || undefined,
        parsed.data.waypoints,
      );
      return Response.json(route, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      if (err instanceof NoRouteError)
        return fail(422, 'no_route', 'Não achei estrada entre essas paradas.');
      console.error('route-day:', err);
      return fail(
        502,
        'provider_failed',
        'O serviço de rotas não respondeu. Tente de novo em instantes.',
      );
    }
  }),
};
