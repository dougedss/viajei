import { IMPORT_DAILY_LIMIT, IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import type { ImportPhase } from './preview.ts';

/**
 * As frases da importação, puras: o erro em palavras de gente, com a hora real em que a cota volta e
 * o ponto em que a leitura parou. Sem jargão (nada de "token", "modelo" ou "servidor").
 */
export type ErrorCopy = { title: string; text: string };

const fmt = (n: number) => n.toLocaleString('pt-BR');

/** "às 14:32", "amanhã às 09:10" ou "em 13/11 às 08:00", na hora de São Paulo. */
export function whenBack(retryAt: string, now: Date): string {
  const back = isoToWall(retryAt);
  const today = isoToWall(now.toISOString()).date;
  const tomorrow = isoToWall(new Date(now.getTime() + 86_400_000).toISOString()).date;
  if (back.date === today) return `às ${back.time}`;
  if (back.date === tomorrow) return `amanhã às ${back.time}`;
  const [, mm, dd] = back.date.split('-');
  return `em ${dd ?? ''}/${mm ?? ''} às ${back.time}`;
}

export function errorCopy(
  phase: Extract<ImportPhase, { kind: 'error' }>,
  context: { now: Date; lastStop: string | null },
): ErrorCopy {
  switch (phase.code) {
    case 'rate_limited':
      return {
        title: 'Limite de leituras do dia',
        text: `Você já leu ${IMPORT_DAILY_LIMIT} roteiros nas últimas 24 horas. ${
          phase.retryAt
            ? `A próxima leitura libera ${whenBack(phase.retryAt, context.now)}.`
            : 'Tente de novo mais tarde.'
        }`,
      };
    case 'too_long':
      return {
        title: 'Texto longo demais',
        text: `O texto passa de ${fmt(IMPORT_MAX_CHARS)} caracteres. Leia uma parte agora e o resto depois: a segunda leitura acrescenta, sem apagar a primeira.`,
      };
    case 'refused':
      return {
        title: 'A IA não leu este texto',
        text: 'A IA não quis ler este texto. Às vezes isso acontece por engano. Tente tirar o que não é do roteiro, ou monte as paradas à mão.',
      };
    case 'truncated':
      return context.lastStop
        ? {
            title: 'O texto não foi lido até o fim',
            text: `O texto foi lido até ${context.lastStop}. O que chegou está aqui: dá para revisar e salvar, ou ler de novo um trecho menor.`,
          }
        : {
            title: 'O texto não foi lido até o fim',
            text: 'A leitura parou antes de chegar à primeira parada. Tente de novo com um trecho menor.',
          };
    case 'invalid':
      return {
        title: 'A resposta não deu para usar',
        text: 'A resposta veio num formato que não deu para usar. Tente de novo; costuma dar certo na segunda vez.',
      };
    case 'offline':
      return {
        title: 'Sem internet',
        text: 'Sem internet. O texto fica guardado aqui; quando a rede voltar, é só tocar em Ler.',
      };
    case 'failed':
    case 'canceled':
      return context.lastStop
        ? {
            title: 'A leitura parou no meio',
            text: `A conexão com a IA caiu depois de ${context.lastStop}. O que chegou está aqui para revisar, ou tente de novo em instantes.`,
          }
        : {
            title: 'A IA não respondeu agora',
            text: 'A IA não respondeu agora. Tente de novo em instantes.',
          };
  }
}

/** O contador do campo: "2.714 / 30.000". */
export function charCount(length: number): string {
  return `${fmt(length)} / ${fmt(IMPORT_MAX_CHARS)}`;
}

/** "Restam 3 leituras hoje" só quando está perto do fim; antes disso, nada. */
export function quotaHint(remaining: number | null): string | null {
  if (remaining === null || remaining > 5) return null;
  if (remaining <= 0) return 'As leituras de hoje acabaram.';
  return remaining === 1 ? 'Resta 1 leitura hoje.' : `Restam ${remaining} leituras hoje.`;
}
