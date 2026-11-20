import { z } from 'zod';
import { APP_USER_AGENT } from './constants.ts';

/**
 * As fontes públicas de um cartão-postal (fase 23), com `fetch` injetado (o Vitest liga fixtures):
 *  - **Nominatim** (nominatim.openstreetmap.org): o objeto do OSM da parada (`/lookup` com as
 *    `extratags`, que trazem o item do Wikidata, e o contorno em planta), a busca pelo nome perto de
 *    uma coordenada (`/search`) e a busca de uma cidade. A política de uso (conferida em 20/11/2026):
 *    no máximo 1 pedido por segundo, um User-Agent que identifique a aplicação, resultados em cache
 *    (o catálogo é o cache: um lugar é identificado uma vez na vida do app).
 *  - **Wikidata** (`Special:EntityData/Q….json` e `wbsearchentities`): a imagem (P18), a categoria do
 *    Commons (P373), a coordenada (P625) e as medidas quando há (P2048 altura, P2049 largura, P2043
 *    comprimento).
 *  - **Commons** (a Action API): os arquivos de uma categoria e o `imageinfo` com a URL da miniatura
 *    de 1.568 px e o `extmetadata` (a licença, o autor, o crédito). **Só licença livre** entra como
 *    referência; o autor, a licença e a URL ficam no registro da peça, nunca na tela.
 * Todas as chamadas em série, com o User-Agent do app, `Accept-Encoding: gzip` (o Deno negocia) e
 * `maxlag=5` nas da Action API (ninguém espera por elas). Nenhum pixel das fotos vai além da IA.
 */
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
export const WIKIDATA_URL = 'https://www.wikidata.org';
export const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
/** A largura da miniatura que a IA vê (o lado maior que a API da Anthropic usa sem reduzir). */
export const PHOTO_WIDTH = 1568;
export const PHOTO_MAX_BYTES = 3_000_000;
export const MAX_PHOTOS = 3;
const TIMEOUT_MS = 12_000;
/** O intervalo mínimo entre dois pedidos ao Nominatim (a política: 1 por segundo). */
export const NOMINATIM_GAP_MS = 1_100;

export type SourceFetch = typeof fetch;

export class SourceError extends Error {
  readonly source: 'nominatim' | 'wikidata' | 'commons';
  readonly status: number;
  constructor(source: SourceError['source'], status: number, detail: string) {
    super(detail);
    this.source = source;
    this.status = status;
  }
}

/** Uma fila de uma chamada por vez, com o intervalo mínimo de cada serviço. */
export function pacer(
  now: () => number = Date.now,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
) {
  const last = new Map<string, number>();
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(lane: string, gapMs: number, run: () => Promise<T>): Promise<T> => {
    const next = chain.then(async () => {
      const wait = (last.get(lane) ?? -Infinity) + gapMs - now();
      if (wait > 0) await sleep(wait);
      last.set(lane, now());
      return run();
    });
    chain = next.catch(() => undefined);
    return next;
  };
}
export type Pacer = ReturnType<typeof pacer>;

