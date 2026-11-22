import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import {
  IMPORT_DEADLINE_MS,
  IMPORT_DEFAULT_VARIANT,
  IMPORT_FALLBACK_BETA,
  IMPORT_KEEPALIVE_MS,
  IMPORT_VARIANTS,
  type VariantConfig,
} from './import-ai.ts';
import {
  failureCode,
  httpError,
  SSE_HEADERS,
  streamRun,
  tokensOf,
  type ImportClose,
  type ImportDeps,
  type ParseDone,
} from './import-handler.ts';
import { encodeEvent, SSE_KEEPALIVE, type ImportEvent } from './import-protocol.ts';
import {
  AI_GENERATED_FORMAT,
  AI_VERDICT_FORMAT,
  BATTERY_GENERATE_SYSTEM_PROMPT,
  BATTERY_JUDGE_SYSTEM_PROMPT,
  buildGenerateMessage,
  buildJudgeMessage,
  buildPlanSearchMessage,
  fromDelivery,
  PLAN_SEARCH_SYSTEM_PROMPT,
  PLAN_SEARCH_TOOLS,
  TOOL_NAMES,
} from './plan-search-ai.ts';
import {
  generatedBatchSchema,
  PLAN_SEARCH_DAILY_LIMIT,
  PLAN_SEARCH_FN,
  PLAN_SEARCH_LAB_LIMIT,
  PLAN_SEARCH_MAX_CHARS,
  PLAN_SEARCH_MAX_TOOL_CALLS,
  PLAN_SEARCH_MAX_TURNS,
  planSearchChars,
  planSearchRequestSchema,
  verdictSchema,
  type Outing,
  type PlanSearchEnding,
  type PlanSearchInput,
  type PlanSearchResult,
} from './plan-search-protocol.ts';
import { outingFromSearches, ToolState, type ToolDeps } from './plan-search-tools.ts';

/**
 * O handler da `plan-search` (fase 27, o planejador), sem Deno e sem rede, como os outros: o
 * `index.ts` liga o client da Anthropic, as chaves das fontes, o banco da pessoa e o `waitUntil`; o
 * Vitest liga um client de mentira que devolve chamadas de ferramenta roteirizadas e um `fetch` de
 * mentira para o Google. **O laço com ferramentas**: `tools` estritas, `tool_choice: auto` (o `any` e o
 * `tool` devolvem 400 no Sonnet 5.5), o modelo da D133, teto de turnos e de chamadas, o prazo da
 * importação (140 s, abaixo dos 150 s de parede do plano Free) com o keepalive do SSE, os blocos da
 * resposta devolvidos intactos no turno seguinte (o pensamento inclusive), e uma linha em `ai_imports`
 * (`kind: 'plan_search'`) com os tokens de todos os turnos somados, que sempre fecha. O laço termina
 * quando `entregar_passeio` chega; sem ela (só texto, o teto, o prazo) o planejador devolve o que tem
 * como passeio de reserva e uma pergunta, nunca um erro na tela. Nada do pedido, das respostas nem da
 * resposta vai para log: uma linha de números e o código.
 */
export type PlanSearchDeps = ImportDeps & {
  /** as fontes das ferramentas: o `fetch` e as chaves (nunca em log, resposta ou artefato) */
  tools: Omit<ToolDeps, 'reference'>;
};

/** Cada turno pede pouco texto: as chamadas de ferramenta e, no fim, a entrega. */
const TURN_MAX_TOKENS = 16_000;
const PROGRESS: Readonly<Record<string, string>> = {
  [TOOL_NAMES.search]: 'Procurando lugares…',
  [TOOL_NAMES.locate]: 'Localizando o lugar dito…',
  [TOOL_NAMES.drive]: 'Medindo o tempo de carro…',
  [TOOL_NAMES.deliver]: 'Montando o passeio…',
};

/** O pedido à Anthropic de um turno do laço: as ferramentas estritas, `auto`, sem saída estruturada. */
export function planSearchParamsFor(
  config: VariantConfig,
  messages: BetaMessageParam[],
): BetaMessageStreamParams {
  return {
    model: config.model,
    max_tokens: TURN_MAX_TOKENS,
    thinking: config.thinking,
    output_config: { effort: config.effort },
    betas: [IMPORT_FALLBACK_BETA],
    fallbacks: 'default',
    system: PLAN_SEARCH_SYSTEM_PROMPT,
    tools: [...PLAN_SEARCH_TOOLS],
    tool_choice: { type: 'auto' },
    // uma cópia: a lista cresce a cada turno, e o pedido de cada um fica como foi
    messages: [...messages],
  };
}

