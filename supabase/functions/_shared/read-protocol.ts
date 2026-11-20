import { z } from 'zod';
import { EXPENSE_CATEGORY_KEYS, MEDIA } from './constants.ts';
import { IMPORT_MAX_CHARS, IMPORT_VARIANT_KEYS } from './import-protocol.ts';
import { importReservationSchema, withBlanks } from './import-schema.ts';

/**
 * O contrato entre a Edge Function `read-document` (fase 18) e o app: ler uma confirmação de reserva
 * (colada, anexada, compartilhada ou encaminhada por e-mail) ou a foto de uma nota, e devolver só o
 * que está lá. O mesmo protocolo da importação (os erros antes do stream em JSON com status HTTP;
 * depois, SSE com `start`, `delta`, `done` e `error`, lidos pelo mesmo `SseDecoder`); o `done.data`
 * é a reserva ou a nota, nos schemas daqui. Puro e sem o SDK: o servidor valida o pedido, o app
 * confere o resultado. A função de recebimento de e-mail (`inbound-mail`) lê pelo mesmo caminho.
 */
export const READ_FN = 'read-document';

/** Para que é a leitura; o `kind` em `ai_imports` (0016). */
export const READ_KINDS = ['confirmation', 'receipt'] as const;
export type ReadKind = (typeof READ_KINDS)[number];

/**
 * As cotas pela `edge_call` (D24), uma por finalidade: a confirmação é rara (uma por reserva); a nota
 * é uma por gasto, e um dia de estrada tem vários.
 */
export const READ_QUOTAS: Record<ReadKind, { fn: string; limit: number }> = {
  confirmation: { fn: 'read-confirmation', limit: 20 },
  receipt: { fn: 'read-receipt', limit: 30 },
};

/** O texto colado (ou o do e-mail) tem o mesmo teto da importação. */
export const READ_MAX_CHARS = IMPORT_MAX_CHARS;
/** O anexo lido tem o teto do bucket (D77). */
export const READ_MAX_BYTES = MEDIA.maxBytes;

/** O caminho de um anexo já no Storage: `{viagem}/{anexo}.{ext}`, como a fila o sobe (D78). */
export const ATTACHMENT_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;

export const readRequestSchema = z.object({
  kind: z.enum(READ_KINDS),
  /** a viagem em que a pessoa está (a nota exige; a confirmação pode não ter, na viagem nova) */
  trip_id: z.uuid().nullable(),
  /** o texto colado; null quando a leitura é só do anexo */
  text: z.string().max(READ_MAX_CHARS).nullable(),
  /** o anexo que a fila já subiu ao Storage; a função o lê de lá com o JWT da pessoa */
  attachment: z.object({ path: z.string().regex(ATTACHMENT_PATH) }).nullable(),
  variant: z.enum(IMPORT_VARIANT_KEYS).optional(),
});
export type ReadRequest = z.infer<typeof readRequestSchema>;

// ---------------------------------------------------------------------- a confirmação
/**
 * Uma reserva, como a importação já a descreve (D129), sem o vínculo com a parada ou o dia: na leitura
 * de uma confirmação só, quem liga é a pessoa, no formulário (as datas acham o dia; o nome, a parada).
 */
export const readConfirmationSchema = importReservationSchema.omit({
  stop_ref: true,
  day_ref: true,
});
export type ReadConfirmation = z.infer<typeof readConfirmationSchema>;

/** Como a IA escreve a confirmação: o texto ausente vazio; só `amount` continua com null (uma união). */
export const aiConfirmationSchema = withBlanks(readConfirmationSchema);

// ---------------------------------------------------------------------- a nota
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe('AAAA-MM-DD');
const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .describe('HH:MM, 24 h');
const nullable = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);

/**
 * O que a foto de uma nota dá a um gasto: o total (em reais), o estabelecimento, o CNPJ do emitente,
 * a data e a hora da compra, a categoria sugerida pelo que foi comprado e, quando legível, a chave de
 * acesso de 44 dígitos impressa no DANFE NFC-e (a mesma que o QR traz). O que a nota não diz é null.
 */
export const readReceiptSchema = z.object({
  total: nullable(z.number()),
  merchant: nullable(z.string()),
  cnpj: nullable(z.string().describe('14 dígitos, só números')),
  date: nullable(dateString),
  time: nullable(timeString),
  category: z.enum(EXPENSE_CATEGORY_KEYS),
  access_key: nullable(z.string().describe('44 dígitos, só números')),
});
export type ReadReceipt = z.infer<typeof readReceiptSchema>;

/** Como a IA escreve a nota: o texto ausente vazio; só `total` continua com null (uma união). */
export const aiReceiptSchema = withBlanks(readReceiptSchema);

// ---------------------------------------------------------------------- a volta
const filled = (text: string | null | undefined): string | null => {
  const t = text?.trim();
  return t === undefined || t === '' ? null : t;
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const validDate = (s: string | null) =>
  s !== null && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? s : null;
/** um formato fora do combinado vira "não disse": um campo vazio é melhor que um campo errado */
const matching = (s: string | null, re: RegExp) => (s !== null && re.test(s) ? s : null);
const digits = (s: string | null, n: number) => {
  const d = s?.replace(/\D/g, '') ?? '';
  return d.length === n ? d : null;
};
const money = (n: number | null) => (n !== null && Number.isFinite(n) && n >= 0 ? n : null);

/** A volta da confirmação: os textos vazios viram null, e o que veio fora do formato também. */
export function fromAiConfirmation(raw: unknown): ReadConfirmation {
  const ai = aiConfirmationSchema.parse(raw);
  const start = matching(filled(ai.start_at), STAMP);
  const end = matching(filled(ai.end_at), STAMP);
  return {
    type: ai.type,
    name: filled(ai.name) ?? '',
    start_at: start,
    // um fim sem início, ou antes dele, não é um fim
    end_at: start !== null && end !== null && end >= start ? end : null,
    confirmation_code: filled(ai.confirmation_code),
    amount: money(ai.amount),
    cancel_policy: filled(ai.cancel_policy),
    cancel_until: validDate(filled(ai.cancel_until)),
    phone: filled(ai.phone),
    address: filled(ai.address),
    booked_via: filled(ai.booked_via),
    notes: filled(ai.notes),
  };
}

/** A volta da nota, pelas mesmas regras. */
export function fromAiReceipt(raw: unknown): ReadReceipt {
  const ai = aiReceiptSchema.parse(raw);
  return {
    total: money(ai.total),
    merchant: filled(ai.merchant),
    cnpj: digits(filled(ai.cnpj), 14),
    date: validDate(filled(ai.date)),
    time: matching(filled(ai.time), TIME),
    category: ai.category,
    access_key: digits(filled(ai.access_key), 44),
  };
}

/** A ida, para a resposta gravada dos testes: a reserva ou a nota como a IA as escreveria. */
export function toAiConfirmation(data: ReadConfirmation): unknown {
  return z.encode(aiConfirmationSchema, data);
}
export function toAiReceipt(data: ReadReceipt): unknown {
  return z.encode(aiReceiptSchema, data);
}