async function getJson<T>(
  fetchFn: SourceFetch,
  source: SourceError['source'],
  url: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, {
      headers: { 'User-Agent': APP_USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new SourceError(source, 0, err instanceof Error ? err.message : String(err));
  }
  if (!res.ok) throw new SourceError(source, res.status, `${source} ${String(res.status)}`);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new SourceError(source, res.status, `${source} fora do formato`);
  return parsed.data;
}

// ------------------------------------------------------------------ Nominatim
const nominatimPlaceSchema = z.object({
  osm_type: z.enum(['node', 'way', 'relation']),
  osm_id: z.number().int(),
  lat: z.string(),
  lon: z.string(),
  name: z.string().optional(),
  display_name: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  addresstype: z.string().optional(),
  boundingbox: z.array(z.string()).length(4).optional(),
  extratags: z.record(z.string(), z.string()).nullable().optional(),
  geojson: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
});
export type OsmPlace = {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
  type: string;
  wikidata: string | null;
  wikipedia: string | null;
  height_m: number | null;
  /** o contorno em planta (o anel de fora de um `Polygon`), em [lng, lat] */
  outline: [number, number][] | null;
  bbox: [number, number, number, number] | null;
};

function outlineOf(
  geojson: { type: string; coordinates: unknown } | undefined,
): [number, number][] | null {
  if (!geojson) return null;
  const ring =
    geojson.type === 'Polygon'
      ? (geojson.coordinates as unknown[])[0]
      : geojson.type === 'MultiPolygon'
        ? ((geojson.coordinates as unknown[])[0] as unknown[] | undefined)?.[0]
        : null;
  if (!Array.isArray(ring)) return null;
  const pts = ring.flatMap((p): [number, number][] =>
    Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' ? [[p[0], p[1]]] : [],
  );
  return pts.length >= 4 ? pts : null;
}

function toPlace(raw: z.infer<typeof nominatimPlaceSchema>): OsmPlace {
  const tags = raw.extratags ?? {};
  const height = Number.parseFloat((tags.height ?? '').replace(',', '.'));
  const bb = raw.boundingbox?.map(Number);
  return {
    osm_type: raw.osm_type,
    osm_id: raw.osm_id,
    name: raw.name ?? (raw.display_name ?? '').split(',')[0]?.trim() ?? '',
    lat: Number.parseFloat(raw.lat),
    lng: Number.parseFloat(raw.lon),
    category: raw.category ?? '',
    type: raw.type ?? '',
    wikidata: tags.wikidata && /^Q\d{1,12}$/.test(tags.wikidata) ? tags.wikidata : null,
    wikipedia: tags.wikipedia ?? null,
    height_m: Number.isFinite(height) && height > 0 ? height : null,
    outline: outlineOf(raw.geojson),
    bbox:
      bb?.length === 4 && bb.every(Number.isFinite)
        ? [bb[0] ?? 0, bb[1] ?? 0, bb[2] ?? 0, bb[3] ?? 0]
        : null,
  };
}

const OSM_LETTER = { node: 'N', way: 'W', relation: 'R' } as const;

/** O objeto do OSM pelo id, com as `extratags` e o contorno em planta. */
export async function lookupOsm(
  fetchFn: SourceFetch,
  type: 'node' | 'way' | 'relation',
  id: number,
): Promise<OsmPlace | null> {
  const url = `${NOMINATIM_URL}/lookup?osm_ids=${OSM_LETTER[type]}${String(id)}&format=jsonv2&extratags=1&polygon_geojson=1&namedetails=1`;
  const rows = await getJson(fetchFn, 'nominatim', url, z.array(nominatimPlaceSchema));
  return rows[0] ? toPlace(rows[0]) : null;
}

/** A busca pelo nome, perto de uma coordenada (a caixa de ~5 km) ou solta, até `limit` resultados. */
export async function searchOsm(
  fetchFn: SourceFetch,
  query: string,
  near: { lat: number; lng: number; km?: number } | null,
  limit = 6,
): Promise<OsmPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    extratags: '1',
    polygon_geojson: '1',
    limit: String(limit),
    'accept-language': 'pt-BR,pt',
  });
  if (near) {
    const d = (near.km ?? 5) / 111;
    params.set(
      'viewbox',
      [near.lng - d, near.lat + d, near.lng + d, near.lat - d].map((v) => v.toFixed(4)).join(','),
    );
    params.set('bounded', '1');
  }
  const rows = await getJson(
    fetchFn,
    'nominatim',
    `${NOMINATIM_URL}/search?${params.toString()}`,
    z.array(nominatimPlaceSchema),
  );
  return rows.map(toPlace);
}

