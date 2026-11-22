import { PLAN_ASK_DAILY_LIMIT, PLAN_DAILY_LIMIT, PLAN_MAX_CHARS } from '@shared/plan-protocol.ts';
import { PLAN_SEARCH_DAILY_LIMIT } from '@shared/plan-search-protocol.ts';
import { errorCopy, whenBack, type ErrorCopy } from '@/features/import/messages.ts';
import type { ImportPhase } from '@/features/import/preview.ts';

/**
 * As frases da conversa (fase 17): o limite do dia e o tamanho dizem da conversa, não da importação;
 * o resto é o que a importação já diz (a IA não respondeu, a conexão caiu, sem internet).
 */
export function planErrorCopy(
  phase: Extract<ImportPhase, { kind: 'error' }>,
  step: 'ask' | 'search' | 'plan',
  now: Date,
): ErrorCopy {
  const back = phase.retryAt
    ? `A próxima libera ${whenBack(phase.retryAt, now)}.`
    : 'Tente de novo mais tarde.';
  if (phase.code === 'rate_limited') {
    return step === 'ask'
      ? {
          title: 'Limite de conversas do dia',
          text: `Vocês já começaram ${String(PLAN_ASK_DAILY_LIMIT)} conversas nas últimas 24 horas. ${back}`,
        }
      : step === 'search'
        ? {
            title: 'Limite de buscas do dia',
            text: `A IA já planejou ${String(PLAN_SEARCH_DAILY_LIMIT)} buscas para vocês nas últimas 24 horas. ${back}`,
          }
        : {
            title: 'Limite de viagens montadas do dia',
            text: `A IA já montou ${String(PLAN_DAILY_LIMIT)} viagens para vocês nas últimas 24 horas. ${back}`,
          };
  }
  if (phase.code === 'too_long') {
    return {
      title: 'Conversa longa demais',
      text: `O pedido e as respostas passam de ${PLAN_MAX_CHARS.toLocaleString('pt-BR')} caracteres. Um roteiro pronto pode ser colado inteiro: ele é lido como roteiro.`,
    };
  }
  return errorCopy(phase, { now, lastStop: null });
}
