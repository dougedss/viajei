import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import { anthropicRecording, seedAiJson } from '@/test/fixtures/import-recording.ts';
import { fromAi } from './import-schema.ts';
import {
  failureCode,
  handleImport,
  type ImportClose,
  type ImportStore,
  type OpenStream,
} from './import-handler.ts';
import { SseDecoder, type ImportEvent } from './import-protocol.ts';

/**
 * O handler com entrada fixa: um client da Anthropic de mentira que devolve a gravação (o texto do
 * seed vira o JSON do seed), sem rede e sem chave, e um banco de mentira que guarda o que recebeu.
 */
const TRIP_ID = '0faf1ff2-99ca-482a-a110-44dbb03df182';
const IMPORT_ID = '0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f';
const body = (extra: Record<string, unknown> = {}) => ({
  trip_id: TRIP_ID,
  text: 'sexta 7h saída de Papanduva…',
  trip: {
    name: 'RS — concurso em Montenegro',
    start_date: '2026-12-11',
    end_date: '2026-12-14',
    origin: 'Papanduva, SC',
  },
  ...extra,
});
const post = (json: unknown) =>
  new Request('https://x.supabase.co/functions/v1/import-itinerary', {
    method: 'POST',
    body: JSON.stringify(json),
  });

type Recording = ReturnType<typeof anthropicRecording>;
type FakeOptions = {
  /** espera entre eventos, em ms (0: só uma volta do laço) */
  delay?: number;
  /** depois dos eventos, fica pendurado até o abort (uma IA que não termina) */
  hang?: boolean;
  /** lança este erro ao abrir o stream */
  fail?: Error;
};

function fakeAnthropic(recording: Recording, options: FakeOptions = {}) {
  const calls: BetaMessageStreamParams[] = [];
  let aborted = false;
  const open: OpenStream = (params, { signal }) => {
    calls.push(params);
    if (options.fail) throw options.fail;
    signal.addEventListener('abort', () => {
      aborted = true;
    });
    const abortError = () => new Anthropic.APIUserAbortError();
    const wait = () =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) return reject(abortError());
        const t = setTimeout(resolve, options.delay ?? 0);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(abortError());
        });
      });
    async function* events() {
      for (const event of recording.events) {
        await wait();
        yield event;
      }
      if (options.hang) {
        await new Promise((_, reject) =>
          signal.addEventListener('abort', () => reject(abortError())),
        );
      }
    }
    return {
      [Symbol.asyncIterator]: () => events(),
      finalMessage: () =>
        signal.aborted ? Promise.reject(abortError()) : Promise.resolve(recording.message),
    };
  };
  return { open, calls, wasAborted: () => aborted };
}

function fakeStore(over: Partial<ImportStore> = {}) {
  const opened: Parameters<ImportStore['open']>[0][] = [];
  const closed: ImportClose[] = [];
  const store: ImportStore = {
    claim: () => Promise.resolve({ ok: true }),
    isLab: () => Promise.resolve(false),
    tripOnServer: () => Promise.resolve(true),
    open: (row) => {
      opened.push(row);
      return Promise.resolve(IMPORT_ID);
    },
    close: (_id, row) => {
      closed.push(row);
      return Promise.resolve();
    },
    ...over,
  };
  return { store, opened, closed };
}

async function run(
  request: Request,
  recording: Recording,
  options: FakeOptions & { deadlineMs?: number; store?: Partial<ImportStore> } = {},
) {
  const anthropic = fakeAnthropic(recording, options);
  const db = fakeStore(options.store);
  const pending: Promise<unknown>[] = [];
  const logs: string[] = [];
  const res = await handleImport(request, {
    store: db.store,
    openStream: anthropic.open,
    waitUntil: (work) => pending.push(work),
    log: (line) => logs.push(line),
    ...(options.deadlineMs ? { deadlineMs: options.deadlineMs } : {}),
  });
  return { res, anthropic, db, pending, logs };
}

async function events(res: Response): Promise<ImportEvent[]> {
  const decoder = new SseDecoder();
  return [...decoder.push(await res.text()), ...decoder.end()];
}
const joined = (list: ImportEvent[]) =>
  list.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');

