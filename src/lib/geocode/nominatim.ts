import { db, type GeocodeEntry, type GeocodeResult } from '@/lib/db/schema.ts';

/**
 * Busca de endereço pelo Nominatim (OpenStreetMap). Regras de uso: no máximo 1 requisição por
 * segundo, identificação do app (o navegador manda o Referer) e nunca busca por tecla, só por
 * botão ou pausa de digitação. Os resultados ficam em `geocode` no Dexie, então a mesma consulta
 * nunca vai duas vezes à rede e funciona offline quando já foi feita.
 */
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
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
  return { name, address, lat, lng };
}

async function fetchNominatim(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const url = new URL(ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(LIMIT));
  url.searchParams.set('accept-language', 'pt-BR');
  const res = await fetch(url, { signal: signal ?? null, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as NominatimRow[];
  return rows.map(toResult).filter((r): r is GeocodeResult => r !== null);
}

/** Resultados para uma consulta: do cache quando existe, senão da rede (e aí entram no cache). */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const key = normalizeQuery(query);
  if (key.length < 3) return [];
  const cached = await db.geocode.get(key);
  if (cached) return cached.results;
  const results = await throttled(() => fetchNominatim(key, signal));
  const entry: GeocodeEntry = { query: key, results, fetched_at: new Date().toISOString() };
  await db.geocode.put(entry);
  return results;
}
