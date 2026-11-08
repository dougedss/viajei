import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  AI_IMPORT_FORMAT,
  buildImportMessage,
  IMPORT_DEADLINE_MS,
  IMPORT_DEFAULT_VARIANT,
  IMPORT_FALLBACK_BETA,
  IMPORT_KEEPALIVE_MS,
  IMPORT_MAX_TOKENS,
  IMPORT_SYSTEM_PROMPT,
  IMPORT_VARIANTS,
  type VariantConfig,
} from './import-ai.ts';
import {
  encodeEvent,
  IMPORT_DAILY_LIMIT,
  IMPORT_FN,
  IMPORT_MAX_CHARS,
  importRequestSchema,
  SSE_KEEPALIVE,
  type ImportEvent,
  type ImportHttpError,
} from './import-protocol.ts';
import { fromAi } from './import-schema.ts';

/**
 * O handler da `import-itinerary`, sem Deno e sem rede: o `index.ts` liga o client da Anthropic, o
 * banco da pessoa e o `waitUntil` do runtime; o Vitest liga um client de mentira que devolve uma
 * resposta gravada. Nada do texto colado nem da resposta vai para log.
 */

/** O stream da Anthropic como o handler o usa; o `BetaMessageStream` do SDK cumpre isto. */
export type ImportStream = AsyncIterable<BetaRawMessageStreamEvent> & {
  finalMessage(): Promise<BetaMessage>;
};
export type OpenStream = (
  params: BetaMessageStreamParams,
  options: { signal: AbortSignal; timeout: number; maxRetries: number },
) => ImportStream;

export const IMPORT_STATUSES = [
  'started',
  'succeeded',
  'refused',
  'truncated',
  'invalid',
  'failed',
  'canceled',
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export type ImportClose = {
  status: Exclude<ImportStatus, 'started'>;
  error: string | null;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
};

/** O banco como o handler o usa; o `index.ts` liga ao client do Supabase da pessoa (RLS vale). */
export type ImportStore = {
  /** `edge_call`: passa, ou a hora em que a cota volta (o DETAIL da recusa) */
  claim(fn: string, limit: number): Promise<{ ok: true } | { ok: false; retryAt: string | null }>;
  /** quem está em `lab_access` pode pedir uma variante de medição */
  isLab(): Promise<boolean>;
  /** a viagem já chegou ao servidor? (criada sem sinal pode ainda não ter subido) */
  tripOnServer(tripId: string): Promise<boolean>;
  open(row: { trip_id: string | null; input_chars: number; model: string }): Promise<string>;
  close(id: string, row: ImportClose): Promise<void>;
};

export type ImportDeps = {
  store: ImportStore;
  openStream: OpenStream;
  waitUntil: (work: Promise<unknown>) => void;
  log: (line: string) => void;
  /** encerramento do worker (`beforeunload`): devolve o cancelamento da inscrição */
  onShutdown?: (stop: () => void) => () => void;
  now?: () => number;
  deadlineMs?: number;
  keepaliveMs?: number;
};

// --------------------------------------------------------------- resultado de uma importação
export type Outcome = {
  status: Exclude<ImportStatus, 'started'>;
  error: string | null;
  /** o último evento do stream; null quando ninguém está ouvindo (cancelado) */
  event: ImportEvent | null;
};

/** Como a IA parou, em estado do registro e evento para o app. Puro. */
export function outcomeOfMessage(
  message: Pick<BetaMessage, 'stop_reason' | 'stop_details' | 'model' | 'usage'>,
  text: string,
): Outcome {
  switch (message.stop_reason) {
    case 'refusal': {
      const category = message.stop_details?.category ?? null;
      return {
        status: 'refused',
        error: `refusal:${category ?? 'unknown'}`,
        event: { type: 'error', code: 'refused', reason: null, category },
      };
    }
    case 'max_tokens':
      return {
        status: 'truncated',
        error: 'max_tokens',
        event: { type: 'error', code: 'truncated', reason: 'max_tokens', category: null },
      };
    case 'end_turn':
    case 'stop_sequence': {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return invalid('json');
      }
      try {
        const data = fromAi(json);
        const { input, output } = tokensOf(message.usage);
        return {
          status: 'succeeded',
          error: null,
          event: {
            type: 'done',
            data,
            model: message.model,
            usage: { input_tokens: input, output_tokens: output },
          },
        };
      } catch {
        return invalid('schema');
      }
    }
    default:
      return failed('unexpected_stop');
  }
}

/** Quem parou a IA foi a função: prazo, pessoa que cancelou ou o worker indo embora. */
export function outcomeOfStop(why: StopReason): Outcome {
  switch (why) {
    case 'deadline':
      return {
        status: 'truncated',
        error: 'deadline',
        event: { type: 'error', code: 'truncated', reason: 'deadline', category: null },
      };
    case 'shutdown':
      return failed('shutdown');
    case 'canceled':
      return { status: 'canceled', error: null, event: null };
  }
}

/** A função publicada sem a `ANTHROPIC_API_KEY` nos secrets: o registro diz `config`. */
export class ImportConfigError extends Error {}

