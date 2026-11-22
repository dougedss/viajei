import { z } from 'zod';
import { IMPORT_VARIANT_KEYS } from './import-protocol.ts';
import { placeSchema, PLACES_PROVIDERS } from './places-schema.ts';
import { MAX_QUESTIONS, planContextSchema, planQuestionSchema } from './plan-protocol.ts';

/**
 * O contrato entre a Edge Function `plan-search` (fase 27, o planejador) e o app. A IA planeja a busca
 * com ferramentas que a função executa (procurar lugares, localizar um nome, o tempo de carro) e
 * entrega **o passeio em passos**: a ordem, a relação de cada passo com o anterior, os candidatos (as
 * referências dos lugares que as ferramentas acharam), o que não achou e as perguntas na dúvida. **O
 * app julga**: só vale candidato cuja referência voltou de uma ferramenta nesta rodada. O protocolo
 * de eventos é o da importação (SSE: `start`, `delta` com o andamento em palavras, `done` com o
 * resultado, `error`), lido pelo mesmo `SseDecoder`. Puro e sem o SDK.
 */
export const PLAN_SEARCH_FN = 'plan-search';
/** Por pessoa, em 24 h (`edge_call`): uma rodada por conversa começada, como as perguntas de antes. */
export const PLAN_SEARCH_DAILY_LIMIT = 20;
/** A conta do laboratório (`isLab()`): uma rodada da bateria são dez pedidos, cada um com até duas rodadas. */
export const PLAN_SEARCH_LAB_LIMIT = 200;
/** O laço: turnos da IA e chamadas de ferramenta por rodada; o que não couber volta como pendente. */
export const PLAN_SEARCH_MAX_TURNS = 6;
export const PLAN_SEARCH_MAX_TOOL_CALLS = 8;
/** Buscas no Google por rodada (um "no caminho" são até quatro círculos): o teto do custo. */
export const PLAN_SEARCH_MAX_SEARCHES = 12;
/** O pedido, as perguntas e as respostas juntos, como na `plan-trip`. */
export const PLAN_SEARCH_MAX_CHARS = 4_000;
export const MAX_STEPS = 6;
export const MAX_CANDIDATES = 12;
export const MAX_PENDING = 6;

/** A relação de um passo com o resto do passeio: o "onde" da busca (é o que a fase 26 usa). */
export const STEP_RELATIONS = [
  'perto_de_casa',
  'perto_do_anterior',
  'no_caminho',
  'na_cidade',
  'sem_relacao',
] as const;
export type StepRelation = (typeof STEP_RELATIONS)[number];
/** A hora do dia dita ('' quando não disse). */
export const DAY_TIMES = ['', 'manha', 'almoco', 'tarde', 'noite'] as const;
export type DayTime = (typeof DAY_TIMES)[number];

/** Uma referência curta de lugar que uma ferramenta devolveu nesta rodada: `p1`, `p2`… */
export const PLACE_REF = /^p\d{1,3}$/;

export const stepSchema = z.object({
  ordem: z.number().int().min(1).max(MAX_STEPS),
  /** nas palavras da pessoa: "café", "cortar o cabelo" */
  o_que: z.string().min(1).max(80),
  relacao: z.enum(STEP_RELATIONS),
  /** a cidade do passo, quando dita ou resolvida; '' sem cidade */
  cidade: z.string().max(120),
  hora_do_dia: z.enum(DAY_TIMES),
  candidatos: z.array(z.string().regex(PLACE_REF)).max(MAX_CANDIDATES),
  /** a ferramenta achou candidatos para este passo */
  achou: z.boolean(),
  /** os candidatos são dos vizinhos: nenhum dentro da cidade dita (a tela diz) */
  fora_da_cidade: z.boolean(),
});
export type PlanStep = z.infer<typeof stepSchema>;

export const pendingStepSchema = z.object({
  o_que: z.string().min(1).max(80),
  /** a pergunta quando houver ("Onde fica a feirinha?"); '' sem pergunta */
  pergunta: z.string().max(200),
});
export type PendingStep = z.infer<typeof pendingStepSchema>;

/**
 * O passeio que o planejador entrega: os passos na ordem dita, o que ficou pendente (pedido e não
 * achado, com a pergunta quando há), as perguntas (até 3 ao todo com as de antes, D225) e a cidade de
 * destino dita (para a fase 28).
 */
export const outingSchema = z.object({
  passos: z.array(stepSchema).max(MAX_STEPS),
  pendentes: z.array(pendingStepSchema).max(MAX_PENDING),
  perguntas: z.array(planQuestionSchema).max(MAX_QUESTIONS),
  destino: z.string().max(120),
  /** de onde a pessoa sai, quando o pedido diz diferente do contexto ("saindo de Papanduva"); '' senão */
  origem: z.string().max(120),
});
export type Outing = z.infer<typeof outingSchema>;