/** A distância em metros entre duas coordenadas. */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** O contorno em metros locais (x para leste, z para o sul: a planta vista de cima), simplificado. */
export function outlineToMeters(
  outline: readonly [number, number][],
  center: { lat: number; lng: number },
  maxPoints = 40,
): [number, number][] {
  const kx = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const kz = 110_540;
  const pts = outline.map(([lng, lat]): [number, number] => [
    Math.round((lng - center.lng) * kx * 10) / 10,
    Math.round(-(lat - center.lat) * kz * 10) / 10,
  ]);
  const closed =
    pts.length > 1 && pts[0]?.[0] === pts.at(-1)?.[0] && pts[0]?.[1] === pts.at(-1)?.[1]
      ? pts.slice(0, -1)
      : pts;
  if (closed.length <= maxPoints) return closed;
  const step = closed.length / maxPoints;
  return Array.from({ length: maxPoints }, (_, i) => closed[Math.floor(i * step)] ?? [0, 0]);
}

// ------------------------------------------------------------------ Wikidata
const claimValue = z.object({
  mainsnak: z.object({
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const entitySchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      labels: z.record(z.string(), z.object({ value: z.string() })).optional(),
      descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(),
      claims: z.record(z.string(), z.array(claimValue)).optional(),
    }),
  ),
});
export type WikidataItem = {
  id: string;
  label: string;
  description: string;
  image: string | null;
  category: string | null;
  coord: { lat: number; lng: number } | null;
  /** altura, largura e comprimento em metros, quando o item os tem */
  height_m: number | null;
  width_m: number | null;
  length_m: number | null;
  /** o município (P131) e o país (P17), como Q-ids */
  admin: string[];
};

function amount(v: unknown): number | null {
  const amt = (v as { amount?: string; unit?: string } | undefined)?.amount;
  const n = amt ? Number.parseFloat(amt) : Number.NaN;
  const unit = (v as { unit?: string } | undefined)?.unit ?? '';
  // só metros (Q11573); outra unidade não entra na conta
  return Number.isFinite(n) && n > 0 && unit.endsWith('/Q11573') ? n : null;
}

export async function wikidataItem(
  fetchFn: SourceFetch,
  qid: string,
): Promise<WikidataItem | null> {
  const data = await getJson(
    fetchFn,
    'wikidata',
    `${WIKIDATA_URL}/wiki/Special:EntityData/${qid}.json`,
    entitySchema,
  );
  const e = data.entities[qid] ?? Object.values(data.entities)[0];
  if (!e) return null;
  const claim = (p: string): unknown => e.claims?.[p]?.[0]?.mainsnak.datavalue?.value;
  const coordV = claim('P625') as { latitude?: number; longitude?: number } | undefined;
  const ids = (p: string) =>
    (e.claims?.[p] ?? []).flatMap((c) => {
      const id = (c.mainsnak.datavalue?.value as { id?: string } | undefined)?.id;
      return id ? [id] : [];
    });
  return {
    id: qid,
    label: e.labels?.pt?.value ?? e.labels?.en?.value ?? '',
    description: e.descriptions?.pt?.value ?? e.descriptions?.en?.value ?? '',
    image: typeof claim('P18') === 'string' ? (claim('P18') as string) : null,
    category: typeof claim('P373') === 'string' ? (claim('P373') as string) : null,
    coord:
      coordV && typeof coordV.latitude === 'number' && typeof coordV.longitude === 'number'
        ? { lat: coordV.latitude, lng: coordV.longitude }
        : null,
    height_m: amount(claim('P2048')),
    width_m: amount(claim('P2049')),
    length_m: amount(claim('P2043')),
    admin: [...ids('P131'), ...ids('P17')],
  };
}