/** Erros da cadeia tipada do SDK, do mais específico ao mais geral, como código curto. */
export function failureCode(err: unknown): string {
  if (err instanceof ImportConfigError) return 'config';
  if (err instanceof Anthropic.RateLimitError) return 'anthropic_rate_limit';
  if (err instanceof Anthropic.AuthenticationError) return 'config';
  if (err instanceof Anthropic.PermissionDeniedError) return 'config';
  if (err instanceof Anthropic.BadRequestError) return 'bad_request';
  if (err instanceof Anthropic.InternalServerError) return 'overloaded';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (err instanceof Anthropic.APIConnectionError) return 'connection';
  // um `error` no meio do stream (ex.: overloaded_error) chega como APIError sem status
  if (err instanceof Anthropic.APIError)
    return err.type === 'overloaded_error' ? 'overloaded' : 'api';
  return 'internal';
}

/** Tokens de todas as tentativas (o fallback cobra a recusa e a resposta), com o cache. */
export function tokensOf(usage: BetaUsage): { input: number; output: number } {
  const parts = usage.iterations?.length ? usage.iterations : [usage];
  let input = 0;
  let output = 0;
  for (const u of parts) {
    input +=
      u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
    output += u.output_tokens;
  }
  return { input, output };
}

function invalid(error: string): Outcome {
  return {
    status: 'invalid',
    error,
    event: { type: 'error', code: 'invalid', reason: error, category: null },
  };
}
function failed(error: string): Outcome {
  return {
    status: 'failed',
    error,
    event: { type: 'error', code: 'failed', reason: error, category: null },
  };
}

// ------------------------------------------------------------------------------ HTTP
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  // proxies que respeitam este cabeçalho não seguram os pedaços
  'X-Accel-Buffering': 'no',
};

function httpError(
  status: number,
  code: ImportHttpError['error']['code'],
  message: string,
  retryAt: string | null = null,
  now = Date.now(),
): Response {
  const body: ImportHttpError = { error: { code, message, retry_at: retryAt } };
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (retryAt) {
    headers['Retry-After'] = String(Math.max(1, Math.ceil((Date.parse(retryAt) - now) / 1000)));
  }
  return Response.json(body, { status, headers });
}

/** O pedido inteiro: validação, limite, registro e o stream. */
export async function handleImport(req: Request, deps: ImportDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return httpError(405, 'invalid_input', 'Use POST.');
  const parsed = importRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return httpError(400, 'invalid_input', 'Pedido fora do formato esperado.');
  const input = parsed.data;
  if (input.text.length > IMPORT_MAX_CHARS) {
    return httpError(413, 'too_long', 'O texto passa de 30.000 caracteres.');
  }
  if (input.text.trim() === '') return httpError(400, 'invalid_input', 'O texto está vazio.');

  const claim = await deps.store.claim(IMPORT_FN, IMPORT_DAILY_LIMIT);
  if (!claim.ok) {
    return httpError(
      429,
      'rate_limited',
      `Limite de ${IMPORT_DAILY_LIMIT} leituras em 24 horas.`,
      claim.retryAt,
      now(),
    );
  }
  const variant =
    input.variant && input.variant !== IMPORT_DEFAULT_VARIANT && (await deps.store.isLab())
      ? input.variant
      : IMPORT_DEFAULT_VARIANT;
  const config = IMPORT_VARIANTS[variant];
  const tripId = (await deps.store.tripOnServer(input.trip_id)) ? input.trip_id : null;
  const id = await deps.store.open({
    trip_id: tripId,
    input_chars: input.text.length,
    model: config.model,
  });
  const run = new ImportRun({
    deps,
    id,
    variant,
    config,
    params: paramsFor(config, input.trip, input.text, new Date(startedAt)),
    startedAt,
    textChars: input.text.length,
  });
  return new Response(run.body, { headers: SSE_HEADERS });
}

/** O pedido à Anthropic. `thinking` e `effort` saem da variante; nada de temperature nem prefill. */
export function paramsFor(
  config: VariantConfig,
  trip: Parameters<typeof buildImportMessage>[0],
  text: string,
  now: Date,
): BetaMessageStreamParams {
  return {
    model: config.model,
    max_tokens: IMPORT_MAX_TOKENS,
    thinking: config.thinking,
    output_config: { effort: config.effort, format: AI_IMPORT_FORMAT },
    betas: [IMPORT_FALLBACK_BETA],
    fallbacks: 'default',
    system: IMPORT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildImportMessage(trip, text, now) }],
  };
}

type StopReason = 'deadline' | 'canceled' | 'shutdown';

type RunInit = {
  deps: ImportDeps;
  id: string;
  variant: string;
  config: VariantConfig;
  params: BetaMessageStreamParams;
  startedAt: number;
  textChars: number;
};

/**
 * Uma importação em andamento: repassa os pedaços do JSON enquanto chegam, para no prazo ou no
 * cancelamento, e fecha o registro em todo caminho (pelo `waitUntil`, que segura o worker depois
 * que a pessoa saiu).
 */
