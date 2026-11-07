import { z } from 'zod';

/**
 * O contrato entre a Edge Function `import-itinerary` e o app: o pedido, os erros antes do stream
 * (JSON com status HTTP, como na route-day) e os eventos do stream (SSE). Puro e sem o SDK da
 * Anthropic: o servidor escreve com `encodeEvent`, o app lê com `SseDecoder`, o Vitest testa os dois.
 */
export const IMPORT_FN = 'import-itinerary';
/** Acima disso a função recusa sem gastar cota (`too_long`). */
export const IMPORT_MAX_CHARS = 30_000;
/** Por pessoa, em 24 h móveis, contadas pela `edge_call` (D24). */
export const IMPORT_DAILY_LIMIT = 20;

/**
 * Variantes de medição (pensamento e esforço), aceitas só de quem está no `lab_access`; para os
 * outros a função usa a padrão. É assim que a medição da fase 10 chama a função publicada.
 */
export const IMPORT_VARIANT_KEYS = [
  'adaptive_medium',
  'between_tools_medium',
  'adaptive_low',
  'opus_medium',
] as const;
export type ImportVariant = (typeof IMPORT_VARIANT_KEYS)[number];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const importRequestSchema = z.object({
  trip_id: z.uuid(),
  text: z.string().min(1),
  /** o contexto que resolve as datas relativas; vem do aparelho, que pode ter edição não enviada */
  trip: z.object({
    name: z.string().min(1).max(120),
    start_date: dateString,
    end_date: dateString,
    origin: z.string().max(200).nullable(),
  }),
  variant: z.enum(IMPORT_VARIANT_KEYS).optional(),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

/** Os estados de erro que o app conhece, cada um com a sua frase. */
export const IMPORT_ERROR_CODES = [
  'rate_limited',
  'too_long',
  'refused',
  'truncated',
  'invalid',
  'failed',
  'canceled',
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/** Erros antes do stream: além dos de cima, pedido malformado e sessão ausente. */
export const importHttpErrorSchema = z.object({
  error: z.object({
    code: z.enum([...IMPORT_ERROR_CODES, 'invalid_input', 'unauthorized'] as const),
    message: z.string(),
    /** quando a cota volta (`rate_limited`), ISO 8601 em UTC */
    retry_at: z.string().nullable().optional(),
  }),
});
export type ImportHttpError = z.infer<typeof importHttpErrorSchema>;

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});
export type ImportUsage = z.infer<typeof usageSchema>;

export const importEventSchema = z.discriminatedUnion('type', [
  /** o registro aberto em `ai_imports` e o modelo pedido */
  z.object({ type: z.literal('start'), id: z.uuid(), model: z.string() }),
  /** mais um pedaço do JSON, na ordem em que a IA escreve */
  z.object({ type: z.literal('delta'), text: z.string() }),
  /** o resultado validado no servidor por `validateImport` (o app valida de novo) */
  z.object({ type: z.literal('done'), data: z.unknown(), model: z.string(), usage: usageSchema }),
  z.object({
    type: z.literal('error'),
    code: z.enum(IMPORT_ERROR_CODES),
    /** `truncated`: max_tokens ou deadline; `failed`: o código curto do registro */
    reason: z.string().nullable(),
    /** `refused`: a categoria do classificador, quando houver */
    category: z.string().nullable(),
  }),
]);
export type ImportEvent = z.infer<typeof importEventSchema>;

/** Um evento como SSE. O JSON nunca tem quebra de linha, então cabe numa linha `data:`. */
export function encodeEvent(event: ImportEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Um comentário SSE: mantém a conexão viva no silêncio (o pensamento da IA) sem virar evento. */
export const SSE_KEEPALIVE = ': aguardando\n\n';

/**
 * Leitor de SSE incremental: recebe pedaços de texto em qualquer ponto de corte (no meio de uma
 * linha, de um `\r\n`, de um caractere já decodificado) e devolve os eventos completos. Ignora
 * comentários e eventos que não são do contrato.
 */
export class SseDecoder {
  #buffer = '';
  #data: string[] = [];

  push(chunk: string): ImportEvent[] {
    this.#buffer += chunk;
    const out: ImportEvent[] = [];
    for (;;) {
      const nl = this.#buffer.search(/\r\n|\r|\n/);
      if (nl === -1) break;
      // um `\r` no fim do pedaço pode ser a metade de um `\r\n`: espera o próximo
      if (this.#buffer[nl] === '\r' && nl === this.#buffer.length - 1) break;
      const width = this.#buffer.startsWith('\r\n', nl) ? 2 : 1;
      const line = this.#buffer.slice(0, nl);
      this.#buffer = this.#buffer.slice(nl + width);
      const event = this.#line(line);
      if (event) out.push(event);
    }
    return out;
  }

  /** O fim do stream: um evento sem a linha em branco final ainda conta. */
  end(): ImportEvent[] {
    const rest = this.#buffer;
    this.#buffer = '';
    const out: ImportEvent[] = [];
    if (rest !== '') {
      const event = this.#line(rest);
      if (event) out.push(event);
    }
    const last = this.#dispatch();
    if (last) out.push(last);
    return out;
  }

  #line(line: string): ImportEvent | null {
    if (line === '') return this.#dispatch();
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') this.#data.push(value);
    return null;
  }

  #dispatch(): ImportEvent | null {
    if (this.#data.length === 0) return null;
    const raw = this.#data.join('\n');
    this.#data = [];
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return null;
    }
    const parsed = importEventSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  }
}
