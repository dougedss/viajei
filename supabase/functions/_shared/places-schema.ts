import { z } from 'zod';

/**
 * Contrato da Edge Function `find-places` (fase 24; a fonte do Google na fase 27), o mesmo Zod no
 * servidor e no app, como o da `route-day`: a busca de lugares no mapa, por **tipo** (a Places API da
 * Geoapify, sobre o OpenStreetMap: as categorias num círculo ou num corredor em volta da rota) ou por
 * **texto** (a Places API (New) do Google, fase 27: as palavras da pessoa, com a nota, o número de
 * avaliações, o horário e o "aberto agora"). As chaves só no servidor (`GEOAPIFY_API_KEY`,
 * `GOOGLE_PLACES_API_KEY`, regra 9); nenhuma chamada à Geoapify nem ao Google sai do navegador.
 */
export const PLACES_FN = 'find-places';
/** Por pessoa, em 24 h móveis (`edge_call`): uma conversa faz de duas a quatro buscas. */
export const PLACES_DAILY_LIMIT = 60;
/** Até 20 resultados, a busca custa 1 crédito da Geoapify (o plano gratuito tem 3.000 por dia). */
export const PLACES_MAX_LIMIT = 20;
/** Cada palavra do nome é uma busca (a Places filtra por um nome só). */
export const PLACES_MAX_NAMES = 3;
export const PLACES_MAX_CATEGORIES = 20;
/** O círculo mais largo: o "procurar mais longe" de uma viagem (o dobro dos 200 km da D207). */
export const PLACES_MAX_RADIUS_M = 400_000;
/** A faixa mais larga em volta da rota (cerca de 20 min de desvio numa estrada). */
export const PLACES_MAX_BUFFER_M = 20_000;
/** Os limites da Geoapify para uma geometria no pedido são 10.000 posições e 102.400 bytes. */
export const PLACES_MAX_LINE_POINTS = 2_000;
/**
 * O teto do círculo do `locationBias` da Text Search do Google: "The radius must be between 0.0 and
 * 50000.0, inclusive" (a documentação pública, lida em 22/11/2026). Mais longe que isso são vários
 * círculos, ou o retângulo.
 */
export const GOOGLE_MAX_RADIUS_M = 50_000;

const lng = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);
/** uma categoria da Geoapify: "catering.cafe", "tourism.attraction.viewpoint", "national_park" */
export const placeCategorySchema = z
  .string()
  .max(80)
  .regex(/^[a-z_]+(\.[a-z_-]+)*$/);

export const placesAreaSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('circle'),
    lng,
    lat,
    radius_m: z.number().int().min(100).max(PLACES_MAX_RADIUS_M),
  }),
  z.object({
    type: z.literal('corridor'),
    /** a rota simplificada, [lng, lat] como no GeoJSON */
    line: z
      .array(z.tuple([lng, lat]))
      .min(2)
      .max(PLACES_MAX_LINE_POINTS),
    buffer_m: z.number().int().min(100).max(PLACES_MAX_BUFFER_M),
  }),
]);
export type PlacesArea = z.infer<typeof placesAreaSchema>;

/** A busca por tipo (fase 24): as categorias da Geoapify num recorte. */
export const placesRequestSchema = z.object({
  categories: z.array(placeCategorySchema).min(1).max(PLACES_MAX_CATEGORIES),
  /** as palavras do nome ("colonial"); vazio: só as categorias */
  names: z.array(z.string().trim().min(2).max(40)).max(PLACES_MAX_NAMES).default([]),
  area: placesAreaSchema,
  /** de onde a ordem dos resultados começa: os mais perto daqui primeiro */
  near: z.object({ lng, lat }).nullable().default(null),
  limit: z.number().int().min(1).max(PLACES_MAX_LIMIT).default(PLACES_MAX_LIMIT),
});
export type PlacesRequest = z.input<typeof placesRequestSchema>;
export type PlacesInput = z.output<typeof placesRequestSchema>;

/**
 * A busca por texto no Google (fase 27): as palavras da pessoa como a IA (ou o app) as passar, com a
 * cidade junto quando há ("cabeleireiro em Canoinhas"), um círculo de preferência (o `locationBias`,
 * até 50 km; os resultados podem cair fora dele) e, quando a IA o der, um tipo da Tabela A. O filtro
 * "dentro da cidade" é do app (`inCity`), pelo endereço de cada resultado.
 */
export const GOOGLE_RANKS = ['relevance', 'distance'] as const;
export const googlePlacesRequestSchema = z.object({
  provider: z.literal('google'),
  query: z.string().trim().min(2).max(200),
  bias: z
    .object({ lng, lat, radius_m: z.number().int().min(100).max(GOOGLE_MAX_RADIUS_M) })
    .nullable()
    .default(null),
  /** um tipo da Tabela A ("cafe", "hair_salon"); a função só o manda se existir na lista */
  type: z
    .string()
    .regex(/^[a-z_]{2,60}$/)
    .nullable()
    .default(null),
  open_now: z.boolean().default(false),
  /** de 0 a 5, em passos de 0,5 (o Google arredonda para cima) */
  min_rating: z.number().min(0).max(5).default(0),
  rank: z.enum(GOOGLE_RANKS).default('relevance'),
  limit: z.number().int().min(1).max(PLACES_MAX_LIMIT).default(PLACES_MAX_LIMIT),
});
export type GooglePlacesRequest = z.input<typeof googlePlacesRequestSchema>;
export type GooglePlacesInput = z.output<typeof googlePlacesRequestSchema>;

