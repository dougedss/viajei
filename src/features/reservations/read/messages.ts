import type { ImportErrorCode } from '@shared/import-protocol.ts';
import { READ_QUOTAS } from '@shared/read-protocol.ts';
import { whenBack, type ErrorCopy } from '@/features/import/messages.ts';

/** As frases da leitura da confirmação, em palavras de gente, como as da importação. */
export function readErrorCopy(
  code: ImportErrorCode | 'offline',
  retryAt: string | null,
  now: Date,
): ErrorCopy {
  switch (code) {
    case 'rate_limited':
      return {
        title: 'Limite de leituras do dia',
        text: `Você já leu ${String(READ_QUOTAS.confirmation.limit)} confirmações nas últimas 24 horas. ${
          retryAt ? `A próxima libera ${whenBack(retryAt, now)}.` : 'Tente de novo mais tarde.'
        }`,
      };
    case 'too_long':
      return {
        title: 'Texto longo demais',
        text: 'Cole só a parte da confirmação: o nome, as datas, o código e o valor costumam estar no começo do e-mail.',
      };
    case 'refused':
      return {
        title: 'A IA não leu esta confirmação',
        text: 'Às vezes isso acontece por engano. Tente tirar o que não é da reserva, ou preencha à mão: o formulário está logo abaixo.',
      };
    case 'truncated':
    case 'invalid':
      return {
        title: 'A leitura não deu certo',
        text: 'A resposta veio incompleta ou num formato que não deu para usar. Tente de novo; costuma dar certo na segunda vez.',
      };
    case 'offline':
      return {
        title: 'Sem internet',
        text: 'A leitura precisa de internet. O texto fica guardado aqui; quando a rede voltar, é só tocar em Ler.',
      };
    case 'failed':
    case 'canceled':
      return {
        title: 'A IA não respondeu agora',
        text: 'Tente de novo em instantes, ou preencha a reserva à mão.',
      };
  }
}
