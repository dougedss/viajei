import { z } from 'zod';
import {
  PLACES_DAILY_LIMIT,
  placesRequestSchema,
  type Place,
  type PlacesErrorCode,
  type PlacesInput,
  type PlacesResponse,
} from './places-schema.ts';

/**
 * O handler da `find-places` (fase 24), sem Deno e sem rede, como o da `plan-trip`: o `index.ts` liga
 * a chave, o banco da pessoa (a cota pela `edge_call`) e o `fetch`; o Vitest liga um `fetch` de
 * mentira. Cada palavra do nome é uma busca na Places API da Geoapify (o círculo por GET, o corredor
 * da rota por POST com a linha em GeoJSON e a faixa em metros), juntas pelo `place_id`. A chave vai
 * no cabeçalho `x-api-key`, nunca na URL, no log nem na resposta. Sem chave, `no_source` antes de
 * gastar cota: o app diz que não deu para buscar no mapa e oferece a busca por nome. O log é uma
 * linha de números e o código, nada da pessoa (nem a posição, nem as palavras).
 */
export const GEOAPIFY_PLACES_URL = 'https://api.geoapify.com/v2/places';
const TIMEOUT_MS = 15_000;

export type PlacesDeps = {
  key: string | undefined;
  /** a cota da pessoa: `ok`, ou `limit` quando passou dos 60 em 24 h */
  claim: () => Promise<'ok' | 'limit'>;
  fetch: typeof fetch;
  log: (line: string) => void;
  now?: () => number;
};

class ProviderError extends Error {
  readonly code: PlacesErrorCode;
  readonly status: number;
  constructor(code: PlacesErrorCode, status: number, detail: string) {
    super(detail);
    this.code = code;
    this.status = status;
  }
}

