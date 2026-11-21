import { viewboxAround } from '@shared/geo.ts';
import { db, type GeocodeEntry, type GeocodeResult } from '@/lib/db/schema.ts';

/**
 * Busca de endereço pelo Nominatim (OpenStreetMap). Regras de uso: no máximo 1 requisição por
 * segundo, identificação do app (o navegador manda o Referer) e nunca busca por tecla, só por
 * botão ou pausa de digitação. Os resultados ficam em `geocode` no Dexie, então a mesma consulta
 * nunca vai duas vezes à rede e funciona offline quando já foi feita.
 *
 * O caminho inverso (fase 15): o lugar de um ponto, uma chamada por parada que se registrou
 * sozinha, pela mesma fila. Sem cache: cada parada é um lugar e uma hora.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const MIN_INTERVAL_MS = 1_100;
const LIMIT = 5;

export const OSM_ATTRIBUTION = 'Dados © colaboradores do OpenStreetMap';

export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

type NominatimRow = {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
};

let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Fila de uma requisição por vez, com 1,1 s entre elas. */
function throttled<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastCall + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
    return run();
  });
  chain = next.catch(() => undefined);
  return next;
}

function toResult(row: NominatimRow): GeocodeResult | null {
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const address = row.display_name ?? '';
  const first = address.split(',')[0]?.trim() ?? '';
  const name = row.name && row.name.trim() !== '' ? row.name : first !== '' ? first : address;
  return {
    name,
    address,
    lat,
    lng,
    ...(row.category ? { category: row.category } : {}),
    ...(row.type ? { type: row.type } : {}),
  };
}

async function fetchNominatim(
  query: string,
  signal?: AbortSignal,
  viewbox?: string,
  /** com o `viewbox`: `true` o torna um filtro (nada de fora); `false`, só uma preferência (D276) */
  bounded = true,
): Promise<GeocodeResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(LIMIT));
  url.searchParams.set('accept-language', 'pt-BR');
  if (viewbox) {
    url.searchParams.set('viewbox', viewbox);
    if (bounded) url.searchParams.set('bounded', '1');
  }
  const res = await fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as NominatimRow[];
  return rows.map(toResult).filter((r): r is GeocodeResult => r !== null);
}

/**
 * O viés de uma busca pelo nome (fase 25, D276): a área preferida em volta de onde a pessoa está (ou de
 * onde sai), que o Nominatim usa para ordenar ("boost"), sem excluir o resto. É o que faz "mafra" ser
 * Mafra/SC antes de Mafra/Lisboa para quem está em Santa Catarina.
 */
export type GeoBias = { near: { lat: number; lng: number }; radiusKm: number };

/**
 * Resultados para uma consulta: do cache quando existe, senão da rede (e aí entram no cache). Com o
 * viés, a chave do cache leva o ponto de referência arredondado a uma casa (uns 10 km): a mesma
 * consulta de dois lugares diferentes não cai na mesma entrada, e as entradas de antes (sem viés)
 * continuam valendo para quem não o passa.
 */
export async function geocode(
  query: string,
  signal?: AbortSignal,
  bias?: GeoBias,
): Promise<GeocodeResult[]> {
  const q = normalizeQuery(query);
  if (q.length < 3) return [];
  const key = bias ? `bias:${bias.near.lat.toFixed(1)},${bias.near.lng.toFixed(1)}:${q}` : q;
  const cached = await db.geocode.get(key);
  if (cached) return cached.results;
  const results = await throttled(() =>
    fetchNominatim(q, signal, bias ? viewboxAround(bias.near, bias.radiusKm) : undefined, false),
  );
  const entry: GeocodeEntry = { query: key, results, fetched_at: new Date().toISOString() };
  await db.geocode.put(entry);
  return results;
}

/**
 * A busca dentro de uma região (fase 17, a conferência dos lugares que a IA propõe): o `viewbox` de
 * um quadrado em volta do centro, `bounded` (nada de fora dele), pela mesma fila de uma requisição por
 * vez e com o mesmo cache (a chave leva a região, arredondada).
 */
export async function searchNear(
  query: string,
  center: { lat: number; lng: number },
  radiusKm: number,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const q = normalizeQuery(query);
  if (q.length < 3) return [];
  const key = `near:${center.lat.toFixed(1)},${center.lng.toFixed(1)},${String(radiusKm)}:${q}`;
  const cached = await db.geocode.get(key);
  if (cached) return cached.results;
  const results = await throttled(() => fetchNominatim(q, signal, viewboxAround(center, radiusKm)));
  await db.geocode.put({ query: key, results, fetched_at: new Date().toISOString() });
  return results;
}

/** A resposta do `/reverse` em `jsonv2`, só com o que o app lê. */
export type ReverseRow = {
  /** a chave do OSM (amenity, tourism, shop, highway, place…) */
  category?: string;
  /** o valor dela (fuel, restaurant, hotel, viewpoint…) */
  type?: string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string>;
  namedetails?: Record<string, string> | null;
};

/**
 * O objeto do OSM mais perto do ponto, no zoom de ponto de interesse (18, o mais detalhado: o posto,
 * o restaurante; sem nada ali, o prédio, a rua ou a estrada), com o endereço e os nomes (o `ref` da
 * rodovia, "BR-116", vem em `namedetails`). `null` quando o OSM não tem nada no ponto; erro de rede
 * ou de servidor sobe como exceção, para quem chama tentar de novo quando a rede voltar.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  /** 18, o ponto de interesse (a parada); 10, a cidade (a posição da saída de hoje, fase 17) */
  zoom = 18,
): Promise<ReverseRow | null> {
  return throttled(async () => {
    const url = new URL(REVERSE_ENDPOINT);
    url.searchParams.set('lat', lat.toFixed(6));
    url.searchParams.set('lon', lng.toFixed(6));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('zoom', String(zoom));
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('accept-language', 'pt-BR');
    const res = await fetch(url, {
      signal: signal ?? null,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const row = (await res.json()) as ReverseRow & { error?: string };
    return row.error ? null : row;
  });
}
