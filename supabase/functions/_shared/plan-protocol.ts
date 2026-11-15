import { z } from 'zod';
import { INTEREST_KEYS, STOP_KIND_KEYS } from './constants.ts';
import { IMPORT_VARIANT_KEYS } from './import-protocol.ts';

/**
 * O contrato entre a Edge Function `plan-trip` (fase 17) e o app: criar a viagem conversando. Dois
 * passos, no mesmo protocolo da importação (os erros antes do stream em JSON com status HTTP; depois,
 * SSE com `start`, `delta`, `done` e `error`, lidos pelo mesmo `SseDecoder`):
 * - `ask`: a descrição (e o que o app sabe) vira até 3 perguntas, cada uma com opções;
 * - `plan`: a descrição, as perguntas e as respostas viram o roteiro, no schema da importação.
 * A saída de hoje pergunta no próprio app (o alcance, e a origem quando não há) e só chama `plan`.
 * Puro e sem o SDK: o servidor valida o pedido, o app monta.
 */
export const PLAN_FN = 'plan-trip';
/** A leitura da conversa (o `plan`): uma conversa inteira é uma leitura, a saída de hoje outra. */
export const PLAN_DAILY_LIMIT = 10;
/**
 * A chave da cota das perguntas na `edge_call`: elas têm a trava própria e não contam como leitura
 * (uma pessoa pode recomeçar). **Não é uma função**: as perguntas vão para a mesma `plan-trip`, com
 * `step: 'ask'` (a medição e o app chamaram `/functions/v1/plan-trip-ask`, que não existe).
 */
export const PLAN_ASK_QUOTA = 'plan-trip-ask';
export const PLAN_ASK_DAILY_LIMIT = 20;
/** O pedido, as perguntas e as respostas juntos: uma conversa, não um roteiro colado. */
export const PLAN_MAX_CHARS = 4_000;
/** O máximo de perguntas, ditas antes (decisão 6 do Douglas, 08/11). */
export const MAX_QUESTIONS = 3;

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeString = z.string().regex(/^\d{2}:\d{2}$/);

/** O alcance da saída de hoje ("quanto tempo vocês têm?"). */
export const REACH_KEYS = ['morning', 'day', 'overnight'] as const;
export type Reach = (typeof REACH_KEYS)[number];

/**
 * O que o app sabe e manda como dado (nunca no prompt de sistema): o dia, de onde saem, a posição se
 * o mapa já tinha permissão, os gostos (pista, nunca regra), o que a pessoa deu 4 e 5, onde já foi, o
 * tempo de hoje e o alcance. Tudo limitado: é contexto, não um arquivo.
 */
export const planContextSchema = z.object({
  today: dateString,
  /** a hora de agora em São Paulo (a saída de hoje começa a partir dela) */
  now: timeString,
  origin: z.string().max(200).nullable(),
  /** a posição, arredondada a uns 1 km, só se o mapa já tinha permissão (D176) */
  position: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable(),
  /** a cidade da posição, pelo Nominatim reverso */
  place: z.string().max(200).nullable(),
  interests: z.array(z.enum(INTEREST_KEYS)).max(INTEREST_KEYS.length),
  learned: z
    .array(z.object({ kind: z.enum(STOP_KIND_KEYS), count: z.number().int().min(1) }))
    .max(10),
  history: z
    .array(
      z.object({
        name: z.string().max(120),
        kind: z.enum(STOP_KIND_KEYS),
        rating: z.number().int().min(1).max(5).nullable(),
        days_ago: z.number().int().min(0),
      }),
    )
    .max(12),
  /** o tempo de hoje onde a pessoa está, em palavras ("Parcialmente nublado, 15° a 31°, chuva 60%") */
  weather: z.string().max(200).nullable(),
  reach: z.enum(REACH_KEYS).nullable(),
});
export type PlanContext = z.infer<typeof planContextSchema>;

export const planQuestionSchema = z.object({
  text: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).max(5),
});
export type PlanQuestion = z.infer<typeof planQuestionSchema>;

export const planRequestSchema = z.object({
  step: z.enum(['ask', 'plan']),
  /** a conversa (uma descrição ou vontade) ou a saída de hoje */
  kind: z.enum(['plan', 'today']),
  text: z.string().min(1),
  questions: z.array(planQuestionSchema).max(MAX_QUESTIONS).default([]),
  /** uma resposta por pergunta, na ordem: a opção escolhida ou o texto livre */
  answers: z.array(z.string().max(500)).max(MAX_QUESTIONS).default([]),
  context: planContextSchema,
  variant: z.enum(IMPORT_VARIANT_KEYS).optional(),
});
export type PlanRequest = z.input<typeof planRequestSchema>;
export type PlanInput = z.output<typeof planRequestSchema>;

/** O tamanho que o limite confere: o que a pessoa escreveu, as perguntas e as respostas. */
export function planChars(input: Pick<PlanInput, 'text' | 'questions' | 'answers'>): number {
  return (
    input.text.length +
    input.questions.reduce((n, q) => n + q.text.length + q.options.join('').length, 0) +
    input.answers.reduce((n, a) => n + a.length, 0)
  );
}

/** As perguntas, como o `done` do `ask` as leva ao app. */
export const planQuestionsSchema = z.object({ questions: z.array(planQuestionSchema) });
export type PlanQuestions = z.infer<typeof planQuestionsSchema>;
