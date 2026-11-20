import { describe, expect, it, vi } from 'vitest';
import {
  aiMessage,
  CATEGORY_FILES,
  fakeFetch,
  GREENHOUSE,
  IMAGE_INFO,
  json,
  MUSEUM,
  PARK,
  png,
  Q94923,
  RECIPE,
} from './landmark-fixtures.ts';
import { runLandmarkJob, type LandmarkJob, type WorkerRpc } from './landmark-worker.ts';

/**
 * O trabalhador da fila (fase 23) com tudo de mentira: o Nominatim, o Wikidata, o Commons e a IA. O que
 * ele prova: a corrente inteira do lugar da régua (o parque é o lugar, a estufa é a peça), a cidade com
 * e sem conferência, o filtro de licença, os códigos de erro, o registro só de números, nada da pessoa
 * no log.
 */
const JOB: LandmarkJob = {
  id: 'job-1',
  kind: 'build',
  place_key: 'osm:w607776738',
  place_kind: 'stop',
  trip_id: 'trip-1',
  requested_by: 'user-1',
  variant: null,
  attempt: 1,
  lab: false,
  input: {
    name: 'Jardim Botânico',
    lat: -25.4428,
    lng: -49.2392,
    stop_kind: 'nature',
    osm_type: 'way',
    osm_id: 607776738,
  },
};

function rpcOf(job: LandmarkJob | null, over: Partial<WorkerRpc> = {}) {
  const calls: Record<string, unknown[][]> = { identified: [], store: [], fail: [], record: [] };
  const rpc: WorkerRpc = {
    claim: () => Promise.resolve(job),
    identified: (...args) => {
      calls.identified?.push(args);
      return Promise.resolve({ landmark_id: 'lm-1', linked: false });
    },
    store: (...args) => {
      calls.store?.push(args);
      return Promise.resolve();
    },
    fail: (...args) => {
      calls.fail?.push(args);
      return Promise.resolve();
    },
    record: (row) => {
      calls.record?.push([row]);
      return Promise.resolve();
    },
    ...over,
  };
  return { rpc, calls };
}

const sources = (extra: [RegExp, () => Response][] = []) =>
  fakeFetch([
    ...extra,
    [/nominatim.*\/lookup\?osm_ids=W607776738/, json([PARK])],
    [/nominatim.*\/search\?q=Jardim/, json([GREENHOUSE, MUSEUM, PARK])],
    [/Special:EntityData\/Q94923/, json(Q94923)],
    [/list=categorymembers/, json(CATEGORY_FILES)],
    [/prop=imageinfo/, json(IMAGE_INFO)],
    [/upload\.wikimedia/, png()],
  ]);

const aiOf = (answers: unknown[]) => {
  const params: unknown[] = [];
  const ai = vi.fn((p: unknown) => {
    params.push(p);
    return Promise.resolve(aiMessage(answers.shift() ?? RECIPE));
  });
  return { ai, params };
};

