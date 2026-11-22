import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessageStreamParams } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { describe, expect, it } from 'vitest';
import { anthropicRecording } from '@/test/fixtures/import-recording.ts';
import { scriptedTurn } from '@/test/fixtures/plan-search-recording.ts';
import { GOOGLE_PLACES_URL } from './google-places.ts';
import type { ImportClose, ImportStore, OpenStream } from './import-handler.ts';
import { SseDecoder, type ImportEvent } from './import-protocol.ts';
import { PLAN_SEARCH_SYSTEM_PROMPT, TOOL_NAMES } from './plan-search-ai.ts';
import { handlePlanSearch, type PlanSearchDeps } from './plan-search-handler.ts';
import {
  PLAN_SEARCH_MAX_TURNS,
  planSearchResultSchema,
  type PlanSearchRequest,
  type PlanSearchResult,
} from './plan-search-protocol.ts';

/**
 * A `plan-search` com entrada fixa (fase 27): um client da Anthropic de mentira que devolve, a cada
 * turno, as chamadas de ferramenta roteirizadas (e no fim a entrega), um `fetch` de mentira para o
 * Google e a Geoapify, e um banco de mentira que guarda o que recebeu. Nada de rede, nada de chave.
 */
const RUN_ID = '2d7f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f';
const GOOGLE_KEY = 'AIzaChaveDoGoogleDeTeste000000000000';
const GEO_KEY = 'chave-geoapify-de-teste-0123456789ab';
const context = {
  today: '2026-11-22',
  now: '09:00',
  origin: 'Major Vieira, SC',
  position: { lat: -26.37, lng: -50.33 },
  place: 'Major Vieira, SC',
  interests: ['nature' as const],
  learned: [],
  history: [],
  weather: null,
  reach: null,
};
const request = (extra: Partial<PlanSearchRequest> = {}): PlanSearchRequest => ({
  text: 'iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em canoinhas sc',
  context,
  reference: { lat: -26.37, lng: -50.33 },
  ...extra,
});
const post = (json: unknown) =>
  new Request('https://x.supabase.co/functions/v1/plan-search', {
    method: 'POST',
    body: JSON.stringify(json),
  });

type Turn = ReturnType<typeof scriptedTurn>;
type FakeOptions = { delay?: number; hang?: boolean };

/** Um turno por chamada; o último se repete (um modelo que não para de procurar). */
function fakeAnthropic(turns: Turn[], options: FakeOptions = {}) {
  const calls: BetaMessageStreamParams[] = [];
  const open: OpenStream = (params, { signal }) => {
    calls.push(params);
    const turn = turns[Math.min(calls.length - 1, turns.length - 1)]!;
    const abortError = () => new Anthropic.APIUserAbortError();
    const wait = () =>
      new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(abortError());
          return;
        }
        const t = setTimeout(resolve, options.delay ?? 0);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(abortError());
        });
      });
    async function* events() {
      for (const event of turn.events) {
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
        signal.aborted ? Promise.reject(abortError()) : Promise.resolve(turn.message),
    };
  };
  return { open, calls };
}