describe('import-itinerary com a resposta gravada', () => {
  it('o texto do seed vira o JSON do seed, aos poucos, e o registro fecha como succeeded', async () => {
    const json = seedAiJson();
    const { res, pending, db, anthropic, logs } = await run(post(body()), anthropicRecording(json));
    expect(res.headers.get('Content-Type')).toMatch(/^text\/event-stream/);
    const list = await events(res);
    await Promise.all(pending);

    expect(list[0]).toEqual({ type: 'start', id: IMPORT_ID, model: 'claude-sonnet-5-5' });
    expect(list.filter((e) => e.type === 'delta').length).toBeGreaterThan(50);
    expect(joined(list)).toBe(json);
    expect(list.at(-1)).toEqual({
      type: 'done',
      data: fromAi(JSON.parse(json)),
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 4_100, output_tokens: 2_300 },
    });
    expect(db.opened).toEqual([
      { trip_id: TRIP_ID, input_chars: body().text.length, model: 'claude-sonnet-5-5' },
    ]);
    expect(db.closed).toEqual([
      {
        status: 'succeeded',
        error: null,
        model: 'claude-sonnet-5-5',
        input_tokens: 4_100,
        output_tokens: 2_300,
      },
    ]);
    // o pedido à Anthropic: modelo, esforço explícito, fallback e o formato sem parse
    const params = anthropic.calls[0];
    expect(params).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 64_000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params?.output_config?.format).not.toHaveProperty('parse');
    // nada do texto nem da resposta no log
    expect(logs.join('\n')).not.toMatch(/Papanduva|Steffen|days/);
  });

  it('recusa: um evento com a categoria e o registro refused', async () => {
    const recording = anthropicRecording('', { stop_reason: 'refusal', refusal: 'general_harms' });
    const { res, pending, db } = await run(post(body()), recording);
    const list = await events(res);
    await Promise.all(pending);
    expect(list.at(-1)).toEqual({
      type: 'error',
      code: 'refused',
      reason: null,
      category: 'general_harms',
    });
    expect(db.closed[0]).toMatchObject({ status: 'refused', error: 'refusal:general_harms' });
  });

  it('max_tokens: o que chegou fica, marcado como truncated', async () => {
    const half = seedAiJson().slice(0, 2_000);
    const { res, pending, db } = await run(
      post(body()),
      anthropicRecording(half, { stop_reason: 'max_tokens' }),
    );
    const list = await events(res);
    await Promise.all(pending);
    expect(joined(list)).toBe(half);
    expect(list.at(-1)).toEqual({
      type: 'error',
      code: 'truncated',
      reason: 'max_tokens',
      category: null,
    });
    expect(db.closed[0]).toMatchObject({ status: 'truncated', error: 'max_tokens' });
  });

  it('JSON quebrado ou fora do schema: invalid', async () => {
    const broken = await run(post(body()), anthropicRecording('{"days": [ oops'));
    expect((await events(broken.res)).at(-1)).toMatchObject({ code: 'invalid', reason: 'json' });
    await Promise.all(broken.pending);
    expect(broken.db.closed[0]).toMatchObject({ status: 'invalid', error: 'json' });

    const ai = JSON.parse(seedAiJson()) as { days: unknown[] };
    const repeated = JSON.stringify({ ...ai, days: [ai.days[0], ai.days[0]] });
    const outside = await run(post(body()), anthropicRecording(repeated));
    expect((await events(outside.res)).at(-1)).toMatchObject({ code: 'invalid', reason: 'schema' });
  });

  it('troca de modelo no meio (fallback): o JSON segue no bloco seguinte e o registro guarda quem respondeu', async () => {
    const json = seedAiJson();
    const recording = anthropicRecording(json, {
      fallbackAt: 10,
      fallbackModel: 'claude-sonnet-5',
    });
    const { res, pending, db } = await run(post(body()), recording);
    const list = await events(res);
    await Promise.all(pending);
    expect(joined(list)).toBe(json);
    expect(list.at(-1)).toMatchObject({ type: 'done', model: 'claude-sonnet-5' });
    expect(db.closed[0]).toMatchObject({ status: 'succeeded', model: 'claude-sonnet-5' });
  });

  it('o prazo para a IA, devolve o que chegou e registra deadline', async () => {
    const { res, pending, db, anthropic } = await run(
      post(body()),
      anthropicRecording(seedAiJson()),
      { delay: 2, hang: true, deadlineMs: 60 },
    );
    const list = await events(res);
    await Promise.all(pending);
    expect(anthropic.wasAborted()).toBe(true);
    expect(list.at(-1)).toEqual({
      type: 'error',
      code: 'truncated',
      reason: 'deadline',
      category: null,
    });
    expect(db.closed[0]).toMatchObject({ status: 'truncated', error: 'deadline' });
  });

  it('a pessoa cancela: a função aborta o stream da Anthropic e registra canceled', async () => {
    const { res, pending, db, anthropic } = await run(
      post(body()),
      anthropicRecording(seedAiJson()),
      {
        delay: 5,
      },
    );
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read();
    await reader.cancel();
    await Promise.all(pending);
    expect(anthropic.wasAborted()).toBe(true);
    expect(db.closed).toEqual([expect.objectContaining({ status: 'canceled', error: null })]);
  });

  it('erro da API na cadeia tipada vira failed com um código curto', async () => {
    const error = new Anthropic.RateLimitError(429, undefined, 'devagar', new Headers());
    const { res, pending, db } = await run(post(body()), anthropicRecording(''), { fail: error });
    expect((await events(res)).at(-1)).toMatchObject({
      code: 'failed',
      reason: 'anthropic_rate_limit',
    });
    await Promise.all(pending);
    expect(db.closed[0]).toMatchObject({ status: 'failed', error: 'anthropic_rate_limit' });
    expect(failureCode(new Anthropic.APIConnectionTimeoutError())).toBe('timeout');
    expect(failureCode(new Anthropic.APIConnectionError({ message: 'x' }))).toBe('connection');
    expect(failureCode(new Error('x'))).toBe('internal');
  });
});