const parseGenerated: ParseDone = (json) => ({ data: generatedBatchSchema.parse(json) });
const parseVerdict: ParseDone = (json) => ({ data: verdictSchema.parse(json) });

export async function handlePlanSearch(req: Request, deps: PlanSearchDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const startedAt = now();
  if (req.method !== 'POST') return httpError(405, 'invalid_input', 'Use POST.');
  const parsed = planSearchRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return httpError(400, 'invalid_input', 'Pedido fora do formato esperado.');
  const input = parsed.data;
  const chars = planSearchChars(input);
  if (chars > PLAN_SEARCH_MAX_CHARS) {
    return httpError(413, 'too_long', 'A conversa passa de 4.000 caracteres.');
  }
  if (input.text.trim() === '') return httpError(400, 'invalid_input', 'O pedido está vazio.');

  const lab = await deps.store.isLab();
  if (input.modo !== 'planejar' && !lab) {
    return httpError(403, 'unauthorized', 'Só o laboratório gera e julga pedidos.');
  }
  const claim = await deps.store.claim(
    PLAN_SEARCH_FN,
    lab ? PLAN_SEARCH_LAB_LIMIT : PLAN_SEARCH_DAILY_LIMIT,
  );
  if (!claim.ok) {
    return httpError(
      429,
      'rate_limited',
      `Limite de ${String(PLAN_SEARCH_DAILY_LIMIT)} buscas planejadas em 24 horas.`,
      claim.retryAt,
      now(),
    );
  }
  const variant =
    input.variant && input.variant !== IMPORT_DEFAULT_VARIANT && lab
      ? input.variant
      : IMPORT_DEFAULT_VARIANT;
  const config = IMPORT_VARIANTS[variant];

  // a bateria do laboratório (a 3.3): uma leitura só, com saída estruturada, pelo motor da importação
  if (input.modo === 'gerar_pedidos') {
    if (!input.gerar) return httpError(400, 'invalid_input', 'Faltam os padrões e as cidades.');
    const id = await deps.store.open({
      trip_id: null,
      input_chars: chars,
      model: config.model,
      kind: 'bateria_pedidos',
    });
    return streamRun({
      deps,
      id,
      variant,
      config,
      params: {
        model: config.model,
        max_tokens: 8_000,
        thinking: config.thinking,
        output_config: { effort: config.effort, format: AI_GENERATED_FORMAT },
        betas: [IMPORT_FALLBACK_BETA],
        fallbacks: 'default',
        system: BATTERY_GENERATE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildGenerateMessage(input.gerar) }],
      },
      startedAt,
      textChars: chars,
      parse: parseGenerated,
      label: `${PLAN_SEARCH_FN}:gerar`,
    });
  }
  if (input.modo === 'julgar') {
    if (!input.julgar) return httpError(400, 'invalid_input', 'Falta o roteiro a julgar.');
    const id = await deps.store.open({
      trip_id: null,
      input_chars: chars,
      model: config.model,
      kind: 'bateria_juiz',
    });
    return streamRun({
      deps,
      id,
      variant,
      config,
      params: {
        model: config.model,
        max_tokens: 4_000,
        thinking: config.thinking,
        output_config: { effort: 'low', format: AI_VERDICT_FORMAT },
        betas: [IMPORT_FALLBACK_BETA],
        fallbacks: 'default',
        system: BATTERY_JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildJudgeMessage(input) }],
      },
      startedAt,
      textChars: chars,
      parse: parseVerdict,
      label: `${PLAN_SEARCH_FN}:julgar`,
    });
  }

  const id = await deps.store.open({
    trip_id: null,
    input_chars: chars,
    model: config.model,
    kind: 'plan_search',
  });
  const run = new PlanSearchRun({ deps, id, variant, config, input, startedAt, textChars: chars });
  return new Response(run.body, { headers: SSE_HEADERS });
}

type StopReason = 'deadline' | 'canceled' | 'shutdown';
type RunInit = {
  deps: PlanSearchDeps;
  id: string;
  variant: string;
  config: VariantConfig;
  input: PlanSearchInput;
  startedAt: number;
  textChars: number;
};

