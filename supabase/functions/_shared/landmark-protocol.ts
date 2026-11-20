import { z } from 'zod';
import { LANDMARK_LIMITS, landmarkRecipeSchema, landmarkShapeSchema } from './landmark-recipe.ts';

/**
 * O contrato dos cartões-postais entre o app e o servidor (fase 23), além da receita:
 *  - a função `landmarks` (a conferência pelo aparelho, ação `check`): o app desenha a peça gerada em
 *    duas vistas e manda as capturas; a função compara com as fotos de referência e responde o
 *    veredito; `edge_call` com a cota própria;
 *  - o trabalhador `build-landmark` (o cron): os códigos de erro por etapa;
 *  - as saídas estruturadas da IA que não são a receita: o que modelar, o monumento de uma cidade e o
 *    veredito da conferência. Todas rasas (nenhuma união), como a receita.
 */
export const LANDMARKS_FN = 'landmarks';
export const LANDMARK_CHECK_LIMIT = 12;
export const LANDMARK_CHECK_FN = 'landmarks-check';
export const BUILD_LANDMARK_FN = 'build-landmark';

/** O teto de lugares novos por viagem (decisão do Douglas de 15/11; a 0017 o cobra também). */
export const LANDMARKS_PER_TRIP = 12;

export const LANDMARK_ERROR_CODES = [
  'no_place',
  'no_wikidata',
  'no_subject',
  'no_photos',
  'no_free_license',
  'ai_failed',
  'ai_invalid',
  'rejected',
  'timeout',
  'source_failed',
] as const;
export type LandmarkErrorCode = (typeof LANDMARK_ERROR_CODES)[number];

// ------------------------------------------------------------------ a conferência (app → função)
/** Uma captura da peça desenhada pelo aparelho: PNG ou JPEG em base64, até 1,5 MB. */
export const CHECK_IMAGE_MAX_BYTES = 1_500_000;
export const checkImageSchema = z.object({
  media_type: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  data: z
    .string()
    .min(1)
    .max(Math.ceil((CHECK_IMAGE_MAX_BYTES * 4) / 3) + 4),
  /** qual vista: a da câmera de repouso da maquete, ou a frontal */
  view: z.enum(['rest', 'front']),
});
export const checkRequestSchema = z.object({
  action: z.literal('check'),
  landmark_id: z.uuid(),
  version: z.number().int().min(1),
  images: z.array(checkImageSchema).min(1).max(2),
  /** só o laboratório: a variante do modelo da medição */
  variant: z.enum(['sonnet', 'opus']).optional(),
});
export type CheckRequest = z.infer<typeof checkRequestSchema>;

export const checkResponseSchema = z.object({
  result: z.enum(['published', 'adjusted', 'rejected', 'stale']),
  /** a versão da peça depois do veredito (a nova, quando ajustada) */
  version: z.number().int(),
  recipe: z.unknown().optional(),
  notes: z.string().optional(),
  usage: z
    .object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      model: z.string(),
      ms: z.number(),
    })
    .optional(),
});
export type CheckResponse = z.infer<typeof checkResponseSchema>;

export type LandmarkCheckErrorCode =
  'bad_request' | 'daily_limit' | 'not_found' | 'no_photos' | 'ai_failed' | 'internal';

// ------------------------------------------------------------------ as saídas estruturadas da IA
/** O que modelar: um dos objetos do OSM que a função achou (pelo índice), nunca um nome solto. */
export const aiSubjectSchema = z.object({
  subject_index: z
    .number()
    .int()
    .min(0)
    .max(20)
    .describe('o índice, na lista, do objeto que é o cartão-postal do lugar (0 é o próprio lugar)'),
  reason: z
    .string()
    .describe('uma frase, em português: por que esse é o que se reconhece do lugar'),
});
export type AiSubject = z.infer<typeof aiSubjectSchema>;

/** O monumento de uma cidade de passagem: uma proposta curta, que a função confere antes de usar. */
export const aiCityLandmarkSchema = z.object({
  name: z
    .string()
    .describe(
      'o nome do cartão-postal mais conhecido da cidade, como está no mapa; vazio se não houver um claro',
    ),
  kind: z
    .enum(['building', 'monument', 'church', 'bridge', 'park', 'viewpoint', 'other', 'none'])
    .describe('o tipo dele; none quando não há um cartão-postal claro'),
  alternative: z.string().describe('um segundo nome pelo qual ele é conhecido, ou vazio'),
});
export type AiCityLandmark = z.infer<typeof aiCityLandmarkSchema>;

/** O veredito da conferência: ok, uma rodada de ajuste (a receita corrigida inteira) ou rejeitada. */
export const aiVerdictSchema = z.object({
  verdict: z.enum(['ok', 'adjust', 'rejected']),
  notes: z.string().describe('o que bate e o que não bate com as fotos, em até três frases'),
  recipe: z.object({
    v: z.literal(1),
    shapes: z.array(landmarkShapeSchema).max(LANDMARK_LIMITS.shapes),
  }),
});
export type AiVerdict = z.infer<typeof aiVerdictSchema>;

/** A receita que a IA escreve: a mesma do app. */
export const aiRecipeSchema = landmarkRecipeSchema;