describe('import-itinerary antes de chamar a IA', () => {
  it('acima de 30.000 caracteres: 413 too_long, sem gastar cota', async () => {
    let claimed = false;
    const { res } = await run(post(body({ text: 'a'.repeat(30_001) })), anthropicRecording(''), {
      store: {
        claim: () => {
          claimed = true;
          return Promise.resolve({ ok: true });
        },
      },
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: 'too_long' } });
    expect(claimed).toBe(false);
  });

  it('acima do limite: 429 com a hora real em que a cota volta', async () => {
    const retryAt = new Date(Date.now() + 3_600_000).toISOString();
    const { res, anthropic, db } = await run(post(body()), anthropicRecording(''), {
      store: { claim: () => Promise.resolve({ ok: false, retryAt }) },
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'rate_limited', retry_at: retryAt } });
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(3_500);
    expect(anthropic.calls).toHaveLength(0);
    expect(db.opened).toHaveLength(0);
  });

  it('pedido malformado: 400, e nada é registrado', async () => {
    const { res, db } = await run(post({ text: 'x' }), anthropicRecording(''));
    expect(res.status).toBe(400);
    expect(db.opened).toHaveLength(0);
  });

  it('viagem que ainda não chegou ao servidor: o registro fica sem viagem', async () => {
    const { res, db, pending } = await run(post(body()), anthropicRecording(seedAiJson()), {
      store: { tripOnServer: () => Promise.resolve(false) },
    });
    await res.text();
    await Promise.all(pending);
    expect(db.opened[0]).toMatchObject({ trip_id: null });
  });

  it('a variante de medição só vale para o laboratório', async () => {
    const asUser = await run(
      post(body({ variant: 'between_tools_medium' })),
      anthropicRecording('{}'),
    );
    await asUser.res.text();
    expect(asUser.anthropic.calls[0]).toMatchObject({ thinking: { type: 'adaptive' } });

    const asLab = await run(
      post(body({ variant: 'between_tools_medium' })),
      anthropicRecording('{}'),
      {
        store: { isLab: () => Promise.resolve(true) },
      },
    );
    await asLab.res.text();
    expect(asLab.anthropic.calls[0]).toMatchObject({
      thinking: { type: 'between_tools' },
      output_config: { effort: 'medium' },
    });
  });
});