/** Os blocos da resposta que voltam no turno seguinte, intactos (o pensamento com a assinatura). */
function asParams(content: BetaMessage['content']): BetaContentBlockParam[] {
  const out: BetaContentBlockParam[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'thinking':
        out.push({ type: 'thinking', thinking: block.thinking, signature: block.signature });
        break;
      case 'redacted_thinking':
        out.push({ type: 'redacted_thinking', data: block.data });
        break;
      case 'text':
        if (block.text !== '') out.push({ type: 'text', text: block.text });
        break;
      case 'tool_use':
        out.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
        break;
      default:
        break;
    }
  }
  return out;
}

/**
 * Uma rodada do planejador em andamento: os turnos com as ferramentas, o andamento em palavras para o
 * app (`delta`), o prazo e o cancelamento, e o registro que fecha em todo caminho (pelo `waitUntil`).
 */
class PlanSearchRun {
  readonly body: ReadableStream<Uint8Array>;
  readonly #init: RunInit;
  readonly #now: () => number;
  readonly #abort = new AbortController();
  readonly #encoder = new TextEncoder();
  #controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  #open = true;
  #why: StopReason | null = null;
  #model: string;
  #input = 0;
  #output = 0;
  #lastWrite: number;

  constructor(init: RunInit) {
    this.#init = init;
    this.#now = init.deps.now ?? Date.now;
    this.#model = init.config.model;
    this.#lastWrite = this.#now();
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
      case 'message_start':
        this.#model = event.message.model;
        break;
      case 'content_block_start':
        if (event.content_block.type === 'fallback') this.#model = event.content_block.to.model;
        // o andamento, em palavras, para a tela: nunca o conteúdo da chamada
        if (event.content_block.type === 'tool_use') {
          this.#send({ type: 'delta', text: PROGRESS[event.content_block.name] ?? 'Pensando…' });
        }
        break;
      default:
        break;
    }
  }

  async #run(): Promise<void> {
    const { deps, id, config, input, startedAt } = this.#init;
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
    const state = new ToolState({ ...deps.tools, reference: input.reference });
    const messages: BetaMessageParam[] = [{ role: 'user', content: buildPlanSearchMessage(input) }];
    let outing: Outing | null = null;
    let ending: PlanSearchEnding = 'max_turns';
    let turns = 0;
    let close: ImportClose | null = null;
    let event: ImportEvent | null = null;

    try {
      while (turns < PLAN_SEARCH_MAX_TURNS) {
        turns += 1;
        const stream = deps.openStream(planSearchParamsFor(config, messages), {
          signal: this.#abort.signal,
          timeout: Math.max(1_000, deadlineAt - this.#now()),
          maxRetries: 1,
        });
        for await (const ev of stream) this.#onEvent(ev);
        const message = await stream.finalMessage();
        this.#model = message.model;
        const tokens = tokensOf(message.usage);
        this.#input += tokens.input;
        this.#output += tokens.output;
        if (message.stop_reason === 'refusal') {
          const category = message.stop_details?.category ?? null;
          close = this.#close('refused', `refusal:${category ?? 'unknown'}`);
          event = { type: 'error', code: 'refused', reason: null, category };
          break;
        }
        const uses = message.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
        if (uses.length === 0) {
          // só texto (ou max_tokens no meio): sem plano; o passeio de reserva e a pergunta
          ending = 'no_plan';
          break;
        }
        const results: BetaToolResultBlockParam[] = [];
        for (const use of uses) {
          if (use.name === TOOL_NAMES.deliver) {
            try {
              outing = this.#deliver(fromDelivery(use.input), state);
              results.push({ type: 'tool_result', tool_use_id: use.id, content: 'Entregue.' });
            } catch {
              results.push({
                type: 'tool_result',
                tool_use_id: use.id,
                is_error: true,
                content:
                  'A entrega veio fora do formato: confira os campos (todos obrigatórios; "" e [] no que não se aplica) e entregue de novo.',
              });
            }
            continue;
          }
          const result = await state.run(use.name, use.input);
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: result.content,
            ...(result.is_error ? { is_error: true } : {}),
          });
          this.#send({ type: 'delta', text: progressOf(use, result.is_error) });
        }
        if (outing) {
          ending = 'delivered';
          break;
        }
        messages.push({ role: 'assistant', content: asParams(message.content) });
        messages.push({ role: 'user', content: results });
      }
      if (
        !outing &&
        !event &&
        ending === 'max_turns' &&
        state.calls >= PLAN_SEARCH_MAX_TOOL_CALLS
      ) {
        ending = 'max_calls';
      }
    } catch (err) {
      if (this.#why === 'deadline') ending = 'deadline';
      else if (this.#why === 'canceled') {
        close = this.#close('canceled', null);
      } else if (this.#why === 'shutdown') {
        close = this.#close('failed', 'shutdown');
        event = { type: 'error', code: 'failed', reason: 'shutdown', category: null };
      } else {
        const code = failureCode(err);
        const status = err instanceof Anthropic.APIError ? String(err.status ?? '-') : '-';
        const request = err instanceof Anthropic.APIError ? (err.requestID ?? '-') : '-';
        deps.log(`${PLAN_SEARCH_FN} id=${id} erro=${code} http=${status} request=${request}`);
        // a IA caiu depois de alguma busca: o que as ferramentas acharam ainda vale para a tela
        if (state.searches.length > 0) ending = 'no_plan';
        else {
          close = this.#close('failed', code);
          event = { type: 'error', code: 'failed', reason: code, category: null };
        }
      }
    } finally {
      clearTimeout(deadline);
      clearInterval(keepalive);
      offShutdown?.();
    }

    if (!close) {
      const passeio = outing ?? outingFromSearches(state, ending);
      const result: PlanSearchResult = {
        lugares: state.found,
        passeio,
        numeros: {
          turnos: turns,
          chamadas: state.calls,
          buscas: state.requests,
          lugares: state.found.length,
          fonte: state.provider,
          fim: ending,
        },
      };
      event = {
        type: 'done',
        data: result,
        model: this.#model,
        usage: { input_tokens: this.#input, output_tokens: this.#output },
      };
      close =
        ending === 'delivered'
          ? this.#close('succeeded', null)
          : ending === 'no_plan'
            ? this.#close('invalid', 'no_plan')
            : this.#close('truncated', ending);
    }
    if (event && this.#why !== 'canceled') this.#send(event);
    if (this.#open) {
      this.#open = false;
      this.#controller?.close();
    }
    try {
      await deps.store.close(id, close);
    } catch {
      deps.log(`${PLAN_SEARCH_FN} id=${id} registro=não fechado (o job fecha em 10 min)`);
    }
    deps.log(
      [
        PLAN_SEARCH_FN,
        `id=${id}`,
        `status=${close.status}`,
        `error=${close.error ?? '-'}`,
        `variant=${this.#init.variant}`,
        `model=${this.#model}`,
        `chars=${String(this.#init.textChars)}`,
        `turns=${String(turns)}`,
        `calls=${String(state.calls)}`,
        `searches=${String(state.requests)}`,
        `places=${String(state.found.length)}`,
        `source=${state.provider}`,
        `end=${ending}`,
        `in=${String(this.#input)}`,
        `out=${String(this.#output)}`,
        `ms=${String(this.#now() - startedAt)}`,
      ].join(' '),
    );
  }

  #close(status: ImportClose['status'], error: string | null): ImportClose {
    return {
      status,
      error,
      model: this.#model,
      input_tokens: this.#input,
      output_tokens: this.#output,
    };
  }

  /** A entrega da IA, julgada: só referências que as ferramentas devolveram nesta rodada; o resto sai. */
  #deliver(delivered: ReturnType<typeof fromDelivery>, state: ToolState): Outing {
    const passos = [...delivered.passos]
      .sort((a, b) => a.ordem - b.ordem)
      .map((p, i) => {
        const candidatos = p.candidatos.filter((ref) => state.placeOf(ref) !== undefined);
        return {
          ...p,
          ordem: i + 1,
          candidatos,
          achou: candidatos.length > 0,
          fora_da_cidade: candidatos.length > 0 && candidatos.every((ref) => state.isNeighbor(ref)),
        };
      });
    return { ...delivered, passos };
  }
}

/** O andamento depois de uma ferramenta, em palavras sem nada da pessoa. */
function progressOf(use: BetaToolUseBlock, failed: boolean): string {
  if (failed) return 'Uma busca não deu; seguindo…';
  if (use.name === TOOL_NAMES.search) return 'Lugares encontrados; seguindo…';
  if (use.name === TOOL_NAMES.locate) return 'Lugar localizado; seguindo…';
  return 'Seguindo…';
}
