import { z } from 'zod';

/**
 * Contrato da Edge Function `find-places` (fase 24), o mesmo Zod no servidor e no app, como o da
 * `route-day`: a busca de lugares **por tipo** no mapa, num círculo (as opções ao alcance) ou num
 * corredor em volta da rota (o que vale a pena no caminho). A fonte é a Places API da Geoapify, sobre
 * o OpenStreetMap, com a chave só no servidor (`GEOAPIFY_API_KEY`, regra 9); nenhuma chamada à
 * Geoapify sai do navegador. Quem traduz o pedido da pessoa em categorias é a tabela do app
 * (`intake/places.ts`); a função só busca.
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

/** Um lugar do mapa, como o app o usa: o nome como está no mapa e o que o mapa tem dele. */
export const placeSchema = z.object({
  /** o `place_id` da Geoapify */
  id: z.string().min(1).max(512),
  name: z.string().min(1).max(200),
  lat,
  lng,
  categories: z.array(z.string().max(120)).max(60),
  city: z.string().max(120).nullable(),
  /** o endereço formatado */
  address: z.string().max(300).nullable(),
  /** só quando o OSM tem (`opening_hours`) */
  opening_hours: z.string().max(300).nullable(),
  website: z.string().max(500).nullable(),
  /** o objeto do OSM de onde ele veio (para a fase 23 achar a peça do lugar) */
  osm: z.object({ type: z.enum(['node', 'way', 'relation']), id: z.number().int() }).nullable(),
  /** a distância até `near`, quando a busca pediu */
  distance_m: z.number().nonnegative().nullable(),
});
export type Place = z.infer<typeof placeSchema>;

export const PLACES_PROVIDERS = ['geoapify'] as const;
export const placesResponseSchema = z.object({
  provider: z.enum(PLACES_PROVIDERS),
  fetched_at: z.string(),
  places: z.array(placeSchema),
});
export type PlacesResponse = z.infer<typeof placesResponseSchema>;

export const PLACES_ERROR_CODES = [
  'invalid_input',
  /** a chave da Geoapify não existe (ou não vale): o app busca pelo nome, no Nominatim */
  'no_source',
  'daily_limit',
  /** a cota da Geoapify acabou (3.000 por dia no plano gratuito, 5 por segundo) */
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