/** O pedido à função: a busca por texto no Google, ou a busca por tipo na Geoapify (a de antes). */
export const findPlacesRequestSchema = z.union([googlePlacesRequestSchema, placesRequestSchema]);
export type FindPlacesRequest = GooglePlacesRequest | PlacesRequest;

export const PLACES_PROVIDERS = ['geoapify', 'google'] as const;
export type PlacesProvider = (typeof PLACES_PROVIDERS)[number];

/**
 * O que o lugar diz de si (o Google, fase 27): aberto, fechado por um tempo, fechado de vez, ou ainda
 * por abrir. A tela tira o fechado de vez da lista (ou o marca).
 */
export const BUSINESS_STATUSES = [
  'operational',
  'closed_temporarily',
  'closed_permanently',
  'future_opening',
] as const;
export type BusinessStatus = (typeof BUSINESS_STATUSES)[number];

const timeString = z.string().regex(/^\d{2}:\d{2}$/);
/**
 * Um período de funcionamento (o Google, fase 27): o dia da semana (0 é domingo, como no `Date`), a
 * hora de abrir e a de fechar; um lugar aberto 24 h vem com `close` nulo. É o que entra na conta do
 * passeio (D232): o aviso quando o roteiro chega antes de abrir ou depois de fechar.
 */
export const openingPeriodSchema = z.object({
  day: z.number().int().min(0).max(6),
  open: timeString,
  close: timeString.nullable(),
});
export type OpeningPeriod = z.infer<typeof openingPeriodSchema>;

/**
 * Um lugar do mapa, como o app o usa: o nome como está no mapa e o que o mapa tem dele. Os campos da
 * fase 27 são opcionais (a função de antes não os devolvia; o app em cache não os manda): `provider`
 * ausente é a Geoapify; nos lugares do Google, `osm` é nulo e `categories` traz os tipos do Google.
 */
export const placeSchema = z.object({
  /** o `place_id` da Geoapify, ou o `id` do Google */
  id: z.string().min(1).max(512),
  name: z.string().min(1).max(200),
  lat,
  lng,
  /** as categorias da Geoapify, ou os tipos do Google */
  categories: z.array(z.string().max(120)).max(60),
  city: z.string().max(120).nullable(),
  /** o endereço formatado */
  address: z.string().max(300).nullable(),
  /** só quando o mapa tem: a tag do OSM, ou os dias e horários em texto do Google */
  opening_hours: z.string().max(600).nullable(),
  website: z.string().max(500).nullable(),
  /**
   * a cozinha, como o OSM escreve (`german;coffee_shop;regional`): é o que diz que um café de Pomerode
   * sem "colonial" no nome é um café colonial. Opcional: a função de antes não devolvia
   */
  cuisine: z.string().max(200).nullable().optional(),
  /** o objeto do OSM de onde ele veio (para a fase 23 achar a peça do lugar) */
  osm: z.object({ type: z.enum(['node', 'way', 'relation']), id: z.number().int() }).nullable(),
  /** a distância até `near`, quando a busca pediu */
  distance_m: z.number().nonnegative().nullable(),
  // ------------------------------------------------------------- o Google (fase 27), opcional
  provider: z.enum(PLACES_PROVIDERS).optional(),
  /** o `place_id` do Google: vai para a parada (a decisão 4 de 21/11) e é o que o chat da 29 usa */
  google_place_id: z.string().max(300).nullable().optional(),
  /** a nota (de 1 a 5) e o número de avaliações, só quando o Google tem */
  rating: z.number().min(0).max(5).nullable().optional(),
  user_rating_count: z.number().int().nonnegative().nullable().optional(),
  /** aberto agora, pelo relógio do lugar; null quando o Google não diz */
  open_now: z.boolean().nullable().optional(),
  business_status: z.enum(BUSINESS_STATUSES).nullable().optional(),
  maps_url: z.string().max(500).nullable().optional(),
  /** os períodos de funcionamento, para a conta do passeio; null quando o Google não tem */
  hours: z.array(openingPeriodSchema).max(40).nullable().optional(),
});
export type Place = z.infer<typeof placeSchema>;

export const placesResponseSchema = z.object({
  provider: z.enum(PLACES_PROVIDERS),
  fetched_at: z.string(),
  places: z.array(placeSchema),
});
export type PlacesResponse = z.infer<typeof placesResponseSchema>;

export const PLACES_ERROR_CODES = [
  'invalid_input',
  /** a chave da fonte não existe (ou não vale): o app segue sem ela (a busca pelo nome, a outra fonte) */
  'no_source',
  'daily_limit',
  /** a cota da fonte acabou (a Geoapify: 3.000 por dia no plano gratuito; o Google: o 429 dele) */
  'provider_quota',
  'provider_failed',
  'internal',
] as const;
export type PlacesErrorCode = (typeof PLACES_ERROR_CODES)[number];
export const placesErrorSchema = z.object({
  error: z.object({ code: z.enum(PLACES_ERROR_CODES), message: z.string() }),
});

/**
 * A atribuição que a tela das opções e das sugestões mostra (a regra da Geoapify no plano gratuito:
 * "Powered by Geoapify" com link, ao lado da do OpenStreetMap).
 */
export const GEOAPIFY_ATTRIBUTION = {
  text: 'Powered by Geoapify',
  url: 'https://www.geoapify.com/',
};
/** A fonte dos lugares do Google (fase 27), dita ao lado da do OpenStreetMap e da Geoapify. */
export const GOOGLE_ATTRIBUTION = 'Dados do Google Maps';

/** O lugar veio do Google? (a função de antes não dizia a fonte: sem `provider`, é a Geoapify) */
export const isGooglePlace = (p: Pick<Place, 'provider'>): boolean => p.provider === 'google';