function fail(status: number, code: PlacesErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

// a resposta da Geoapify: um GeoJSON de pontos, só com o que o app usa (o resto passa)
const featureSchema = z.object({
  properties: z
    .object({
      place_id: z.string(),
      name: z.string().optional(),
      lat: z.number(),
      lon: z.number(),
      categories: z.array(z.string()).optional(),
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      formatted: z.string().optional(),
      opening_hours: z.string().optional(),
      website: z.string().optional(),
      distance: z.number().optional(),
      datasource: z
        .object({
          raw: z
            .object({
              name: z.string().optional(),
              osm_id: z.number().optional(),
              osm_type: z.string().optional(),
              opening_hours: z.string().optional(),
              website: z.string().optional(),
            })
            .loose()
            .optional(),
        })
        .loose()
        .optional(),
    })
    .loose(),
});
const collectionSchema = z.object({ features: z.array(z.unknown()) });

const OSM_TYPES = { n: 'node', w: 'way', r: 'relation' } as const;
const text = (s: string | undefined, max: number): string | null => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

/** Um ponto da Geoapify como lugar do app; sem nome, não é um lugar que se escolhe. */
export function placeOf(raw: unknown): Place | null {
  const parsed = featureSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data.properties;
  const r = p.datasource?.raw;
  const name = text(p.name ?? r?.name, 200);
  if (!name) return null;
  const osmType = r?.osm_type ? OSM_TYPES[r.osm_type as keyof typeof OSM_TYPES] : undefined;
  return {
    id: p.place_id.slice(0, 512),
    name,
    lat: p.lat,
    lng: p.lon,
    categories: (p.categories ?? []).slice(0, 60),
    city: text(p.city ?? p.town ?? p.village, 120),
    address: text(p.formatted, 300),
    opening_hours: text(p.opening_hours ?? r?.opening_hours, 300),
    website: text(p.website ?? r?.website, 500),
    osm:
      osmType && r?.osm_id !== undefined && Number.isInteger(r.osm_id)
        ? { type: osmType, id: r.osm_id }
        : null,
    distance_m: p.distance !== undefined && p.distance >= 0 ? p.distance : null,
  };
}

/** O pedido de uma busca à Geoapify: o círculo por GET, o corredor por POST (a linha em GeoJSON). */
export function geoapifyRequest(
  input: PlacesInput,
  name: string | null,
  key: string,
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { 'x-api-key': key, accept: 'application/json' };
  if (input.area.type === 'circle') {
    const url = new URL(GEOAPIFY_PLACES_URL);
    url.searchParams.set('categories', input.categories.join(','));
    const { lng, lat, radius_m } = input.area;
    url.searchParams.set('filter', `circle:${String(lng)},${String(lat)},${String(radius_m)}`);
    if (input.near) {
      url.searchParams.set('bias', `proximity:${String(input.near.lng)},${String(input.near.lat)}`);
    }
    if (name) url.searchParams.set('name', name);
    url.searchParams.set('limit', String(input.limit));
    url.searchParams.set('lang', 'pt');
    return { url: url.toString(), init: { method: 'GET', headers } };
  }
  const body = {
    categories: input.categories,
    filter: {
      type: 'polyline',
      geometry: { type: 'LineString', coordinates: input.area.line },
      buffer: input.area.buffer_m,
    },
    ...(input.near
      ? { bias: { type: 'proximity', lon: input.near.lng, lat: input.near.lat } }
      : {}),
    ...(name ? { name } : {}),
    limit: input.limit,
    lang: 'pt',
  };
  return {
    url: GEOAPIFY_PLACES_URL,
    init: {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  };
}

async function search(
  deps: PlacesDeps,
  key: string,
  input: PlacesInput,
  name: string | null,
): Promise<Place[]> {
  const { url, init } = geoapifyRequest(input, name, key);
  let res: Response;
  try {
    res = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new ProviderError('provider_failed', 502, err instanceof Error ? err.name : 'fetch');
  }
  // a chave que não vale é como não ter fonte: o app segue pela busca por nome
  if (res.status === 401 || res.status === 403) throw new ProviderError('no_source', 503, 'key');
  if (res.status === 429) throw new ProviderError('provider_quota', 503, 'quota');
  if (!res.ok) throw new ProviderError('provider_failed', 502, `http ${String(res.status)}`);
  const parsed = collectionSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ProviderError('provider_failed', 502, 'format');
  return parsed.data.features.map(placeOf).filter((p): p is Place => p !== null);
}

/** As buscas juntas: uma por palavra do nome (ou uma só), sem repetir o mesmo lugar. */
export function mergePlaces(lists: readonly (readonly Place[])[]): Place[] {
  const byId = new Map<string, Place>();
  for (const list of lists) for (const p of list) if (!byId.has(p.id)) byId.set(p.id, p);
  const all = [...byId.values()];
  return all.every((p) => p.distance_m !== null)
    ? all.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
    : all;
}

export async function handlePlaces(req: Request, deps: PlacesDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return fail(405, 'invalid_input', 'Use POST.');
  const parsed = placesRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, 'invalid_input', 'Pedido fora do formato esperado.');
  const input = parsed.data;
  const line = (status: string, places: number, requests: number) =>
    deps.log(
      `find-places status=${status} area=${input.area.type} categories=${String(input.categories.length)} names=${String(input.names.length)} requests=${String(requests)} places=${String(places)} ms=${String(Math.round(now() - startedAt))}`,
    );

  if (!deps.key) {
    line('no_source', 0, 0);
    return fail(503, 'no_source', 'A busca no mapa ainda não está ligada.');
  }
  let claim: 'ok' | 'limit';
  try {
    claim = await deps.claim();
  } catch {
    line('internal', 0, 0);
    return fail(500, 'internal', 'Não deu para conferir o limite.');
  }
  if (claim === 'limit') {
    line('daily_limit', 0, 0);
    return fail(
      429,
      'daily_limit',
      `Você já fez ${String(PLACES_DAILY_LIMIT)} buscas no mapa hoje. Amanhã libera de novo.`,
    );
  }

  const names = input.names.length > 0 ? input.names : [null];
  try {
    const key = deps.key;
    const lists = await Promise.all(names.map((name) => search(deps, key, input, name)));
    const places = mergePlaces(lists);
    line('ok', places.length, names.length);
    const body: PlacesResponse = {
      provider: 'geoapify',
      fetched_at: new Date(now()).toISOString(),
      places,
    };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const e =
      err instanceof ProviderError ? err : new ProviderError('provider_failed', 502, 'internal');
    line(e.code, 0, names.length);
    const message =
      e.code === 'no_source'
        ? 'A busca no mapa ainda não está ligada.'
        : e.code === 'provider_quota'
          ? 'A busca no mapa chegou ao limite de hoje. Tente mais tarde.'
          : 'O mapa não respondeu agora. Tente de novo em instantes.';
    return fail(e.status, e.code, message);
  }
}
