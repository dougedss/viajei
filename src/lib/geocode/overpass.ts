/**
 * O Overpass (a consulta do OpenStreetMap), fase 17: uma consulta por conversa, nunca uma por lugar,
 * dentro da política do serviço público (poucas consultas, nada em lote, com prazo). Do navegador,
 * como o Nominatim: o limite é por IP, e nada passa pelo Supabase. POST com o corpo de formulário (um
 * pedido simples, sem preflight). Quem monta a consulta e lê o resultado é `features/intake/verify.ts`.
 */
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
/** O prazo do servidor está na consulta (`[timeout:20]`); o do app, um pouco acima. */
const DEADLINE_MS = 25_000;

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat: number;
  lng: number;
  tags: Readonly<Record<string, string>>;
};

type Row = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

/**
 * Os elementos com nome e posição (o centro, nas vias e relações). Erro de rede ou HTTP sobe.
 * `userAgent`: fora do navegador (a medição do laboratório, no Node), o cliente se identifica, como
 * a política do serviço pede; sem isso ele responde 406. No navegador, vale o do próprio navegador.
 */
export async function overpass(
  query: string,
  options: { signal?: AbortSignal; userAgent?: string } = {},
): Promise<OsmElement[]> {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}),
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: options.signal ?? AbortSignal.timeout(DEADLINE_MS),
  });
  if (!res.ok) throw new Error(`Overpass ${String(res.status)}`);
  const json = (await res.json()) as { elements?: Row[] };
  return (json.elements ?? []).flatMap((e): OsmElement[] => {
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    const type = e.type === 'node' || e.type === 'way' || e.type === 'relation' ? e.type : null;
    if (type === null || e.id === undefined || lat === undefined || lng === undefined || !e.tags)
      return [];
    return [{ type, id: e.id, lat, lng, tags: e.tags }];
  });
}
