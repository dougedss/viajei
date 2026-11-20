import { describe, expect, it, vi } from 'vitest';
import {
  aiMessage,
  CATEGORY_FILES,
  DETAILS_BAKERY,
  DETAILS_GREENHOUSE,
  DETAILS_PARK,
  fakeFetch,
  GEOCODE_BAKERY,
  GEOCODE_GREENHOUSE,
  GEOCODE_PARK,
  IMAGE_INFO,
  json,
  PLACES_AROUND,
  png,
  Q94923,
  RECIPE,
} from './landmark-fixtures.ts';
import { runLandmarkJob, type LandmarkJob, type WorkerRpc } from './landmark-worker.ts';

/**
 * O trabalhador da fila (fase 23) com tudo de mentira: a Geoapify (a geocodificação, o detalhe, os
 * lugares ao redor), o Wikidata, o Commons e a IA. O que ele prova: a corrente inteira do lugar da
 * régua (o parque é o lugar, a estufa é a peça), a cidade com e sem conferência, o filtro de licença,
 * os códigos de erro, o registro só de números, nada da pessoa no log, a chave nunca na URL.
 */
const KEY = 'chave-de-teste';
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

/** As fontes da régua: o parque pelo nome, o detalhe dele, os POIs ao redor, a estufa pelo nome. */
const sources = (extra: [RegExp, () => Response][] = []) =>
  fakeFetch([
    ...extra,
    [/geocode\/search\?text=Jardim/, json(GEOCODE_PARK)],
    [/geocode\/search\?text=Estufa/, json(GEOCODE_GREENHOUSE)],
    [/place-details\?id=pid-park/, json(DETAILS_PARK)],
    [/place-details\?id=pid-estufa/, json(DETAILS_GREENHOUSE)],
    [/v2\/places\?/, json(PLACES_AROUND)],
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
const base = { geoapifyKey: KEY, log: () => undefined, sleep: () => Promise.resolve() };

describe('o trabalhador da fila dos cartões-postais', () => {
  it('sem fila, nada', async () => {
    const { rpc } = rpcOf(null);
    const { ai } = aiOf([]);
    const result = await runLandmarkJob({ ...base, rpc, fetch: sources().fetch, ai });
    expect(result).toEqual({ status: 'idle' });
    expect(ai).not.toHaveBeenCalled();
  });

  it('a régua: o parque é o lugar, a IA escolhe a estufa entre os objetos do mapa, as fotos livres, a receita', async () => {
    const { rpc, calls } = rpcOf(JOB);
    // os objetos ao redor: o museu e a escultura (a Places) e a estufa (a geocodificação pelo nome do
    // item e pelo nome dito, aqui a mesma resposta); a estufa é o último da lista
    const { ai, params } = aiOf([
      { subject_index: 3, reason: 'a estufa é o que as fotos mostram' },
      RECIPE,
    ]);
    const log: string[] = [];
    const { fetch, calls: http } = fakeFetch([
      [/geocode\/search\?text=Jardim\+Bot%C3%A2nico\+de\+Curitiba/, json(GEOCODE_GREENHOUSE)],
      [/geocode\/search\?text=Jardim/, json(GEOCODE_PARK)],
      [/place-details\?id=pid-park/, json(DETAILS_PARK)],
      [/place-details\?id=pid-estufa/, json(DETAILS_GREENHOUSE)],
      [/v2\/places\?/, json(PLACES_AROUND)],
      [/Special:EntityData\/Q94923/, json(Q94923)],
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(IMAGE_INFO)],
      [/upload\.wikimedia/, png()],
    ]);
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai, log: (l) => log.push(l) });
    expect(result).toMatchObject({ status: 'generated', landmark_id: 'lm-1', photos: 3 });
    // identificado pela chave do Wikidata, com o que foi modelado (a estufa, outro objeto do OSM)
    expect(calls.identified?.[0]).toEqual([
      'job-1',
      'wikidata:Q94923',
      'Jardim Botânico de Curitiba',
      'Q94923',
      {
        osm_type: 'way',
        osm_id: 261127581,
        name: 'Estufa Jardim Botânico',
        place_id: 'pid-estufa',
      },
    ]);
    // a receita guardada com as fontes: só título, autor, licença e URL
    const [, recipe, modeled, srcs] = calls.store?.[0] as [
      string,
      unknown,
      unknown,
      { photos: { title: string; license: string }[]; outline: string },
    ];
    expect(recipe).toEqual(RECIPE);
    expect(modeled).toMatchObject({ osm_type: 'way', osm_id: 261127581 });
    expect(srcs.photos.map((p) => p.license)).toEqual(['CC BY-SA 2.0', 'CC BY 4.0', 'CC0']);
    expect(srcs.outline).toBe('osm');
    // a IA viu a lista dos objetos (o lugar como 0) e as fotos; a receita levou a planta da estufa
    const subjectCall = params[0] as { messages: { content: { type: string; text?: string }[] }[] };
    const subjectText = subjectCall.messages[0]?.content.at(-1)?.text ?? '';
    expect(subjectText).toContain('0. Jardim Botânico de Curitiba (leisure=park');
    expect(subjectText).toContain('Estufa Jardim Botânico (building=building');
    const recipeCall = params[1] as {
      messages: { content: { type: string; text?: string }[] }[];
      output_config: { format: { schema: { properties: Record<string, unknown> } } };
    };
    const content = recipeCall.messages[0]?.content ?? [];
    expect(content.filter((b) => b.type === 'image')).toHaveLength(3);
    expect(content.at(-1)?.text).toContain('o contorno em planta');
    expect(content.at(-1)?.text).toContain('a peça: Estufa Jardim Botânico');
    expect(content.at(-1)?.text).toContain('18 : 11 : 14');
    expect(recipeCall.output_config.format.schema.properties).toHaveProperty('shapes');
    // dois registros de IA (o que modelar, a receita), só números e códigos
    expect(calls.record).toHaveLength(2);
    expect(calls.record?.[1]?.[0]).toMatchObject({
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
    // a Geoapify com a chave no cabeçalho e nunca na URL; o Wikimedia com o User-Agent
    const geo = http.filter((c) => c.url.includes('api.geoapify.com'));
    expect(geo.length).toBeGreaterThan(3);
    expect(geo.every((c) => c.key === KEY && !c.url.includes(KEY))).toBe(true);
    expect(
      http
        .filter((c) => c.url.includes('wikimedia') || c.url.includes('wikidata'))
        .every((c) => c.ua?.startsWith('Viajei/')),
    ).toBe(true);
    expect(http.filter((c) => c.url.includes('upload.wikimedia'))).toHaveLength(3 + 1);
  });

  it('o mesmo item do Wikidata já no catálogo: o lugar só aponta para ele, sem IA', async () => {
    const { rpc, calls } = rpcOf(JOB, {
      identified: () => Promise.resolve({ landmark_id: 'lm-9', linked: true }),
    });
    const { ai } = aiOf([{ subject_index: 0, reason: 'x' }]);
    const result = await runLandmarkJob({ ...base, rpc, fetch: sources().fetch, ai });
    expect(result).toEqual({ status: 'linked', job: 'job-1' });
    expect(calls.store).toHaveLength(0);
    expect(ai).toHaveBeenCalledTimes(1);
  });

  it('sem item do Wikidata perto, no_wikidata e o lugar fica sem peça (sem retentativa)', async () => {
    const { rpc, calls } = rpcOf({
      ...JOB,
      input: { name: 'Padaria da esquina', lat: -25.4428, lng: -49.2392, stop_kind: 'food' },
    });
    const { fetch } = fakeFetch([
      [/geocode\/search/, json(GEOCODE_BAKERY)],
      [/place-details\?id=pid-padaria/, json(DETAILS_BAKERY)],
      [/wbsearchentities/, json({ search: [] })],
    ]);
    const { ai } = aiOf([]);
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai });
    expect(result).toEqual({ status: 'failed', job: 'job-1', code: 'no_wikidata', retry: false });
    expect(calls.fail?.[0]).toEqual(['job-1', 'no_wikidata', false]);
    expect(ai).not.toHaveBeenCalled();
  });

  it('sem a chave da Geoapify, ou com a fonte recusando: source_failed, com retentativa e o detalhe no log', async () => {
    const log: string[] = [];
    const { rpc } = rpcOf(JOB);
    const { ai } = aiOf([]);
    const noKey = await runLandmarkJob({
      ...base,
      geoapifyKey: undefined,
      rpc,
      fetch: sources().fetch,
      ai,
    });
    expect(noKey).toMatchObject({ status: 'failed', code: 'source_failed', retry: true });
    const { fetch } = fakeFetch([
      [/geocode\/search/, () => new Response('blocked', { status: 403 })],
    ]);
    const refused = await runLandmarkJob({ ...base, rpc, fetch, ai, log: (l) => log.push(l) });
    expect(refused).toMatchObject({ status: 'failed', code: 'source_failed', retry: true });
    expect(log.at(-1)).toContain('detail=geoapify:403');
    expect(log.join('\n')).not.toContain(KEY);
  });

  it('só fotos sem licença livre: no_free_license', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const closed = JSON.parse(JSON.stringify(IMAGE_INFO)) as typeof IMAGE_INFO;
    for (const page of Object.values(closed.query.pages))
      page.imageinfo[0]!.extmetadata.LicenseShortName.value = 'All Rights Reserved';
    const { fetch } = sources([[/prop=imageinfo/, json(closed)]]);
    const { ai } = aiOf([{ subject_index: 1, reason: 'x' }]);
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai });
    expect(result).toMatchObject({ status: 'failed', code: 'no_free_license', retry: false });
    expect(calls.store).toHaveLength(0);
  });

  it('a receita que não passa no schema: ai_invalid, com retentativa, e o registro diz invalid', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const { ai } = aiOf([
      { subject_index: 0, reason: 'x' },
      { v: 1, shapes: [{ k: 'teapot' }] },
    ]);
    const result = await runLandmarkJob({ ...base, rpc, fetch: sources().fetch, ai });
    expect(result).toMatchObject({ status: 'failed', code: 'ai_invalid', retry: true });
    expect(calls.fail?.[0]).toEqual(['job-1', 'ai_invalid', true]);
  });

  it('a IA que recusa: ai_failed sem retentativa, registrada como refused', async () => {
    const { rpc, calls } = rpcOf(JOB);
    const ai = vi.fn(() => Promise.resolve(aiMessage({}, { stop_reason: 'refusal', content: [] })));
    const result = await runLandmarkJob({ ...base, rpc, fetch: sources().fetch, ai });
    expect(result).toMatchObject({ status: 'failed', code: 'ai_failed', retry: false });
    expect(calls.record?.[0]?.[0]).toMatchObject({ status: 'refused', error: 'refusal' });
  });

  it('a cidade de passagem: a IA propõe, o mapa (dentro do município) e o Wikidata conferem', async () => {
    const city: LandmarkJob = {
      ...JOB,
      id: 'job-c',
      place_key: 'city:PR:curitiba',
      place_kind: 'city',
      input: { name: 'Curitiba', uf: 'PR' },
    };
    const { rpc, calls } = rpcOf(city);
    const { fetch, calls: http } = fakeFetch([
      [
        /geocode\/search\?text=Curitiba%2C\+PR%2C\+Brasil/,
        json({
          results: [
            {
              place_id: 'pid-curitiba',
              name: 'Curitiba',
              lat: -25.43,
              lon: -49.27,
              bbox: { lon1: -49.39, lat1: -25.65, lon2: -49.18, lat2: -25.34 },
              result_type: 'city',
            },
          ],
        }),
      ],
      [/geocode\/search\?text=Jardim/, json(GEOCODE_PARK)],
      [/place-details\?id=pid-park/, json(DETAILS_PARK)],
      [/Special:EntityData\/Q94923/, json(Q94923)],
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(IMAGE_INFO)],
      [/upload\.wikimedia/, png()],
    ]);
    const { ai } = aiOf([
      { name: 'Jardim Botânico de Curitiba', kind: 'park', alternative: '' },
      RECIPE,
    ]);
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai });
    expect(result).toMatchObject({ status: 'generated' });
    expect(calls.identified?.[0]?.[1]).toBe('wikidata:Q94923');
    expect(http.find((c) => c.url.includes('text=Curitiba'))?.url).toContain('type=city');
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
        /geocode\/search\?text=Cidade/,
        json({
          results: [
            {
              place_id: 'pid-cp',
              name: 'Cidade Pequena',
              lat: -25.5,
              lon: -49.3,
              bbox: { lon1: -49.39, lat1: -25.65, lon2: -49.18, lat2: -25.34 },
              result_type: 'city',
            },
          ],
        }),
      ],
      // a IA propõe um monumento que o mapa só acha fora do município
      [
        /geocode\/search\?text=Monumento/,
        json({
          results: [
            { place_id: 'pid-x', name: 'Monumento X', lat: -20, lon: -40, result_type: 'amenity' },
          ],
        }),
      ],
    ]);
    const { ai } = aiOf([{ name: 'Monumento X', kind: 'monument', alternative: '' }]);
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai });
    expect(result).toMatchObject({ status: 'failed', code: 'no_subject', retry: false });
    const none = await runLandmarkJob({
      ...base,
      rpc,
      fetch,
      ai: vi.fn(() => Promise.resolve(aiMessage({ name: '', kind: 'none', alternative: '' }))),
    });
    expect(none).toMatchObject({ status: 'failed', code: 'no_subject' });
  });

  it('refazer: a variante pede outra leitura da mesma peça, com as mesmas fontes e a planta pelo place_id', async () => {
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
        modeled: { osm_type: 'way', osm_id: 261127581, name: 'Estufa', place_id: 'pid-estufa' },
        recipe: RECIPE,
        sources: {},
      },
    };
    const { rpc, calls } = rpcOf(remake);
    const { ai, params } = aiOf([RECIPE]);
    const { fetch } = sources();
    const result = await runLandmarkJob({ ...base, rpc, fetch, ai });
    expect(result).toMatchObject({ status: 'generated', landmark_id: 'lm-1' });
    expect(calls.store?.[0]?.[0]).toBe('job-r');
    const text =
      (
        params[0] as { messages: { content: { type: string; text?: string }[] }[] }
      ).messages[0]?.content.at(-1)?.text ?? '';
    expect(text).toContain('variante 2');
    expect(text).toContain('o contorno em planta');
  });
});
