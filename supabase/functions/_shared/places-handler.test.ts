import { describe, expect, it } from 'vitest';
import {
  GEOAPIFY_PLACES_URL,
  geoapifyRequest,
  handlePlaces,
  mergePlaces,
  placeOf,
  type PlacesDeps,
} from './places-handler.ts';
import { placesRequestSchema, placesResponseSchema, type PlacesRequest } from './places-schema.ts';

/**
 * A `find-places` com entrada fixa (fase 24): um `fetch` de mentira que devolve respostas gravadas da
 * Geoapify (o formato da especificação pública: um GeoJSON de pontos com `datasource.raw`), sem rede e
 * sem crédito, e uma cota de mentira.
 */
const KEY = 'chave-de-teste-0123456789abcdef';
const feature = (over: Record<string, unknown> = {}, raw: Record<string, unknown> = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-49.1718, -26.7404] },
  properties: {
    place_id: 'p-torten',
    name: 'Torten Paradies',
    lat: -26.7404,
    lon: -49.1718,
    categories: ['catering', 'catering.cafe'],
    city: 'Pomerode',
    formatted: 'Torten Paradies, Rua XV de Novembro, Pomerode - SC, Brasil',
    distance: 1200,
    datasource: {
      sourcename: 'openstreetmap',
      attribution: '© OpenStreetMap contributors',
      raw: { osm_id: 4944605516, osm_type: 'n', opening_hours: 'Tu-Su 13:00-19:00', ...raw },
    },
    ...over,
  },
});
const collection = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

const circle: PlacesRequest = {
  categories: ['catering.cafe', 'catering.restaurant'],
  names: ['colonial'],
  area: { type: 'circle', lng: -49.18, lat: -26.74, radius_m: 30_000 },
  near: { lng: -49.18, lat: -26.74 },
};
const corridor: PlacesRequest = {
  categories: ['entertainment.zoo', 'tourism.attraction.viewpoint'],
  area: {
    type: 'corridor',
    line: [
      [-50.27, -26.37],
      [-49.6, -26.5],
      [-49.18, -26.74],
    ],
    buffer_m: 8_000,
  },
};

const post = (json: unknown) =>
  new Request('https://x.supabase.co/functions/v1/find-places', {
    method: 'POST',
    body: JSON.stringify(json),
  });

function deps(responses: (Response | Error)[], over: Partial<PlacesDeps> = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const logs: string[] = [];
  let claims = 0;
  const d: PlacesDeps = {
    key: KEY,
    claim: () => {
      claims += 1;
      return Promise.resolve('ok');
    },
    fetch: (input, init) => {
      calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
      const next = responses.shift() ?? new Response('{}', { status: 500 });
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    log: (line) => logs.push(line),
    now: () => 0,
    ...over,
  };
  return { d, calls, logs, claims: () => claims };
}
const json = (body: unknown, status = 200) => Response.json(body, { status });

describe('find-places: o pedido à Geoapify', () => {
  it('o círculo vai por GET, com as categorias, o filtro, a proximidade, o nome e o limite', () => {
    const { url, init } = geoapifyRequest(placesRequestSchema.parse(circle), 'colonial', KEY);
    const u = new URL(url);
    expect(`${u.origin}${u.pathname}`).toBe(GEOAPIFY_PLACES_URL);
    expect(Object.fromEntries(u.searchParams)).toEqual({
      categories: 'catering.cafe,catering.restaurant',
      filter: 'circle:-49.18,-26.74,30000',
      bias: 'proximity:-49.18,-26.74',
      name: 'colonial',
      limit: '20',
      lang: 'pt',
    });
    expect(init.method).toBe('GET');
    // a chave vai no cabeçalho, nunca na URL
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY);
  });

  it('o corredor vai por POST, com a linha em GeoJSON e a faixa em metros', () => {
    const { url, init } = geoapifyRequest(placesRequestSchema.parse(corridor), null, KEY);
    expect(url).toBe(GEOAPIFY_PLACES_URL);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      categories: ['entertainment.zoo', 'tourism.attraction.viewpoint'],
      filter: {
        type: 'polyline',
        geometry: {
          type: 'LineString',
          coordinates: [
            [-50.27, -26.37],
            [-49.6, -26.5],
            [-49.18, -26.74],
          ],
        },
        buffer: 8000,
      },
      limit: 20,
      lang: 'pt',
    });
  });

  it('o pedido fora dos limites é recusado antes de qualquer coisa', () => {
    const bad = [
      { ...circle, categories: [] },
      { ...circle, categories: ['catering.cafe; drop'] },
      { ...circle, names: ['a', 'b', 'c', 'd'] },
      { ...circle, area: { ...circle.area, radius_m: 900_000 } },
      { ...corridor, area: { type: 'corridor', line: [[-50, -26]], buffer_m: 8000 } },
      { ...circle, limit: 21 },
    ];
    for (const b of bad)
      expect(placesRequestSchema.safeParse(b).success, JSON.stringify(b)).toBe(false);
  });
});

