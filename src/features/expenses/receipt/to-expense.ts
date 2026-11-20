import type { ExpenseCategory } from '@shared/constants.ts';
import type { ReadReceipt } from '@shared/read-protocol.ts';
import type { Trip } from '@/lib/db/schema.ts';
import type { Merchant } from '@/lib/nfce/cnpj.ts';
import { emissionDate, type NfceQr } from '@/lib/nfce/key.ts';

/**
 * O que a foto de uma nota dá a um gasto, puro (fase 18): o QR da NFC-e lido no aparelho (o CNPJ do
 * emitente; na contingência offline, o dia e o total), o estabelecimento pela BrasilAPI, e a leitura
 * da IA (o total, a data, a categoria, o estabelecimento quando o QR não deu). Cada fato vem de uma
 * fonte só, na ordem: o QR vence a IA no que ele traz; a IA só preenche o que falta. O que ninguém
 * disse fica vazio (regra 16): a tela mostra o que faltou e deixa preencher. O total em centavos é
 * conta da tela (D101); aqui o valor é em reais, como veio.
 */
export type ReceiptFacts = {
  qr: NfceQr | null;
  merchant: Merchant | null;
  ai: ReadReceipt | null;
};

export type ReceiptSource = 'qr' | 'cnpj' | 'ai';

export type ReceiptSuggestion = {
  /** em reais; null quando nem o QR (offline) nem a IA deram o total */
  amount: number | null;
  /** AAAA-MM-DD, só quando está dentro da viagem (uma data de outro ano não entra) */
  date: string | null;
  /** a categoria pela compra, só pela IA; null quando ela não leu */
  category: ExpenseCategory | null;
  /** o estabelecimento, para as observações (o gasto não tem nome) */
  merchant: string | null;
  cnpj: string | null;
  sources: {
    amount: ReceiptSource | null;
    date: ReceiptSource | null;
    merchant: ReceiptSource | null;
  };
};

/** A IA só é chamada quando o QR não trouxe o total (só a contingência offline traz). */
export function needsAi(qr: NfceQr | null): boolean {
  return qr?.total === null || qr?.total === undefined;
}

const inside = (date: string | null, trip: Pick<Trip, 'start_date' | 'end_date'>) =>
  date !== null && date >= trip.start_date && date <= trip.end_date ? date : null;

export function suggestExpense(
  facts: ReceiptFacts,
  trip: Pick<Trip, 'start_date' | 'end_date'>,
): ReceiptSuggestion {
  const { qr, merchant, ai } = facts;
  const qrTotal = qr?.total ?? null;
  const qrDate = qr ? emissionDate(qr) : null;
  const amount = qrTotal ?? ai?.total ?? null;
  const date = inside(qrDate, trip) ?? inside(ai?.date ?? null, trip);
  const merchantName = merchant?.name ?? ai?.merchant ?? null;
  return {
    amount,
    date,
    category: ai?.category ?? null,
    merchant: merchantName,
    cnpj: qr?.key.cnpj ?? ai?.cnpj ?? null,
    sources: {
      amount: qrTotal !== null ? 'qr' : ai?.total !== null && ai?.total !== undefined ? 'ai' : null,
      date:
        inside(qrDate, trip) !== null
          ? 'qr'
          : inside(ai?.date ?? null, trip) !== null
            ? 'ai'
            : null,
      merchant: merchant ? 'cnpj' : ai?.merchant ? 'ai' : null,
    },
  };
}

/** "R$ 187,40 · Posto da Serra · 12/12", o que a nota disse, para a folha. */
export function suggestionLine(s: ReceiptSuggestion, formatMoney: (v: number) => string): string {
  const parts: string[] = [];
  if (s.amount !== null) parts.push(formatMoney(s.amount));
  if (s.merchant) parts.push(s.merchant);
  if (s.date) {
    const [, m, d] = s.date.split('-');
    parts.push(`${d ?? ''}/${m ?? ''}`);
  }
  return parts.join(' · ');
}

/** O que a nota não deu, para a tela dizer ("A nota não dizia o total."). */
export function receiptMissing(s: ReceiptSuggestion): string[] {
  const out: string[] = [];
  if (s.amount === null) out.push('o total');
  if (s.date === null) out.push('a data');
  if (!s.merchant) out.push('o estabelecimento');
  return out;
}