const searchSchema = z.object({
  search: z.array(
    z.object({ id: z.string(), label: z.string().optional(), description: z.string().optional() }),
  ),
});
/** Os itens que casam com um nome, em português (até 5). */
export async function wikidataSearch(
  fetchFn: SourceFetch,
  name: string,
): Promise<{ id: string; label: string; description: string }[]> {
  const params = new URLSearchParams({
    action: 'wbsearchentities',
    search: name,
    language: 'pt',
    uselang: 'pt',
    type: 'item',
    limit: '5',
    format: 'json',
    maxlag: '5',
  });
  const data = await getJson(
    fetchFn,
    'wikidata',
    `${WIKIDATA_URL}/w/api.php?${params.toString()}`,
    searchSchema,
  );
  return data.search.map((s) => ({
    id: s.id,
    label: s.label ?? '',
    description: s.description ?? '',
  }));
}

// ------------------------------------------------------------------ Commons
/**
 * As grafias de licença livre que o `extmetadata.LicenseShortName` devolve (conferidas num arquivo
 * real em 20/11/2026: `CC BY-SA 2.0`; as outras pela documentação do Commons): CC0, domínio público,
 * CC BY e CC BY-SA em qualquer versão. Fora disso, o arquivo não serve de referência.
 */
export function isFreeLicense(shortName: string | null | undefined): boolean {
  if (!shortName) return false;
  const s = shortName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'cc0' || s.startsWith('cc0 ') || s.startsWith('cc0-')) return true;
  if (s === 'public domain' || s === 'pd' || s.startsWith('pd-') || s.startsWith('public domain '))
    return true;
  if (/^cc[ -]by(-sa)?([ -]\d\.\d)?([ -][a-z]{2,3})?$/.test(s)) return true;
  if (/^cc[ -]by-sa[ -]\d\.\d/.test(s) || /^cc[ -]by[ -]\d\.\d/.test(s)) return true;
  return false;
}

const imageInfoSchema = z.object({
  query: z
    .object({
      pages: z.record(
        z.string(),
        z.object({
          title: z.string(),
          imageinfo: z
            .array(
              z.object({
                url: z.string(),
                thumburl: z.string().optional(),
                thumbwidth: z.number().optional(),
                thumbheight: z.number().optional(),
                width: z.number().optional(),
                height: z.number().optional(),
                mime: z.string().optional(),
                extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).optional(),
              }),
            )
            .optional(),
        }),
      ),
    })
    .optional(),
});
export type CommonsPhoto = {
  title: string;
  url: string;
  thumb: string;
  width: number;
  height: number;
  mime: string;
  license: string;
  license_url: string | null;
  artist: string | null;
  credit: string | null;
};

function text(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  // o autor vem com HTML às vezes: só o texto, curto
  const t = v.replace(/<[^>]+>/g, '').trim();
  return t ? t.slice(0, 200) : null;
}

/** O `imageinfo` de até 20 arquivos (os títulos em lote com `|`), com a licença e o autor. */
export async function commonsImageInfo(
  fetchFn: SourceFetch,
  titles: readonly string[],
): Promise<CommonsPhoto[]> {
  if (titles.length === 0) return [];
  const params = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(PHOTO_WIDTH),
    iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit',
    titles: titles
      .slice(0, 20)
      .map((t) => (t.startsWith('File:') ? t : `File:${t}`))
      .join('|'),
    format: 'json',
    maxlag: '5',
  });
  const data = await getJson(
    fetchFn,
    'commons',
    `${COMMONS_API_URL}?${params.toString()}`,
    imageInfoSchema,
  );
  // só os arquivos pedidos (os títulos como a API os normaliza: `File:`, espaços no lugar de `_`)
  const wanted = new Set(titles.map((t) => normalizeTitle(t)));
  const out: CommonsPhoto[] = [];
  for (const page of Object.values(data.query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    if (!wanted.has(normalizeTitle(page.title))) continue;
    if (!info?.thumburl || !info.mime?.startsWith('image/')) continue;
    const meta = info.extmetadata ?? {};
    out.push({
      title: page.title,
      url: info.url,
      thumb: info.thumburl,
      width: info.width ?? 0,
      height: info.height ?? 0,
      mime: info.mime,
      license: text(meta.LicenseShortName?.value) ?? '',
      license_url: text(meta.LicenseUrl?.value),
      artist: text(meta.Artist?.value),
      credit: text(meta.Credit?.value),
    });
  }
  return out;
}