describe('find-places: a resposta', () => {
  it('o lugar como o app usa: o nome do mapa, a cidade, o horário só quando vem, o objeto do OSM', () => {
    expect(placeOf(feature())).toEqual({
      id: 'p-torten',
      name: 'Torten Paradies',
      lat: -26.7404,
      lng: -49.1718,
      categories: ['catering', 'catering.cafe'],
      city: 'Pomerode',
      address: 'Torten Paradies, Rua XV de Novembro, Pomerode - SC, Brasil',
      opening_hours: 'Tu-Su 13:00-19:00',
      website: null,
      cuisine: null,
      osm: { type: 'node', id: 4944605516 },
      distance_m: 1200,
    });
    // a cozinha do OSM, quando vem: o café colonial sem "colonial" no nome (o Torten Paradies)
    expect(
      placeOf(feature({}, { cuisine: 'german;breakfast;coffee_shop;regional' }))?.cuisine,
    ).toBe('german;breakfast;coffee_shop;regional');
    // sem horário no mapa, sem horário: nada se inventa
    expect(placeOf(feature({}, { opening_hours: undefined }))?.opening_hours).toBeNull();
    // sem nome, não é um lugar que se escolhe
    expect(placeOf(feature({ name: undefined }))).toBeNull();
    expect(placeOf({ properties: { name: 'x' } })).toBeNull();
  });

  it('uma busca por palavra, juntas sem repetir, os mais perto primeiro', async () => {
    const two = { ...circle, names: ['colonial', 'cuca'] };
    const mahlzeit = feature({
      place_id: 'p-mahlzeit',
      name: 'Mahlzeit Café Colonial',
      distance: 400,
    });
    const { d, calls, logs } = deps([
      json(collection(feature(), mahlzeit)),
      json(collection(feature())),
    ]);
    const res = await handlePlaces(post(two), d);
    expect(res.status).toBe(200);
    const body = placesResponseSchema.parse(await res.json());
    expect(body.provider).toBe('geoapify');
    expect(body.places.map((p) => p.name)).toEqual(['Mahlzeit Café Colonial', 'Torten Paradies']);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => new URL(c.url).searchParams.get('name'))).toEqual(['colonial', 'cuca']);
    // o log: números e o código, nada da pessoa (nem as palavras, nem a posição, nem a chave)
    expect(logs).toEqual([
      'find-places status=ok area=circle categories=2 names=2 requests=2 places=2 ms=0',
    ]);
    expect(logs.join('\n')).not.toMatch(/colonial|cuca|Pomerode|-49|-26|chave/);
  });

  it('mergePlaces mantém a ordem da Geoapify quando falta a distância', () => {
    const a = placeOf(feature({ place_id: 'a', distance: undefined }))!;
    const b = placeOf(feature({ place_id: 'b', distance: undefined }))!;
    expect(mergePlaces([[b], [a, b]]).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('find-places: sem fonte, a cota e os erros', () => {
  it('sem a chave: no_source (503) antes de gastar cota e sem chamar a Geoapify', async () => {
    const { d, calls, claims, logs } = deps([], { key: undefined });
    const res = await handlePlaces(post(circle), d);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'no_source' } });
    expect(claims()).toBe(0);
    expect(calls).toEqual([]);
    expect(logs[0]).toMatch(/^find-places status=no_source/);
  });

  it('a chave que não vale (401) também é "sem fonte": o app busca pelo nome', async () => {
    const { d } = deps([
      json({ statusCode: 401, error: 'Unauthorized', message: 'Invalid apiKey' }, 401),
    ]);
    const res = await handlePlaces(post(circle), d);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'no_source' } });
  });

  it('a cota da pessoa: 429, sem chamar a Geoapify', async () => {
    const { d, calls } = deps([], { claim: () => Promise.resolve('limit') });
    const res = await handlePlaces(post(circle), d);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } });
    expect(calls).toEqual([]);
  });

  it('a cota da Geoapify (429 dela), o prazo, o 500 e a resposta fora do formato', async () => {
    const cases: [Response | Error, number, string][] = [
      [
        json({ statusCode: 429, error: 'Too Many Requests', message: 'Quota exceeded' }, 429),
        503,
        'provider_quota',
      ],
      [new DOMException('The operation timed out.', 'TimeoutError'), 502, 'provider_failed'],
      [json({ statusCode: 500 }, 500), 502, 'provider_failed'],
      [json({ type: 'nada' }), 502, 'provider_failed'],
    ];
    for (const [response, status, code] of cases) {
      const { d } = deps([response]);
      const res = await handlePlaces(post(circle), d);
      expect(res.status, code).toBe(status);
      expect(await res.json()).toMatchObject({ error: { code } });
    }
  });

  it('o pedido fora do formato: 400, sem cota', async () => {
    const { d, claims } = deps([]);
    const res = await handlePlaces(post({ categories: ['x'] }), d);
    expect(res.status).toBe(400);
    expect(claims()).toBe(0);
  });

  it('a resposta de erro nunca leva a chave', async () => {
    const { d } = deps([json({ statusCode: 500, message: KEY }, 500)]);
    const res = await handlePlaces(post(circle), d);
    expect(await res.text()).not.toContain(KEY);
  });
});
