import type {
  PlanContext,
  PlanIntent,
  PlanPlaces,
  PlanQuestion,
  PlanRequest,
} from '@shared/plan-protocol.ts';
import type { FoundPlace, Outing } from '@shared/plan-search-protocol.ts';
import { db } from '@/lib/db/schema.ts';
import { filled } from '@/lib/text/filled.ts';
import { answersByTopic, type MapStage, type Prepared } from './flow.ts';
import type { PlaceHit } from './locate.ts';
import type { LatLng } from './named.ts';
import { reachOf, readReach } from './reach.ts';
import { ORIGIN_QUESTION } from './today.ts';

/**
 * A conversa da viagem nova (fase 17), no aparelho: a descrição, o que o app sabe, as perguntas, as
 * respostas e, desde a fase 24, a vontade, as opções do mapa com a escolha e o caminho pronto.
 * Mora no Dexie, como o rascunho (D138), e some quando a viagem nasce ou a pessoa desiste: fechar o
 * app no meio das perguntas não pergunta de novo (perguntar gasta cota).
 */
export const CONVERSATION_KEY = 'intake:conversation';

export type Conversation = {
  kind: 'plan' | 'today';
  text: string;
  context: Omit<PlanContext, 'reach'>;
  /** onde conferir os lugares (a posição, ou a origem de antes); na viagem, a região das paradas */
  center: LatLng | null;
  questions: PlanQuestion[];
  /** uma por pergunta: a opção escolhida ou o texto livre ('' enquanto não respondeu) */
  answers: string[];
  /**
   * o que a pessoa quer (fase 24): lido pela IA no passo das perguntas, ou pela tabela de tipos do
   * app na saída de hoje; null numa conversa guardada por uma versão de antes
   */
  intent: PlanIntent | null;
  /** as opções do mapa e a escolha (fase 24): fechar o app aqui não busca de novo */
  map: MapStage | null;
  /** o caminho pronto para a leitura que escreve: tentar de novo não busca nem traça de novo */
  prepared: Prepared | null;
  /**
   * quantas vezes a resposta de cada pergunta não foi entendida (fase 25, D274), pelo índice: a
   * primeira volta com a frase e o texto para editar; a segunda, só as opções. Perguntar de novo não
   * é uma pergunta nova (o teto de três é das perguntas)
   */
  misread?: Record<number, number>;
  /** "mudar" em "Saindo de X" (fase 25, D271): a origem que a pessoa escreveu vale acima de tudo */
  origin_override?: string | null;
  /** as cidades escolhidas na pergunta da cidade (fase 25, D276), pela chave do que foi dito */
  places?: Record<string, PlaceHit>;
  /** a cidade escrita no lugar do que foi dito (D283), pela mesma chave; '' = seguir sem (a área) */
  renamed?: Record<string, string>;
  /**
   * o planejador (fase 27): o passeio em passos que a IA entregou e os lugares que as ferramentas
   * acharam, pela referência (só eles valem como candidato). `plan` nulo: a conversa de antes
   */
  plan?: Outing | null;
  found?: FoundPlace[];
  started_at: string;
};

/**
 * De onde saem, como a tela mostra antes das opções ("Saindo de Major Vieira, SC"; fase 25, D271): o
 * que a pessoa escreveu (no "mudar", no pedido ou na resposta), senão onde ela está (a posição, com a
 * cidade do reverso), senão a origem de antes. Null quando a conversa ainda vai perguntar.
 */
export function originLabelOf(
  c: Pick<Conversation, 'origin_override' | 'intent' | 'questions' | 'answers' | 'context' | 'map'>,
): string | null {
  const said =
    filled(c.origin_override) ??
    filled(c.intent?.origin) ??
    filled(answersByTopic(c.questions, c.answers).origin);
  if (said) return said;
  if (c.map?.origin) return c.map.origin.label;
  if (c.context.position) return c.context.place ?? 'onde vocês estão';
  return c.context.origin;
}

/** "Tenho 2 perguntas antes de montar." A regra 16: diz antes quantas são. */
export function questionsLead(count: number): string {
  return count === 1
    ? 'Tenho 1 pergunta antes de montar.'
    : `Tenho ${String(count)} perguntas antes de montar.`;
}

/** Todas respondidas, com a opção ou com as palavras da pessoa. */
export function canPlan(c: Pick<Conversation, 'questions' | 'answers'>): boolean {
  return c.questions.every((_, i) => (c.answers[i] ?? '').trim() !== '');
}

/**
 * O pedido do roteiro. Na saída de hoje, as perguntas são do app: a resposta do alcance vira o
 * `reach`, e a de origem (quando ela foi perguntada) vira a origem.
 */
export function planRequestOf(c: Conversation, places?: PlanPlaces): PlanRequest {
  const answers = c.questions.map((_, i) => (c.answers[i] ?? '').trim());
  let context: PlanContext = { ...c.context, reach: null };
  if (c.kind === 'today') {
    const originAt = c.questions.findIndex((q) => q.text === ORIGIN_QUESTION.text);
    context = {
      ...context,
      reach: reachOf(readReach(answers[0] ?? '')),
      origin: originAt >= 0 ? (answers[originAt] ?? null) : context.origin,
    };
  }
  return {
    step: 'plan',
    kind: c.kind,
    text: c.text,
    questions: c.questions,
    answers,
    context,
    ...(places ? { places } : {}),
  };
}

/** O pedido das perguntas (só na conversa: a saída de hoje pergunta no app). */
export function askRequestOf(c: Pick<Conversation, 'text' | 'context'>): PlanRequest {
  return { step: 'ask', kind: 'plan', text: c.text, context: { ...c.context, reach: null } };
}

export async function loadConversation(): Promise<Conversation | null> {
  const row = await db.sync_state.get(CONVERSATION_KEY);
  if (!row) return null;
  try {
    const value = JSON.parse(row.value) as Partial<Conversation>;
    // a forma mínima: um valor de uma versão antiga vira "sem conversa", nunca uma tela quebrada
    return (value.kind === 'plan' || value.kind === 'today') &&
      typeof value.text === 'string' &&
      Array.isArray(value.questions) &&
      Array.isArray(value.answers) &&
      value.context
      ? {
          ...(value as Conversation),
          // a conversa guardada por uma versão de antes (sem a vontade e sem as opções) recomeça das
          // perguntas, com as respostas que tinha
          intent: value.intent ?? null,
          map: value.map ?? null,
          prepared: value.prepared ?? null,
        }
      : null;
  } catch {
    return null;
  }
}

export async function saveConversation(c: Conversation): Promise<void> {
  await db.sync_state.put({ key: CONVERSATION_KEY, value: JSON.stringify(c) });
}

export async function clearConversation(): Promise<void> {
  await db.sync_state.delete(CONVERSATION_KEY);
}
