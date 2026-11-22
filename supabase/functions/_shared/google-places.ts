import { z } from 'zod';
import { isGoogleType } from './google-types.ts';
import {
  BUSINESS_STATUSES,
  type BusinessStatus,
  type GooglePlacesInput,
  type OpeningPeriod,
  type Place,
  type PlacesErrorCode,
} from './places-schema.ts';

/**
 * A fonte de lugares do Google (fase 27): a Text Search da Places API (New), sem Deno e sem rede, no
 * molde do `places-handler.ts` (o `fetch` vem por injeção; o Vitest liga um de mentira). A chave vai
 * no cabeçalho `X-Goog-Api-Key`, nunca na URL, no log nem na resposta; o field mask é obrigatório e
 * explícito (sem ele a API devolve erro), e **define o preço**: um campo Enterprise na máscara (a nota,
 * as avaliações, o horário, o site) cobra o pedido inteiro como Enterprise (US$ 35 por mil, com 1.000
 * grátis por mês, pela página de preços lida em 22/11/2026). É o que o Douglas pediu nos cartões: a
 * máscara é a Enterprise, e o Place Details não entra (tudo vem na busca). A documentação lida em 22/11:
 * `developers.google.com/maps/documentation/places/web-service/text-search` e a referência do recurso
 * `places` (o `displayName` como `{ text }`, os `addressComponents` com `longText` e `types`, os
 * `periods` com `day` 0 = domingo e sem `close` quando é 24 h).
 */
export const GOOGLE_PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
export const GOOGLE_TIMEOUT_MS = 15_000;

/**
 * Os campos pedidos, registrados: os Essentials (`id`, `location`, `formattedAddress`, `types`), os Pro
 * (`displayName`, `addressComponents`, `primaryType`, `businessStatus`, `googleMapsUri`) e os
 * Enterprise (`rating`, `userRatingCount`, `regularOpeningHours`, `currentOpeningHours`,
 * `websiteUri`), que decidem a faixa de preço do pedido inteiro.
 */
export const GOOGLE_FIELD_MASK: readonly string[] = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
  'places.types',
  'places.primaryType',
  'places.businessStatus',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.currentOpeningHours',
  'places.websiteUri',
];

/** Um erro da fonte, com o código do contrato e o status HTTP da resposta da função. */
export class ProviderError extends Error {
  readonly code: PlacesErrorCode;
  readonly status: number;
  constructor(code: PlacesErrorCode, status: number, detail: string) {
    super(detail);
    this.code = code;
    this.status = status;
  }
}

export type GoogleDeps = {
  fetch: typeof fetch;
};

/** O corpo da Text Search, a partir do pedido do app: só o que a documentação prevê. */
export function googleBody(input: GooglePlacesInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    textQuery: input.query,
    languageCode: 'pt-BR',
    regionCode: 'BR',
    pageSize: input.limit,
    rankPreference: input.rank === 'distance' ? 'DISTANCE' : 'RELEVANCE',
  };
  if (input.bias) {
    body.locationBias = {
      circle: {
        center: { latitude: input.bias.lat, longitude: input.bias.lng },
        radius: input.bias.radius_m,
      },
    };
  }
  // só um tipo da Tabela A vale como filtro; o resto da IA fica nas palavras
  if (input.type && isGoogleType(input.type)) body.includedType = input.type;
  if (input.open_now) body.openNow = true;
  if (input.min_rating > 0) body.minRating = Math.ceil(input.min_rating * 2) / 2;
  return body;
}

/** O pedido ao Google: POST, a chave e o field mask nos cabeçalhos, nunca na URL. */
export function googleRequest(
  input: GooglePlacesInput,
  key: string,
): { url: string; init: RequestInit } {
  return {
    url: GOOGLE_PLACES_URL,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': GOOGLE_FIELD_MASK.join(','),
      },
      body: JSON.stringify(googleBody(input)),
    },
  };
}

// ----------------------------------------------------------------------- a resposta
const pointSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  })
  .loose();
const openingHoursSchema = z
  .object({
    openNow: z.boolean().optional(),
    periods: z
      .array(z.object({ open: pointSchema, close: pointSchema.optional() }).loose())
      .optional(),
    weekdayDescriptions: z.array(z.string()).optional(),
  })
  .loose();
const googlePlaceSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string().optional() }).loose().optional(),
    formattedAddress: z.string().optional(),
    addressComponents: z
      .array(
        z
          .object({
            longText: z.string().optional(),
            shortText: z.string().optional(),
            types: z.array(z.string()).optional(),
          })
          .loose(),
      )
      .optional(),
    location: z.object({ latitude: z.number(), longitude: z.number() }),
    types: z.array(z.string()).optional(),
    primaryType: z.string().optional(),
    businessStatus: z.string().optional(),
    googleMapsUri: z.string().optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().optional(),
    regularOpeningHours: openingHoursSchema.optional(),
    currentOpeningHours: openingHoursSchema.optional(),
    websiteUri: z.string().optional(),
  })
  .loose();
const responseSchema = z.object({ places: z.array(z.unknown()).default([]) }).loose();
/** O envelope de erro das APIs do Google: `{ error: { code, message, status } }`. */
const errorSchema = z.object({ error: z.object({ status: z.string().optional() }).loose() });

const text = (s: string | undefined, max: number): string | null => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};
const hhmm = (p: { hour: number; minute: number }) =>
  `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;

type Components = NonNullable<z.infer<typeof googlePlaceSchema>['addressComponents']>;

/**
 * A cidade de um resultado, pelo endereço: no Brasil o município é o `administrative_area_level_2`
 * (Canoinhas), e a `locality` costuma ser a mesma cidade; a localidade dentro do município conta como
 * a cidade. Sem os dois, o `sublocality`.
 */
export function cityOf(components: Components | undefined): string | null {
  if (!components) return null;
  const by = (type: string) => components.find((c) => c.types?.includes(type))?.longText;
  return text(by('administrative_area_level_2') ?? by('locality') ?? by('sublocality'), 120);
}

/** O estado ("SC"), para o endereço curto do cartão. */
export function stateOf(components: Components | undefined): string | null {
  return text(
    components?.find((c) => c.types?.includes('administrative_area_level_1'))?.shortText,
    10,
  );
}

const STATUS: Readonly<Record<string, BusinessStatus>> = {
  OPERATIONAL: 'operational',
  CLOSED_TEMPORARILY: 'closed_temporarily',
  CLOSED_PERMANENTLY: 'closed_permanently',
  FUTURE_OPENING: 'future_opening',
};

/** Os períodos de funcionamento como o app os guarda; um lugar 24 h vem sem `close`. */
export function periodsOf(
  hours: z.infer<typeof openingHoursSchema> | undefined,
): OpeningPeriod[] | null {
  const periods = hours?.periods;
  if (!periods || periods.length === 0) return null;
  return periods.slice(0, 40).map((p) => ({
    day: p.open.day,
    open: hhmm(p.open),
    close: p.close ? hhmm(p.close) : null,
  }));
}

/** Um resultado do Google como lugar do app; sem nome ou sem coordenada, não é um lugar que se escolhe. */
export function googlePlaceOf(raw: unknown): Place | null {
  const parsed = googlePlaceSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = text(p.displayName?.text, 200);
  if (!name) return null;
  const hours = p.regularOpeningHours;
  const status = p.businessStatus ? STATUS[p.businessStatus] : undefined;
  const types = [...new Set([...(p.primaryType ? [p.primaryType] : []), ...(p.types ?? [])])].slice(
    0,
    60,
  );
  return {
    id: p.id.slice(0, 512),
    name,
    lat: p.location.latitude,
    lng: p.location.longitude,
    categories: types,
    city: cityOf(p.addressComponents),
    address: text(p.formattedAddress, 300),
    opening_hours: text(hours?.weekdayDescriptions?.join(' · '), 600),
    website: text(p.websiteUri, 500),
    cuisine: null,
    osm: null,
    distance_m: null,
    provider: 'google',
    google_place_id: p.id.slice(0, 300),
    rating: p.rating !== undefined && p.rating >= 0 && p.rating <= 5 ? p.rating : null,
    user_rating_count:
      p.userRatingCount !== undefined &&
      Number.isInteger(p.userRatingCount) &&
      p.userRatingCount >= 0
        ? p.userRatingCount
        : null,
    open_now: p.currentOpeningHours?.openNow ?? hours?.openNow ?? null,
    business_status: status && BUSINESS_STATUSES.includes(status) ? status : null,
    maps_url: text(p.googleMapsUri, 500),
    hours: periodsOf(hours),
  };
}

/**
 * A busca no Google. Os status: 401 e 403 são a chave que não vale (`no_source`: a API desligada, o
 * faturamento, a restrição da chave; o app segue pela outra fonte); 429 é a cota do Google
 * (`provider_quota`); o resto, `provider_failed`, com o `status` do envelope de erro do Google no
 * detalhe (`INVALID_ARGUMENT`), nunca a mensagem inteira nem a chave.
 */
export async function searchGoogle(
  deps: GoogleDeps,
  key: string,
  input: GooglePlacesInput,
): Promise<Place[]> {
  const { url, init } = googleRequest(input, key);
  let res: Response;
  try {
    res = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS) });
  } catch (err) {
    throw new ProviderError('provider_failed', 502, err instanceof Error ? err.name : 'fetch');
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('no_source', 503, 'key');
  if (res.status === 429) throw new ProviderError('provider_quota', 503, 'quota');
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const envelope = errorSchema.safeParse(json);
    const status = envelope.success ? (envelope.data.error.status ?? '') : '';
    throw new ProviderError('provider_failed', 502, `http ${String(res.status)} ${status}`.trim());
  }
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success) throw new ProviderError('provider_failed', 502, 'format');
  return parsed.data.places.map(googlePlaceOf).filter((p): p is Place => p !== null);
}

// ------------------------------------------------------------------ "dentro da cidade"
const plainText = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s*[-/,].*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * O lugar é da cidade pedida? Pela cidade do endereço (o município), sem acento, sem caixa e sem o
 * estado ("Canoinhas - SC" é Canoinhas). Sem cidade no resultado, não dá para saber: não é.
 */
export function inCity(place: Pick<Place, 'city'>, city: string): boolean {
  if (!place.city) return false;
  return plainText(place.city) === plainText(city);
}

/**
 * "Em Canoinhas" é dentro da cidade (a decisão 8 de 21/11): o que é da cidade fica; só sem nada
 * dentro é que os vizinhos valem, e a tela diz. Devolve os lugares que valem e se são os vizinhos.
 */
export function withinCity(
  places: readonly Place[],
  city: string | null,
): { places: Place[]; neighbors: boolean } {
  if (!city || city.trim() === '') return { places: [...places], neighbors: false };
  const inside = places.filter((p) => inCity(p, city));
  return inside.length > 0
    ? { places: inside, neighbors: false }
    : { places: [...places], neighbors: true };
}

// ------------------------------------------------------------------ o horário na conta
const toMin = (t: string) => {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * O lugar está aberto num dia da semana e numa hora (a conta do passeio, D232)? `open` quando um
 * período o cobre (os que viram a noite contam no dia seguinte; 24 h é sempre), `closed` quando os
 * períodos existem e nenhum cobre, `unknown` sem períodos.
 */
export function openStatusAt(
  hours: readonly OpeningPeriod[] | null | undefined,
  day: number,
  time: string,
): 'open' | 'closed' | 'unknown' {
  if (!hours || hours.length === 0) return 'unknown';
  const at = toMin(time);
  for (const p of hours) {
    if (p.close === null) return 'open';
    const open = toMin(p.open);
    const close = toMin(p.close);
    if (close > open) {
      if (p.day === day && at >= open && at < close) return 'open';
    } else {
      // vira a noite: "18:00 a 02:00" cobre o próprio dia depois das 18 e o seguinte antes das 2
      if (p.day === day && at >= open) return 'open';
      if ((p.day + 1) % 7 === day && at < close) return 'open';
    }
  }
  return 'closed';
}

/** Os períodos de um dia, para dizer "abre às 13:00" ("13:00–19:00"; "24 h"). */
export function hoursOnDay(hours: readonly OpeningPeriod[], day: number): string | null {
  const today = hours.filter((p) => p.day === day);
  if (today.length === 0) return null;
  if (today.some((p) => p.close === null)) return '24 h';
  return today.map((p) => `${p.open}–${p.close ?? ''}`).join(', ');
}
