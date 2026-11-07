import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import {
  IMPORT_FN,
  importHttpErrorSchema,
  SseDecoder,
  type ImportErrorCode,
  type ImportEvent,
  type ImportRequest,
} from '@shared/import-protocol.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { supabase } from '@/lib/supabase/client.ts';

/**
 * A chamada à `import-itinerary`: o mesmo `functions.invoke` da `route-day` (JWT e chave publicável
 * do client), que para `text/event-stream` devolve a resposta sem ler, e o corpo é lido aos pedaços
 * pelo leitor do protocolo. Cancelar é abortar o pedido: a função percebe e aborta a Anthropic.
 */
export class ImportFailure extends Error {
  readonly code: ImportErrorCode | 'offline';
  readonly retryAt: string | null;
  constructor(code: ImportErrorCode | 'offline', retryAt: string | null = null) {
    super(code);
    this.code = code;
    this.retryAt = retryAt;
  }
}

async function httpFailure(error: unknown, signal: AbortSignal): Promise<ImportFailure> {
  if (signal.aborted) return new ImportFailure('canceled');
  if (error instanceof FunctionsFetchError) {
    connectivity.markOffline();
    return new ImportFailure('offline');
  }
  let body: unknown = null;
  if (error instanceof FunctionsHttpError) {
    const ctx: unknown = error.context;
    if (ctx instanceof Response) body = await ctx.json().catch(() => null);
  }
  const parsed = importHttpErrorSchema.safeParse(body);
  if (!parsed.success) return new ImportFailure('failed');
  const { code, retry_at } = parsed.data.error;
  // pedido malformado ou sessão vencida não têm frase própria: "tente de novo"
  return new ImportFailure(
    code === 'invalid_input' || code === 'unauthorized' ? 'failed' : code,
    retry_at ?? null,
  );
}

/**
 * Lê o roteiro com a IA e entrega cada evento do stream na ordem. Termina quando o stream fecha;
 * o último evento é `done` ou `error`. Erros antes do stream, a rede caindo no meio e o cancelamento
 * saem como `ImportFailure`.
 */
export async function streamImport(
  request: ImportRequest,
  signal: AbortSignal,
  onEvent: (event: ImportEvent) => void,
): Promise<void> {
  const response = await supabase.functions.invoke<unknown>(IMPORT_FN, { body: request, signal });
  const data: unknown = response.data;
  const error: unknown = response.error;
  if (error) throw await httpFailure(error, signal);
  if (!(data instanceof Response) || !data.body) throw new ImportFailure('failed');
  connectivity.markOnline();

  const reader = data.body.pipeThrough(new TextDecoderStream()).getReader();
  const sse = new SseDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of sse.push(value)) onEvent(event);
    }
  } catch {
    if (signal.aborted) throw new ImportFailure('canceled');
    // a conexão caiu no meio: o que chegou fica (quem chama decide se dá para revisar)
    if (!connectivity.canTry()) {
      connectivity.markOffline();
      throw new ImportFailure('offline');
    }
    throw new ImportFailure('failed');
  }
  for (const event of sse.end()) onEvent(event);
}