describe('o trabalhador da fila dos cartões-postais', () => {
  it('sem fila, nada', async () => {
    const { rpc } = rpcOf(null);
    const { ai } = aiOf([]);
    const result = await runLandmarkJob({
      rpc,
      fetch: sources().fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toEqual({ status: 'idle' });
    expect(ai).not.toHaveBeenCalled();
  });

  it('a régua: o parque é o lugar, a IA escolhe a estufa entre os objetos do mapa, as fotos livres, a receita', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const { ai, params } = aiOf([
      { subject_index: 1, reason: 'a estufa é o que as fotos mostram' },
      RECIPE,
    ]);
    const log: string[] = [];
    const { fetch, calls: http } = sources();
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: (l) => log.push(l),
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'generated', landmark_id: 'lm-1', photos: 3 });
    // identificado pela chave do Wikidata, com o que foi modelado (a estufa, outro objeto do OSM)
    expect(calls.identified![0]).toEqual([
      'job-1',
      'wikidata:Q94923',
      'Jardim Botânico de Curitiba',
      'Q94923',
      { osm_type: 'way', osm_id: 261127581, name: 'Estufa Jardim Botânico' },
    ]);
    // a receita guardada com as fontes: só título, autor, licença e URL
    const [, recipe, modeled, srcs] = calls.store![0] as [
      string,
      unknown,
      unknown,
      { photos: { title: string; license: string }[]; outline: string },
    ];
    expect(recipe).toEqual(RECIPE);
    expect(modeled).toEqual({ osm_type: 'way', osm_id: 261127581, name: 'Estufa Jardim Botânico' });
    expect(srcs.photos.map((p) => p.license)).toEqual(['CC BY-SA 2.0', 'CC BY 4.0', 'CC0']);
    expect(srcs.outline).toBe('osm');
    // a IA viu as fotos (blocos image antes do texto) e a planta da estufa em metros
    const recipeCall = params[1] as {
      messages: { content: { type: string; text?: string }[] }[];
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const content = recipeCall.messages[0]!.content;
    expect(content.filter((b) => b.type === 'image')).toHaveLength(3);
    expect(content.at(-1)?.text).toContain('o contorno em planta');
    expect(content.at(-1)?.text).toContain('a peça: Estufa Jardim Botânico');
    expect(content.at(-1)?.text).toContain('18 : 11 : 14');
    expect(recipeCall.output_config.format.schema.properties).toHaveProperty('shapes');
    // dois registros de IA (o que modelar, a receita), só números e códigos
    expect(calls.record).toHaveLength(2);
    expect(calls.record![1]![0]).toMatchObject({
      user_id: 'user-1',
      trip_id: 'trip-1',
      status: 'succeeded',
      input_tokens: 5_000,
      output_tokens: 900,
    });
    // nada da pessoa no log: o Q-id e os códigos
    expect(log.join('\n')).toContain('key=wikidata:Q94923');
    expect(log.join('\n')).not.toContain('user-1');
    expect(log.join('\n')).not.toContain('trip-1');
    // o Nominatim foi chamado em série, com o User-Agent, e o Commons com as fotos em lote
    expect(http.every((c) => c.ua?.startsWith('Viajei/'))).toBe(true);
    expect(http.filter((c) => c.url.includes('upload.wikimedia'))).toHaveLength(3 + 1);
  });

  it('o mesmo item do Wikidata já no catálogo: o lugar só aponta para ele, sem IA', async () => {
    const { rpc, calls } = rpcOf(JOB, {
      identified: () => Promise.resolve({ landmark_id: 'lm-9', linked: true }),
    });
    const { ai } = aiOf([{ subject_index: 0, reason: 'x' }]);
    const result = await runLandmarkJob({
      rpc,
      fetch: sources().fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toEqual({ status: 'linked', job: 'job-1' });
    expect(calls.store).toHaveLength(0);
    // só a chamada do que modelar aconteceu antes de saber que já existia
    expect(ai).toHaveBeenCalledTimes(1);
  });

  it('sem item do Wikidata perto, no_wikidata e o lugar fica sem peça (sem retentativa)', async () => {
    const { rpc, calls } = rpcOf({
      ...JOB,
      input: { name: 'Padaria da esquina', lat: -25.4428, lng: -49.2392, stop_kind: 'food' },
    });
    const { fetch } = fakeFetch([
      [
        /nominatim.*\/search/,
        json([
          {
            ...MUSEUM,
            name: 'Padaria da esquina',
            category: 'shop',
            type: 'bakery',
            extratags: {},
          },
        ]),
      ],
      [/wbsearchentities/, json({ search: [] })],
    ]);
    const { ai } = aiOf([]);
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toEqual({ status: 'failed', job: 'job-1', code: 'no_wikidata', retry: false });
    expect(calls.fail![0]).toEqual(['job-1', 'no_wikidata', false]);
    expect(ai).not.toHaveBeenCalled();
  });

  it('só fotos sem licença livre: no_free_license', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const closed = JSON.parse(JSON.stringify(IMAGE_INFO)) as typeof IMAGE_INFO;
    for (const page of Object.values(closed.query.pages))
      page.imageinfo[0]!.extmetadata.LicenseShortName.value = 'All Rights Reserved';
    const { fetch } = fakeFetch([
      [/nominatim.*\/lookup/, json([PARK])],
      [/nominatim.*\/search/, json([GREENHOUSE])],
      [/Special:EntityData/, json(Q94923)],
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(closed)],
    ]);
    const { ai } = aiOf([{ subject_index: 1, reason: 'x' }]);
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'failed', code: 'no_free_license', retry: false });
    expect(calls.store).toHaveLength(0);
  });

  it('a receita que não passa no schema: ai_invalid, com retentativa, e o registro diz invalid', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const { ai } = aiOf([
      { subject_index: 0, reason: 'x' },
      { v: 1, shapes: [{ k: 'teapot' }] },
    ]);
    const result = await runLandmarkJob({
      rpc,
      fetch: sources().fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'failed', code: 'ai_invalid', retry: true });
    expect(calls.fail![0]).toEqual(['job-1', 'ai_invalid', true]);
  });

  it('a IA que recusa: ai_failed sem retentativa, registrada como refused', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const ai = vi.fn(() => Promise.resolve(aiMessage({}, { stop_reason: 'refusal', content: [] })));
    const result = await runLandmarkJob({
      rpc,
      fetch: sources().fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'failed', code: 'ai_failed', retry: false });
    expect(calls.record![0]![0]).toMatchObject({ status: 'refused', error: 'refusal' });
  });

  it('a cidade de passagem: a IA propõe, o mapa e o Wikidata conferem dentro do município', async () => {
    const city: LandmarkJob = {
      ...JOB,
      id: 'job-c',
      place_key: 'city:PR:curitiba',
      place_kind: 'city',
      input: { name: 'Curitiba', uf: 'PR' },
    };
    const { rpc, calls } = rpcOf(city);
    const { fetch } = fakeFetch([
      [
        /nominatim.*q=Curitiba%2C\+PR/,
        json([
          {
            ...PARK,
            osm_type: 'relation',
            osm_id: 297514,
            name: 'Curitiba',
            category: 'boundary',
            type: 'administrative',
            boundingbox: ['-25.65', '-25.34', '-49.39', '-49.18'],
            extratags: {},
          },
        ]),
      ],
      [/nominatim.*q=Jardim\+Bot/, json([PARK])],
      [/Special:EntityData\/Q94923/, json(Q94923)],
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(IMAGE_INFO)],
      [/upload\.wikimedia/, png()],
    ]);
    const { ai } = aiOf([
      { name: 'Jardim Botânico de Curitiba', kind: 'park', alternative: '' },
      RECIPE,
    ]);
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'generated' });
    expect(calls.identified![0]![1]).toBe('wikidata:Q94923');
  });

  it('a cidade sem cartão-postal conferível: no_subject, e fica só com o nome', async () => {
    const city: LandmarkJob = {
      ...JOB,
      id: 'job-c',
      place_key: 'city:PR:cidade-pequena',
      place_kind: 'city',
      input: { name: 'Cidade Pequena', uf: 'PR' },
    };
    const { rpc } = rpcOf(city);
    const { fetch } = fakeFetch([
      [
        /nominatim.*q=Cidade/,
        json([
          {
            ...PARK,
            osm_type: 'relation',
            osm_id: 1,
            name: 'Cidade Pequena',
            category: 'boundary',
            type: 'administrative',
            boundingbox: ['-25.65', '-25.34', '-49.39', '-49.18'],
            extratags: {},
          },
        ]),
      ],
      // a IA propõe um monumento que o mapa não acha dentro do município
      [
        /nominatim.*q=Monumento/,
        json([{ ...MUSEUM, lat: '-20.0', lon: '-40.0', name: 'Monumento X' }]),
      ],
    ]);
    const { ai } = aiOf([{ name: 'Monumento X', kind: 'monument', alternative: '' }]);
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'failed', code: 'no_subject', retry: false });
    const none = await runLandmarkJob({
      rpc,
      fetch,
      ai: vi.fn(() => Promise.resolve(aiMessage({ name: '', kind: 'none', alternative: '' }))),
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(none).toMatchObject({ status: 'failed', code: 'no_subject' });
  });

  it('refazer: a variante pede outra leitura da mesma peça, com as mesmas fontes', async () => {
    const remake: LandmarkJob = {
      ...JOB,
      id: 'job-r',
      kind: 'remake',
      variant: 2,
      input: { variant: 2 },
      landmark: {
        id: 'lm-1',
        key: 'wikidata:Q94923',
        name: 'Jardim Botânico de Curitiba',
        wikidata: 'Q94923',
        modeled: { osm_type: 'way', osm_id: 261127581, name: 'Estufa' },
        recipe: RECIPE,
        sources: {},
      },
    };
    const { rpc, calls } = rpcOf(remake);
    const { ai, params } = aiOf([RECIPE]);
    const { fetch } = fakeFetch([
      [/nominatim.*\/lookup\?osm_ids=W261127581/, json([GREENHOUSE])],
      [/Special:EntityData\/Q94923/, json(Q94923)],
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(IMAGE_INFO)],
      [/upload\.wikimedia/, png()],
    ]);
    const result = await runLandmarkJob({
      rpc,
      fetch,
      ai,
      log: () => undefined,
      sleep: () => Promise.resolve(),
    });
    expect(result).toMatchObject({ status: 'generated', landmark_id: 'lm-1' });
    expect(calls.store![0]![0]).toBe('job-r');
    const text =
      (
        params[0] as { messages: { content: { type: string; text?: string }[] }[] }
      ).messages[0]!.content.at(-1)?.text ?? '';
    expect(text).toContain('variante 2');
  });
});