/** Um lugar que uma ferramenta achou, com a referência que a IA usa para falar dele. */
export const foundPlaceSchema = z.object({ ref: z.string().regex(PLACE_REF), place: placeSchema });
export type FoundPlace = z.infer<typeof foundPlaceSchema>;

/** Como a rodada terminou: a IA entregou; o teto; o prazo; a IA respondeu só com texto. */
export const PLAN_SEARCH_ENDINGS = [
  'delivered',
  'max_turns',
  'max_calls',
  'deadline',
  'no_plan',
] as const;
export type PlanSearchEnding = (typeof PLAN_SEARCH_ENDINGS)[number];

/** O resultado da rodada, como o `done` o leva ao app. */
export const planSearchResultSchema = z.object({
  lugares: z.array(foundPlaceSchema).max(120),
  passeio: outingSchema,
  numeros: z.object({
    turnos: z.number().int().min(0),
    chamadas: z.number().int().min(0),
    buscas: z.number().int().min(0),
    lugares: z.number().int().min(0),
    /** a fonte que respondeu às buscas (nenhuma quando não houve busca) */
    fonte: z.enum([...PLACES_PROVIDERS, 'none']),
    fim: z.enum(PLAN_SEARCH_ENDINGS),
  }),
});
export type PlanSearchResult = z.infer<typeof planSearchResultSchema>;

/** O ponto de referência de tudo (a posição ou a origem resolvida), arredondado a uns 1 km. */
const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * O pedido ao planejador. `modo` `planejar` é a conversa (o padrão); `gerar_pedidos` e `julgar` são
 * da bateria do laboratório (fase 27, a 3.3), só para quem está em `lab_access`, com saída
 * estruturada e sem ferramentas.
 */
export const planSearchRequestSchema = z.object({
  modo: z.enum(['planejar', 'gerar_pedidos', 'julgar']).default('planejar'),
  kind: z.enum(['plan', 'today']).default('plan'),
  text: z.string().min(1),
  questions: z.array(planQuestionSchema).max(MAX_QUESTIONS).default([]),
  answers: z.array(z.string().max(500)).max(MAX_QUESTIONS).default([]),
  context: planContextSchema,
  /** de onde saem, resolvido pelo app (a posição ou a origem geocodificada), arredondado */
  reference: pointSchema.nullable().default(null),
  /** a bateria: a semente da rodada, os padrões a cobrir e as cidades de saída possíveis */
  gerar: z
    .object({
      semente: z.string().min(1).max(60),
      padroes: z.array(z.string().min(1).max(300)).min(1).max(12),
      cidades: z.array(z.string().min(1).max(80)).min(1).max(60),
    })
    .optional(),
  /** a bateria: o que saiu para um pedido, em texto, para o juiz ler contra o pedido */
  julgar: z.object({ roteiro: z.string().min(1).max(8_000) }).optional(),
  variant: z.enum(IMPORT_VARIANT_KEYS).optional(),
});
export type PlanSearchRequest = z.input<typeof planSearchRequestSchema>;
export type PlanSearchInput = z.output<typeof planSearchRequestSchema>;

export function planSearchChars(
  input: Pick<PlanSearchInput, 'text' | 'questions' | 'answers'>,
): number {
  return (
    input.text.length +
    input.questions.reduce((n, q) => n + q.text.length + q.options.join('').length, 0) +
    input.answers.reduce((n, a) => n + a.length, 0)
  );
}

// ------------------------------------------------------------- a bateria (fase 27, a 3.3)
/** Os dez pedidos de uma rodada, gerados pela IA a partir dos padrões e da semente. */
export const generatedRequestSchema = z.object({
  texto: z.string().min(1).max(300),
  /** a cidade de saída escolhida na lista */
  cidade_saida: z.string().min(1).max(80),
  /** o padrão de pedido que ele cobre, como veio na lista */
  padrao: z.string().min(1).max(300),
});
export const generatedBatchSchema = z.object({
  pedidos: z.array(generatedRequestSchema).min(1).max(10),
});
export type GeneratedBatch = z.infer<typeof generatedBatchSchema>;

/** O veredito do juiz: a nota de 0 a 10 com os motivos e os problemas; número, não portão. */
export const verdictSchema = z.object({
  nota: z.number().int().min(0).max(10),
  motivos: z.array(z.string().max(200)).max(6),
  problemas: z.array(z.string().max(200)).max(6),
});
export type Verdict = z.infer<typeof verdictSchema>;
