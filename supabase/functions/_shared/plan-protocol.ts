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

/**
 * Do que a pergunta trata (fase 24): o app usa a resposta para buscar as opções no mapa (a origem, a
 * área, o alcance) e manda as outras para a leitura que escreve a viagem. Opcional: as perguntas de
 * antes, e as do app de antes, não dizem.
 */
export const QUESTION_TOPICS = ['when', 'origin', 'area', 'reach', 'other'] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

export const planQuestionSchema = z.object({
  text: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).max(5),
  topic: z.enum(QUESTION_TOPICS).optional(),
});
export type PlanQuestion = z.infer<typeof planQuestionSchema>;

/**
 * O que a pessoa quer, lido do pedido no passo das perguntas (fase 24): uma vontade, não um roteiro.
 * Nada de lista de paradas: os tipos de lugar que ela pediu, com as palavras dela; a área, o alcance,
 * quando e de onde, quando ela disse; e os lugares que ela nomeou de verdade, os únicos que entram
 * direto na rota (a regra de ouro do Douglas). O que a IA não sabe fica nulo, nunca inventado. Quem
 * traduz o tipo em categorias do mapa é a tabela do app (`intake/places.ts`), nunca a IA.
 */
export const MAX_WANTS = 4;
export const MAX_NAMED = 6;
export const planWantSchema = z.object({
  /** as palavras da pessoa: "café colonial", "zoológico" */
  words: z.string().min(1).max(80),
  /** o tipo do app que mais se parece (nunca origem nem deslocamento) */
  kind: z.enum(STOP_KIND_KEYS),
});
export type PlanWant = z.infer<typeof planWantSchema>;
export const planNamedSchema = z.object({
  /** o nome como ela disse: "Zoo Pomerode" */
  name: z.string().min(1).max(120),
  /** a cidade, se ela disse */
  city: z.string().max(120).nullable(),
  kind: z.enum(STOP_KIND_KEYS),
});
export type PlanNamed = z.infer<typeof planNamedSchema>;
export const planIntentSchema = z.object({
  wants: z.array(planWantSchema).max(MAX_WANTS),
  /** a cidade ou região dita: "Pomerode", "Serra Gaúcha" */
  area: z.string().max(120).nullable(),
  /** o tempo que têm, se disse (a manhã, o dia, dormir fora) */
  reach: z.enum(REACH_KEYS).nullable(),
  /** o alcance em horas de carro, se disse ("até duas horas daqui" → 2) */
  reach_hours: z.number().min(0.25).max(12).nullable(),
  /** quando, como disse: "sábado", "11 a 14 de dezembro" */
  when: z.string().max(120).nullable(),
  /** de onde sai, se disse no pedido */
  origin: z.string().max(200).nullable(),
  named: z.array(planNamedSchema).max(MAX_NAMED),
});
export type PlanIntent = z.infer<typeof planIntentSchema>;
export const EMPTY_INTENT: PlanIntent = {
  wants: [],
  area: null,
  reach: null,
  reach_hours: null,
  when: null,
  origin: null,
  named: [],
};

/**
 * Um lugar do mapa que vai para a leitura que escreve a viagem (fase 24), como dado: a escolha da
 * pessoa (`e1`, `e2`…) ou a sugestão do caminho (`s1`…). O nome, a cidade, a categoria, a coordenada
 * e o horário vêm do mapa; os minutos, da rota (de carro desde o anterior) ou do desvio (na
 * sugestão). A IA escreve sobre eles e nunca acrescenta outro.
 */
export const PLACE_REF = /^[ens]\d{1,2}$/;
export const planPlaceSchema = z.object({
  ref: z.string().regex(PLACE_REF),
  name: z.string().min(1).max(160),
  city: z.string().max(120).nullable(),
  kind: z.enum(STOP_KIND_KEYS),
  category: z.string().max(80).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  opening_hours: z.string().max(200).nullable(),
  minutes: z.number().int().min(0).max(1440).nullable(),
});
export type PlanPlace = z.infer<typeof planPlaceSchema>;
export const MAX_CHOSEN = 10;
export const MAX_SUGGESTIONS = 12;
export const planPlacesSchema = z.object({
  /** o que a pessoa escolheu e o que ela nomeou, na ordem do caminho */
  chosen: z.array(planPlaceSchema).min(1).max(MAX_CHOSEN),
  /** o que vale a pena no caminho ou perto: sugestões, desligadas até ela ligar */
  suggestions: z.array(planPlaceSchema).max(MAX_SUGGESTIONS),
  /** de carro, do último lugar de volta a casa (a rota); null sem volta ou sem rota */
  home_minutes: z.number().int().min(0).max(1440).nullable(),
});
export type PlanPlaces = z.infer<typeof planPlacesSchema>;

export const planRequestSchema = z.object({
  step: z.enum(['ask', 'plan']),
  /** a conversa (uma descrição ou vontade) ou a saída de hoje */
  kind: z.enum(['plan', 'today']),
  text: z.string().min(1),
  questions: z.array(planQuestionSchema).max(MAX_QUESTIONS).default([]),
  /** uma resposta por pergunta, na ordem: a opção escolhida ou o texto livre */
  answers: z.array(z.string().max(500)).max(MAX_QUESTIONS).default([]),
  context: planContextSchema,
  /**
   * os lugares do mapa (fase 24): com eles, o `plan` escreve sobre o que a pessoa escolheu e não
   * escolhe nada; sem eles, o `plan` de antes (o roteiro inteiro pela IA, conferido no app), que o app
   * da produção ainda manda até o merge
   */
  places: planPlacesSchema.optional(),
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

/**
 * As perguntas e a intenção, como o `done` do `ask` as leva ao app. O app de antes lê só `questions`
 * (o resto sai na validação dele); o de agora lê os dois.
 */
export const planQuestionsSchema = z.object({
  questions: z.array(planQuestionSchema),
  intent: planIntentSchema.optional(),
});
export type PlanQuestions = z.infer<typeof planQuestionsSchema>;

/**
 * O que o `plan` com os lugares devolve (fase 24): só texto e a divisão em dias, por referência. O
 * nome e as datas da viagem, o título e a hora de saída de cada dia, a frase de cada lugar e de cada
 * sugestão, as missões, a lista "antes de viajar" e a mala. Os lugares, as coordenadas e os tempos de
 * carro são do mapa e da rota, que o app já tem: quem monta as paradas é ele (`intake/assemble.ts`).
 */
export const planWriteSchema = z.object({
  trip: z.object({
    name: z.string().max(80).nullable(),
    start_date: dateString.nullable(),
    end_date: dateString.nullable(),
  }),
  days: z.array(
    z.object({
      date: dateString.nullable(),
      title: z.string().max(80).nullable(),
      start: timeString.nullable(),
      stops: z.array(z.object({ ref: z.string(), note: z.string().max(200).nullable() })),
    }),
  ),
  suggestions: z.array(z.object({ ref: z.string(), note: z.string().max(200).nullable() })),
  quests: z.array(z.object({ text: z.string().max(140), ref: z.string().nullable() })),
  checklist_before: z.array(z.string().max(140)),
  checklist_pack: z.array(z.string().max(80)),
});
export type PlanWrite = z.infer<typeof planWriteSchema>;