/** `File:Nome_do_arquivo.jpg` e `Nome do arquivo.jpg` são o mesmo título. */
export function normalizeTitle(title: string): string {
  const bare = title
    .replace(/^File:/i, '')
    .replace(/_/g, ' ')
    .trim();
  return `File:${bare.charAt(0).toUpperCase()}${bare.slice(1)}`;
}

const membersSchema = z.object({
  query: z.object({ categorymembers: z.array(z.object({ title: z.string() })) }).optional(),
});
/** Os arquivos de uma categoria do Commons (até 20). */
export async function commonsCategoryFiles(
  fetchFn: SourceFetch,
  category: string,
): Promise<string[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'categorymembers',
    cmtitle: category.startsWith('Category:') ? category : `Category:${category}`,
    cmtype: 'file',
    cmlimit: '20',
    format: 'json',
    maxlag: '5',
  });
  const data = await getJson(
    fetchFn,
    'commons',
    `${COMMONS_API_URL}?${params.toString()}`,
    membersSchema,
  );
  return (data.query?.categorymembers ?? []).map((m) => m.title);
}

/**
 * As fotos de referência: a imagem do item (P18) primeiro, depois as da categoria, só com licença
 * livre, as maiores e mais largas primeiro (uma fachada se vê melhor em paisagem), até três; JPEG,
 * PNG ou WebP (o que a IA lê).
 */
export function pickPhotos(p18: string | null, photos: readonly CommonsPhoto[]): CommonsPhoto[] {
  const readable = (p: CommonsPhoto) => ['image/jpeg', 'image/png', 'image/webp'].includes(p.mime);
  const free = photos.filter((p) => isFreeLicense(p.license) && readable(p));
  const main = p18 ? free.find((p) => p.title === `File:${p18.replace(/^File:/, '')}`) : undefined;
  const rest = free
    .filter((p) => p !== main)
    .sort(
      (a, b) =>
        b.width * b.height * (b.width >= b.height ? 1.4 : 1) -
        a.width * a.height * (a.width >= a.height ? 1.4 : 1),
    );
  return [...(main ? [main] : []), ...rest].slice(0, MAX_PHOTOS);
}

export type PhotoBytes = {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp';
  data: string;
  photo: CommonsPhoto;
};

/** Baixa a miniatura de uma foto (com o User-Agent do app) e a devolve em base64, para a IA e só. */
export async function downloadPhoto(
  fetchFn: SourceFetch,
  photo: CommonsPhoto,
): Promise<PhotoBytes | null> {
  let res: Response;
  try {
    res = await fetchFn(photo.thumb, {
      headers: { 'User-Agent': APP_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const mime = (res.headers.get('content-type') ?? photo.mime).split(';')[0]?.trim() ?? photo.mime;
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > PHOTO_MAX_BYTES) return null;
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return { media_type: mime, data: btoa(bin), photo };
}

/** O que fica no registro da peça (jsonb `sources`): só título, autor, licença e URL. Nunca pixels. */
export function sourcesRecord(input: {
  wikidata: string | null;
  photos: readonly CommonsPhoto[];
  outline: 'osm' | 'none';
  modeled: { osm_type: string; osm_id: number; name: string } | null;
}) {
  return {
    wikidata: input.wikidata,
    outline: input.outline,
    modeled: input.modeled,
    photos: input.photos.map((p) => ({
      title: p.title,
      url: p.url,
      license: p.license,
      license_url: p.license_url,
      artist: p.artist,
      credit: p.credit,
    })),
  };
}
