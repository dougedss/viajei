import type { ImportEvent } from '@shared/import-protocol.ts';
import {
  PLAN_SEARCH_FN,
  planSearchResultSchema,
  type PlanSearchRequest,
  type PlanSearchResult,
} from '@shared/plan-search-protocol.ts';
import { ImportFailure, streamEvents } from '@/features/import/client.ts';
import type { Conversation } from './conversation.ts';
import { reachOf, readReach } from './reach.ts';
import { ORIGIN_QUESTION } from './today.ts';

/**
 * A chamada ao planejador (fase 27): o pedido, as respostas e o contexto vão à `plan-search`, que
 * responde no protocolo da importação (SSE). Os `delta` são o andamento em palavras ("Procurando
 * lugares…"), não JSON: a tela os mostra enquanto espera; o `done` traz os lugares que as ferramentas
 * acharam e o passeio em passos, conferidos pelo schema aqui de novo. Nenhuma chamada ao Google nem à
 * Anthropic sai do navegador.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** O pedido ao planejador a partir da conversa: o ponto de referência arredondado a uns 1 km (D208). */
export function planSearchRequestOf(c: Conversation): PlanSearchRequest {
  const answers = c.questions.map((_, i) => (c.answers[i] ?? '').trim());
  let context = { ...c.context, reach: null as ReturnType<typeof reachOf> | null };
  if (c.kind === 'today') {
    // a saída de hoje: a pergunta de alcance é do app, e a de origem quando ela foi perguntada
    const originAt = c.questions.findIndex((q) => q.text === ORIGIN_QUESTION.text);
    context = {
      ...context,
      reach: reachOf(readReach(answers[0] ?? '')),
      origin: originAt >= 0 ? (answers[originAt] ?? null) : context.origin,
    };
  }
  return {
    kind: c.kind,
    text: c.text,
    questions: c.questions,
    answers,
    context,
    reference: c.center ? { lat: round2(c.center.lat), lng: round2(c.center.lng) } : null,
  };
}

/**
 * Uma rodada do planejador. Termina com o resultado validado; os erros antes do stream, a rede caindo
 * e o cancelamento saem como `ImportFailure` (quem chama mostra a frase); um `done` fora do schema é
 * `invalid`.
 */
export async function streamPlanSearch(
  request: PlanSearchRequest,
  signal: AbortSignal,
  onProgress: (note: string) => void,
): Promise<PlanSearchResult> {
  let done: Extract<ImportEvent, { type: 'done' }> | null = null;
  let error: Extract<ImportEvent, { type: 'error' }> | null = null;
  await streamEvents(PLAN_SEARCH_FN, request, signal, (event) => {
    if (event.type === 'delta') onProgress(event.text);
    else if (event.type === 'done') done = event;
    else if (event.type === 'error') error = event;
  });
  const err = error as Extract<ImportEvent, { type: 'error' }> | null;
  if (err) throw new ImportFailure(err.code);
  const ok = done as Extract<ImportEvent, { type: 'done' }> | null;
  if (!ok) throw new ImportFailure('failed');
  const parsed = planSearchResultSchema.safeParse(ok.data);
  if (!parsed.success) throw new ImportFailure('invalid');
  return parsed.data;
}