const gplace = (id: string, name: string, city: string) => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name}, ${city} - SC, Brasil`,
  addressComponents: [{ longText: city, types: ['administrative_area_level_2'] }],
  location: { latitude: -26.18, longitude: -50.39 },
  types: ['cafe'],
  rating: 4.6,
  userRatingCount: 212,
  businessStatus: 'OPERATIONAL',
});
/** A rede: a cidade pela Geoapify; o Google responde pelo texto da busca. */
function network(answer: (textQuery: string) => unknown[] = () => []) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    calls.push({ url, body });
    if (url.includes('/v1/geocode/search')) {
      return Promise.resolve(
        Response.json({
          results: [{ lat: -26.1765, lon: -50.39, city: 'Canoinhas', country_code: 'br' }],
        }),
      );
    }
    if (url.startsWith(GOOGLE_PLACES_URL)) {
      const query = typeof body?.textQuery === 'string' ? body.textQuery : '';
      return Promise.resolve(Response.json({ places: answer(query) }));
    }
    return Promise.resolve(Response.json({ features: [] }));
  };
  return { fetch, calls };
}

function fakeStore(over: Partial<ImportStore> = {}) {
  const claimed: [string, number][] = [];
  const opened: Parameters<ImportStore['open']>[0][] = [];
  const closed: ImportClose[] = [];
  const store: ImportStore = {
    claim: (fn, limit) => {
      claimed.push([fn, limit]);
      return Promise.resolve({ ok: true });
    },
    isLab: () => Promise.resolve(false),
    tripOnServer: () => Promise.resolve(false),
    open: (row) => {
      opened.push(row);
      return Promise.resolve(RUN_ID);
    },
    close: (_id, row) => {
      closed.push(row);
      return Promise.resolve();
    },
    ...over,
  };
  return { store, claimed, opened, closed };
}

async function run(
  body: unknown,
  turns: Turn[],
  options: FakeOptions & {
    store?: Partial<ImportStore>;
    net?: ReturnType<typeof network>;
    deadlineMs?: number;
    googleKey?: string | undefined;
  } = {},
) {
  const anthropic = fakeAnthropic(turns, options);
  const db = fakeStore(options.store);
  const net = options.net ?? network();
  const pending: Promise<unknown>[] = [];
  const logs: string[] = [];
  const deps: PlanSearchDeps = {
    store: db.store,
    openStream: anthropic.open,
    waitUntil: (work) => pending.push(work),
    log: (line) => logs.push(line),
    tools: {
      fetch: net.fetch,
      googleKey: 'googleKey' in options ? options.googleKey : GOOGLE_KEY,
      geoapifyKey: GEO_KEY,
    },
    ...(options.deadlineMs !== undefined
      ? { deadlineMs: options.deadlineMs, keepaliveMs: 10 }
      : {}),
  };
  const res = await handlePlanSearch(post(body), deps);
  const decoder = new SseDecoder();
  const events: ImportEvent[] =
    res.headers.get('content-type')?.startsWith('text/event-stream') === true
      ? [...decoder.push(await res.text()), ...decoder.end()]
      : [];
  await Promise.all(pending);
  return { res, events, anthropic, db, logs, net };
}

const doneOf = (events: ImportEvent[]): PlanSearchResult => {
  const done = events.at(-1);
  if (done?.type !== 'done') throw new Error(`o último evento é ${done?.type ?? 'nenhum'}`);
  return planSearchResultSchema.parse(done.data);
};

const SEARCH_CAFE = {
  id: 'toolu_1',
  name: TOOL_NAMES.search,
  input: {
    o_que: 'café',
    onde: { tipo: 'cidade', cidade: 'Canoinhas', lat: 0, lng: 0, lat2: 0, lng2: 0, raio_km: 0 },
    tipo_google: 'cafe',
    aberto_agora: false,
    nota_minima: 0,
  },
};
const SEARCH_HAIR = {
  id: 'toolu_2',
  name: TOOL_NAMES.search,
  input: { ...SEARCH_CAFE.input, o_que: 'cortar o cabelo', tipo_google: 'hair_salon' },
};
const DELIVER = (over: Record<string, unknown> = {}) => ({
  id: 'toolu_9',
  name: TOOL_NAMES.deliver,
  input: {
    passos: [
      {
        ordem: 1,
        o_que: 'café',
        relacao: 'na_cidade',
        cidade: 'Canoinhas',
        hora_do_dia: '',
        candidatos: ['p1', 'p2', 'p9'],
        achou: true,
      },
      {
        ordem: 2,
        o_que: 'cortar o cabelo',
        relacao: 'na_cidade',
        cidade: 'Canoinhas',
        hora_do_dia: '',
        candidatos: ['p3'],
        achou: true,
      },
    ],
    pendentes: [{ o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' }],
    perguntas: [],
    destino: '',
    origem: '',
    ...over,
  },
});
const CANOINHAS_PLACES = (q: string) =>
  q.startsWith('café')
    ? [gplace('g1', 'Café do Relógio', 'Canoinhas'), gplace('g2', 'Cantinho do Pão', 'Canoinhas')]
    : q.startsWith('cortar')
      ? [gplace('g3', 'Salão Luz', 'Canoinhas')]
      : [];

describe('plan-search: o laço com as ferramentas', () => {
  it('dois turnos: as buscas juntas, a entrega; o app recebe os lugares e o passeio, só com as referências que existem; o registro soma os tokens', async () => {
    const turns = [
      scriptedTurn([{ type: 'thinking' }, SEARCH_CAFE, SEARCH_HAIR], {
        input_tokens: 2_000,
        output_tokens: 300,
      }),
      scriptedTurn([{ type: 'thinking' }, DELIVER()], { input_tokens: 2_600, output_tokens: 250 }),
    ];
    const net = network(CANOINHAS_PLACES);
    const { res, events, anthropic, db, logs } = await run(request(), turns, { net });
    expect(res.status).toBe(200);
    expect(events[0]).toMatchObject({ type: 'start', id: RUN_ID });
    // o andamento em palavras, sem nada da pessoa
    const deltas = events.flatMap((e) => (e.type === 'delta' ? [e.text] : []));
    expect(deltas).toContain('Procurando lugares…');
    expect(deltas).toContain('Lugares encontrados; seguindo…');
    expect(deltas).toContain('Montando o passeio…');
    expect(deltas.join(' ')).not.toMatch(/canoinhas|cabelo|feirinha/i);
    const result = doneOf(events);
    expect(result.lugares.map((l) => [l.ref, l.place.name])).toEqual([
      ['p1', 'Café do Relógio'],
      ['p2', 'Cantinho do Pão'],
      ['p3', 'Salão Luz'],
    ]);
    // o app julga: a referência que nenhuma ferramenta devolveu (p9) sai
    expect(result.passeio.passos.map((p) => p.candidatos)).toEqual([['p1', 'p2'], ['p3']]);
    expect(result.passeio.passos[0]).toMatchObject({
      ordem: 1,
      relacao: 'na_cidade',
      cidade: 'Canoinhas',
      achou: true,
      fora_da_cidade: false,
    });
    expect(result.passeio.pendentes).toEqual([
      { o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' },
    ]);
    expect(result.numeros).toEqual({
      turnos: 2,
      chamadas: 2,
      buscas: 2,
      lugares: 3,
      fonte: 'google',
      fim: 'delivered',
    });
    // o pedido à IA: as ferramentas estritas, auto, o prompt, sem saída estruturada; o segundo turno leva
    // a resposta inteira de volta (o pensamento com a assinatura, as chamadas) e os resultados
    const first = anthropic.calls[0]!;
    expect(first.system).toBe(PLAN_SEARCH_SYSTEM_PROMPT);
    expect(first.tool_choice).toEqual({ type: 'auto' });
    expect(first.tools?.map((t) => (t as { name?: string }).name)).toEqual([
      TOOL_NAMES.search,
      TOOL_NAMES.locate,
      TOOL_NAMES.drive,
      TOOL_NAMES.deliver,
    ]);
    expect(first.output_config).toEqual({ effort: 'medium' });
    expect(first.messages).toHaveLength(1);
    const second = anthropic.calls[1]!.messages;
    expect(second).toHaveLength(3);
    expect(second[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'thinking', signature: 'assinatura-x' },
        { type: 'tool_use', id: 'toolu_1', name: TOOL_NAMES.search },
        { type: 'tool_use', id: 'toolu_2' },
      ],
    });
    const results = second[2]!.content as {
      type: string;
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }[];
    expect(results.map((r) => [r.type, r.tool_use_id, r.is_error ?? false])).toEqual([
      ['tool_result', 'toolu_1', false],
      ['tool_result', 'toolu_2', false],
    ]);
    expect(results[0]?.content).toContain(
      'p1 · Café do Relógio · Canoinhas · nota 4,6 (212 avaliações)',
    );
    // o registro: uma linha, kind plan_search, os tokens dos dois turnos somados
    expect(db.claimed).toEqual([['plan-search', 20]]);
    expect(db.opened).toEqual([
      {
        trip_id: null,
        input_chars: request().text.length,
        model: 'claude-sonnet-5-5',
        kind: 'plan_search',
      },
    ]);
    expect(db.closed[0]).toEqual({
      status: 'succeeded',
      error: null,
      model: 'claude-sonnet-5-5',
      input_tokens: 4_600,
      output_tokens: 550,
    });
    // o log: números e códigos, nada da pessoa, nada da chave
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(
      /^plan-search id=\S+ status=succeeded error=- .* turns=2 calls=2 searches=2 places=3 source=google end=delivered in=4600 out=550 ms=\d+$/,
    );
    expect(logs.join('\n')).not.toMatch(/canoinhas|cabelo|AIza|chave-geoapify/i);
  });

  it('a IA que responde só com texto: sem plano, o passeio de reserva com a pergunta, nunca um erro na tela', async () => {
    const { events, db } = await run(request(), [
      scriptedTurn([{ type: 'text', text: 'Não entendi o pedido.' }]),
    ]);
    const result = doneOf(events);
    expect(result.lugares).toEqual([]);
    expect(result.passeio.passos).toEqual([]);
    expect(result.passeio.perguntas[0]?.text).toBe(
      'Não consegui montar o passeio. O que vocês querem fazer primeiro?',
    );
    expect(result.numeros).toMatchObject({ turnos: 1, chamadas: 0, fim: 'no_plan', fonte: 'none' });
    expect(db.closed[0]).toMatchObject({ status: 'invalid', error: 'no_plan' });
  });

  it('o teto de turnos: um modelo que só procura e nunca entrega; o que as buscas acharam vira o passeio de reserva', async () => {
    const net = network(CANOINHAS_PLACES);
    const { events, anthropic, db } = await run(request(), [scriptedTurn([SEARCH_CAFE])], { net });
    expect(anthropic.calls).toHaveLength(PLAN_SEARCH_MAX_TURNS);
    const result = doneOf(events);
    expect(result.passeio.passos[0]).toMatchObject({
      o_que: 'café',
      candidatos: ['p1', 'p2'],
      achou: true,
    });
    expect(result.numeros.fim).toBe('max_turns');
    expect(result.numeros.turnos).toBe(PLAN_SEARCH_MAX_TURNS);
    expect(db.closed[0]).toMatchObject({ status: 'truncated', error: 'max_turns' });
  });

  it('a entrega fora do formato volta como erro para a IA, que entrega de novo', async () => {
    const turns = [
      scriptedTurn([{ id: 'toolu_x', name: TOOL_NAMES.deliver, input: { passos: 'nada' } }]),
      scriptedTurn([
        DELIVER({
          passos: [],
          pendentes: [],
          perguntas: [{ texto: 'O que vocês querem fazer?', opcoes: ['um café', 'uma cachoeira'] }],
        }),
      ]),
    ];
    const { events, anthropic } = await run(
      request({ text: 'quero sair pra algum lugar legal' }),
      turns,
    );
    const retry = anthropic.calls[1]!.messages.at(-1)!.content as {
      is_error?: boolean;
      content: string;
    }[];
    expect(retry[0]).toMatchObject({ is_error: true });
    expect(retry[0]?.content).toContain('fora do formato');
    const result = doneOf(events);
    expect(result.passeio.perguntas).toEqual([
      { text: 'O que vocês querem fazer?', options: ['um café', 'uma cachoeira'], topic: 'other' },
    ]);
    expect(result.numeros.fim).toBe('delivered');
  });

  it('a ferramenta que falha volta com is_error (a cidade que não existe perto), e os vizinhos ficam marcados', async () => {
    const net = network((q) =>
      q.startsWith('café') ? [gplace('g9', 'Café do Rio', 'Três Barras')] : [],
    );
    const turns = [
      scriptedTurn([
        SEARCH_CAFE,
        {
          id: 'toolu_m',
          name: TOOL_NAMES.search,
          input: {
            ...SEARCH_CAFE.input,
            onde: { ...SEARCH_CAFE.input.onde, cidade: 'Cidade que não existe' },
          },
        },
      ]),
      scriptedTurn([
        DELIVER({
          passos: [
            {
              ordem: 1,
              o_que: 'café',
              relacao: 'na_cidade',
              cidade: 'Canoinhas',
              hora_do_dia: '',
              candidatos: ['p1'],
              achou: true,
            },
          ],
          pendentes: [],
        }),
      ]),
    ];
    // a geocodificação de mentira responde Canoinhas para qualquer nome: a cidade inexistente cai na
    // plausibilidade pelo nome que volta; aqui o que se prova é o círculo dos vizinhos
    const { events, anthropic } = await run(request(), turns, { net });
    const results = anthropic.calls[1]!.messages.at(-1)!.content as { content: string }[];
    expect(results[0]?.content).toContain('Nenhum "café" dentro de Canoinhas; nos vizinhos há 1');
    const result = doneOf(events);
    expect(result.passeio.passos[0]).toMatchObject({ candidatos: ['p1'], fora_da_cidade: true });
  });

  it('o prazo: a IA que não termina é parada, e o que as ferramentas acharam vale (truncated/deadline), sem 504', async () => {
    const net = network(CANOINHAS_PLACES);
    const turns = [scriptedTurn([SEARCH_CAFE]), scriptedTurn([SEARCH_HAIR])];
    const { events, db } = await run(request(), turns, {
      net,
      hang: true,
      delay: 5,
      deadlineMs: 400,
    });
    const result = doneOf(events);
    expect(result.numeros.fim).toBe('deadline');
    expect(db.closed[0]).toMatchObject({ status: 'truncated', error: 'deadline' });
  });

  it('sem a chave do Google, as buscas caem na Geoapify e a resposta diz a fonte de reserva', async () => {
    const turns = [
      scriptedTurn([SEARCH_CAFE]),
      scriptedTurn([
        DELIVER({
          passos: [
            {
              ordem: 1,
              o_que: 'café',
              relacao: 'na_cidade',
              cidade: 'Canoinhas',
              hora_do_dia: '',
              candidatos: [],
              achou: false,
            },
          ],
          pendentes: [],
        }),
      ]),
    ];
    const { events, net } = await run(request(), turns, { googleKey: undefined });
    const result = doneOf(events);
    expect(result.numeros.fonte).toBe('geoapify');
    expect(net.calls.some((c) => c.url.startsWith(GOOGLE_PLACES_URL))).toBe(false);
    expect(net.calls.some((c) => c.url.includes('/v2/places'))).toBe(true);
  });

  it('a recusa de política vira refused, como nas outras leituras', async () => {
    const { events, db } = await run(request(), [
      scriptedTurn([], { stop_reason: 'refusal', refusal: 'general_harms' }),
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      code: 'refused',
      category: 'general_harms',
    });
    expect(db.closed[0]).toMatchObject({ status: 'refused', error: 'refusal:general_harms' });
  });
});

describe('plan-search: antes do laço', () => {
  it('a cota: 429 com a hora da volta; o pedido longo: 413; o pedido fora do formato: 400', async () => {
    const limited = await run(request(), [], {
      store: { claim: () => Promise.resolve({ ok: false, retryAt: '2026-11-23T09:00:00Z' }) },
    });
    expect(limited.res.status).toBe(429);
    expect(await limited.res.json()).toMatchObject({
      error: { code: 'rate_limited', retry_at: '2026-11-23T09:00:00Z' },
    });
    const long = await run(request({ text: 'x'.repeat(4_001) }), []);
    expect(long.res.status).toBe(413);
    const bad = await run({ text: 'sem contexto' }, []);
    expect(bad.res.status).toBe(400);
  });

  it('a conta do laboratório tem a cota maior e pode pedir a variante; a pessoa comum não', async () => {
    const lab = await run(
      request({ variant: 'adaptive_low' }),
      [scriptedTurn([{ type: 'text', text: 'x' }])],
      { store: { isLab: () => Promise.resolve(true) } },
    );
    expect(lab.db.claimed).toEqual([['plan-search', 200]]);
    expect(lab.anthropic.calls[0]?.output_config).toEqual({ effort: 'low' });
    const common = await run(request({ variant: 'adaptive_low' }), [
      scriptedTurn([{ type: 'text', text: 'x' }]),
    ]);
    expect(common.anthropic.calls[0]?.output_config).toEqual({ effort: 'medium' });
  });
});

describe('plan-search: a bateria (gerar_pedidos e julgar)', () => {
  const generated = JSON.stringify({
    pedidos: [
      {
        texto: 'amanha quero almoçar em mafra e ver uma cachoeira',
        cidade_saida: 'Papanduva, SC',
        padrao: 'uma cidade com dois tipos',
      },
    ],
  });
  const verdict = JSON.stringify({
    nota: 8,
    motivos: ['os dois tipos entraram'],
    problemas: ['a ordem não foi mantida'],
  });
  const recorded = (json: string) => {
    const rec = anthropicRecording(json);
    return { events: rec.events, message: rec.message };
  };

  it('só o laboratório: 403 para a pessoa comum', async () => {
    const { res } = await run(
      request({ modo: 'gerar_pedidos', gerar: { semente: 's', padroes: ['p'], cidades: ['c'] } }),
      [],
    );
    expect(res.status).toBe(403);
  });

  it('gerar_pedidos: uma leitura com saída estruturada, kind bateria_pedidos', async () => {
    const { events, anthropic, db } = await run(
      request({
        modo: 'gerar_pedidos',
        gerar: {
          semente: '2026-11-22#1',
          padroes: ['uma cidade com dois tipos'],
          cidades: ['Papanduva, SC'],
        },
      }),
      [recorded(generated)],
      { store: { isLab: () => Promise.resolve(true) } },
    );
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      data: { pedidos: [{ cidade_saida: 'Papanduva, SC' }] },
    });
    expect(anthropic.calls[0]?.tools).toBeUndefined();
    expect(anthropic.calls[0]?.output_config).toMatchObject({ format: { type: 'json_schema' } });
    expect(db.opened[0]).toMatchObject({ kind: 'bateria_pedidos' });
    expect(db.closed[0]).toMatchObject({ status: 'succeeded' });
  });

  it('julgar: a nota e os motivos, kind bateria_juiz, esforço baixo', async () => {
    const { events, anthropic, db } = await run(
      request({
        modo: 'julgar',
        julgar: { roteiro: 'passos: café (Café do Relógio); pendente: feirinha' },
      }),
      [recorded(verdict)],
      { store: { isLab: () => Promise.resolve(true) } },
    );
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { nota: 8 } });
    expect(anthropic.calls[0]?.output_config).toMatchObject({ effort: 'low' });
    expect(db.opened[0]).toMatchObject({ kind: 'bateria_juiz' });
    const faltando = await run(request({ modo: 'julgar' }), [], {
      store: { isLab: () => Promise.resolve(true) },
    });
    expect(faltando.res.status).toBe(400);
  });
});