class ImportRun {
  readonly body: ReadableStream<Uint8Array>;
  readonly #init: RunInit;
  readonly #now: () => number;
  readonly #abort = new AbortController();
  readonly #encoder = new TextEncoder();
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #open = true;
  #why: StopReason | null = null;
  #text = '';
  #model: string;
  #input: number | null = null;
  #output: number | null = null;
  #firstAt: number | null = null;
  #lastWrite: number;

  constructor(init: RunInit) {
    this.#init = init;
    this.#now = init.deps.now ?? Date.now;
    this.#model = init.config.model;
    this.#lastWrite = this.#now();
    // por último: o `start` do stream roda já no construtor e usa os campos acima
    this.body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#controller = controller;
        init.deps.waitUntil(this.#run());
      },
      cancel: () => {
        this.#open = false;
        this.#stop('canceled');
      },
    });
  }

  #stop(why: StopReason) {
    if (this.#why) return;
    this.#why = why;
    this.#abort.abort();
  }

  #write(chunk: string) {
    if (!this.#open || !this.#controller) return;
    this.#controller.enqueue(this.#encoder.encode(chunk));
    this.#lastWrite = this.#now();
  }

  #send(event: ImportEvent) {
    this.#write(encodeEvent(event));
  }

  #onEvent(event: BetaRawMessageStreamEvent) {
    switch (event.type) {
      case 'message_start': {
        this.#model = event.message.model;
        const u = event.message.usage;
        this.#input =
          u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        break;
      }
      case 'content_block_start':
        // recusa de política refeita em outro modelo: o texto segue no bloco seguinte
        if (event.content_block.type === 'fallback') this.#model = event.content_block.to.model;
        break;
      case 'content_block_delta':
        if (event.delta.type === 'text_delta') {
          this.#text += event.delta.text;
          this.#firstAt ??= this.#now();
          this.#send({ type: 'delta', text: event.delta.text });
        }
        break;
      case 'message_delta':
        this.#output = event.usage.output_tokens;
        break;
      default:
        break;
    }
  }

  async #run(): Promise<void> {
    const { deps, id, config, params, startedAt } = this.#init;
    const deadlineAt = startedAt + (deps.deadlineMs ?? IMPORT_DEADLINE_MS);
    const keepaliveMs = deps.keepaliveMs ?? IMPORT_KEEPALIVE_MS;
    const deadline = setTimeout(
      () => this.#stop('deadline'),
      Math.max(0, deadlineAt - this.#now()),
    );
    const keepalive = setInterval(() => {
      if (this.#now() - this.#lastWrite >= keepaliveMs) this.#write(SSE_KEEPALIVE);
    }, keepaliveMs);
    const offShutdown = deps.onShutdown?.(() => this.#stop('shutdown'));

    this.#send({ type: 'start', id, model: config.model });
    let outcome: Outcome;
    try {
      const stream = deps.openStream(params, {
        signal: this.#abort.signal,
        timeout: Math.max(1_000, deadlineAt - this.#now()),
        maxRetries: 1,
      });
      for await (const event of stream) this.#onEvent(event);
      const message = await stream.finalMessage();
      this.#model = message.model;
      const tokens = tokensOf(message.usage);
      this.#input = tokens.input;
      this.#output = tokens.output;
      outcome = outcomeOfMessage(message, this.#text);
    } catch (err) {
      outcome = this.#why ? outcomeOfStop(this.#why) : failed(failureCode(err));
      if (!this.#why) {
        // só a classe e o identificador do pedido: a mensagem pode carregar trecho do pedido
        const status = err instanceof Anthropic.APIError ? String(err.status ?? '-') : '-';
        const request = err instanceof Anthropic.APIError ? (err.requestID ?? '-') : '-';
        deps.log(
          `import-itinerary id=${id} erro=${outcome.error ?? '-'} http=${status} request=${request}`,
        );
      }
    } finally {
      clearTimeout(deadline);
      clearInterval(keepalive);
      offShutdown?.();
    }

    if (outcome.event) this.#send(outcome.event);
    if (this.#open) {
      this.#open = false;
      this.#controller?.close();
    }

    try {
      await deps.store.close(id, {
        status: outcome.status,
        error: outcome.error,
        model: this.#model,
        input_tokens: this.#input,
        output_tokens: this.#output,
      });
    } catch {
      deps.log(`import-itinerary id=${id} registro=não fechado (o job fecha em 10 min)`);
    }
    const end = this.#now();
    deps.log(
      [
        'import-itinerary',
        `id=${id}`,
        `status=${outcome.status}`,
        `error=${outcome.error ?? '-'}`,
        `variant=${this.#init.variant}`,
        `model=${this.#model}`,
        `chars=${this.#init.textChars}`,
        `in=${this.#input ?? '-'}`,
        `out=${this.#output ?? '-'}`,
        `first_ms=${this.#firstAt === null ? '-' : this.#firstAt - startedAt}`,
        `ms=${end - startedAt}`,
      ].join(' '),
    );
  }
}
