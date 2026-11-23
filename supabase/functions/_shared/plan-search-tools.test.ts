import { describe, expect, it } from 'vitest';
import { GOOGLE_PLACES_URL } from './google-places.ts';
import { GOOGLE_ROUTE_MATRIX_URL } from './google-routes.ts';
import { TOOL_NAMES } from './plan-search-ai.ts';
import { PLAN_SEARCH_MAX_SEARCHES, PLAN_SEARCH_MAX_TOOL_CALLS } from './plan-search-protocol.ts';
import { outingFromSearches, pickCity, routeCircles, ToolState } from './plan-search-tools.ts';

/**
 * As ferramentas do planejador (fase 27) com a rede de mentira: o Google responde pela `textQuery`
 * (lugares inventados), a geocodificação da Geoapify resolve a cidade, e a Places da Geoapify é a
 * reserva. A IA só vê o resumo; os lugares inteiros ficam no estado pela referência; a chave nunca
 * aparece no que vai para a IA.
 */
const GOOGLE_KEY = 'AIzaChaveDoGoogleDeTeste000000000000';
const GEO_KEY = 'chave-geoapify-de-teste-0123456789ab';
const MAJOR_VIEIRA = { lat: -26.37, lng: -50.33 };
const CANOINHAS = { lat: -26.1765, lng: -50.39 };

const gplace = (
  id: string,
  name: string,
  city: string,
  lat: number,
  lng: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  displayName: { text: name },
  formattedAddress: `${name}, ${city} - SC, Brasil`,
  addressComponents: [
    { longText: city, types: ['administrative_area_level_2'] },
    { longText: 'Santa Catarina', shortText: 'SC', types: ['administrative_area_level_1'] },
  ],
  location: { latitude: lat, longitude: lng },
  types: ['cafe', 'food'],
  rating: 4.6,
  userRatingCount: 212,
  businessStatus: 'OPERATIONAL',
  currentOpeningHours: { openNow: true },
  ...extra,
});
const CAFES = [
  gplace('g-cafe-1', 'Café do Relógio', 'Canoinhas', -26.177, -50.391),
  gplace('g-cafe-2', 'Cantinho do Pão', 'Canoinhas', -26.18, -50.395),
  gplace('g-cafe-3', 'Café do Rio', 'Três Barras', -26.1, -50.32),
];
const geocodeHit = (city: string, lat: number, lon: number, country_code = 'br') => ({
  lat,
  lon,
  city,
  name: city,
  formatted: `${city}, Santa Catarina, Brasil`,
  country_code,
  result_type: 'city',
});

type Call = { url: string; body: Record<string, unknown> | null; headers: Record<string, string> };
function network(
  answer: (textQuery: string) => unknown[] | { status: number },
  options: {
    geocode?: unknown[];
    geoapifyPlaces?: unknown[];
    routes?: unknown[] | { status: number };
  } = {},
) {
  const calls: Call[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
    calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.startsWith(GOOGLE_PLACES_URL)) {
      const out = answer(typeof body?.textQuery === 'string' ? body.textQuery : '');
      return Promise.resolve(
        Array.isArray(out)
          ? Response.json({ places: out })
          : Response.json({ error: { code: out.status, status: 'X' } }, { status: out.status }),
      );
    }
    // a Routes API (D310): um elemento medido por par, 25 min e 26 km, se o teste não disser outra coisa
    if (url.startsWith(GOOGLE_ROUTE_MATRIX_URL)) {
      const routes = options.routes ?? [
        { status: {}, duration: '1480s', distanceMeters: 26_100, condition: 'ROUTE_EXISTS' },
      ];
      return Promise.resolve(
        Array.isArray(routes)
          ? Response.json(routes)
          : Response.json([{ error: { code: routes.status, status: 'PERMISSION_DENIED' } }], {
              status: routes.status,
            }),
      );
    }
    if (url.includes('/v1/geocode/search')) {
      return Promise.resolve(Response.json({ results: options.geocode ?? [] }));
    }
    if (url.includes('/v2/places')) {
      return Promise.resolve(Response.json({ features: options.geoapifyPlaces ?? [] }));
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  };
  return { fetch, calls };
}
const state = (
  net: ReturnType<typeof network>,
  over: Partial<ConstructorParameters<typeof ToolState>[0]> = {},
) =>
  new ToolState({
    fetch: net.fetch,
    googleKey: GOOGLE_KEY,
    geoapifyKey: GEO_KEY,
    reference: MAJOR_VIEIRA,
    ...over,
  });
const search = (over: Record<string, unknown> = {}, onde: Record<string, unknown> = {}) => ({
  o_que: 'café',
  onde: {
    tipo: 'cidade',
    cidade: 'Canoinhas',
    lat: 0,
    lng: 0,
    lat2: 0,
    lng2: 0,
    raio_km: 0,
    ...onde,
  },
  tipo_google: 'cafe',
  aberto_agora: false,
  nota_minima: 0,
  ...over,
});

describe('procurar_lugares', () => {
  it('dentro da cidade: a cidade resolvida com o viés de onde a pessoa sai, a busca "café em Canoinhas" num círculo em volta dela, e só o que é de Canoinhas volta, com referência, nota e aberto agora', async () => {
    const net = network(() => CAFES, {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const s = state(net);
    const result = await s.run(TOOL_NAMES.search, search());
    expect(result.is_error).toBe(false);
    expect(result.content).toContain('2 lugares para "café" em Canoinhas');
    expect(result.content).toContain(
      'p1 · Café do Relógio · Canoinhas · tipo cafe · nota 4,6 (212 avaliações) · aberto agora',
    );
    expect(result.content).toContain('p2 · Cantinho do Pão');
    expect(result.content).not.toContain('Café do Rio');
    expect(result.content).not.toContain(GOOGLE_KEY);
    // o estado guarda os lugares inteiros pela referência; o vizinho não entrou
    expect(s.found.map((f) => [f.ref, f.place.name])).toEqual([
      ['p1', 'Café do Relógio'],
      ['p2', 'Cantinho do Pão'],
    ]);
    expect(s.placeOf('p1')?.google_place_id).toBe('g-cafe-1');
    expect(s.isNeighbor('p1')).toBe(false);
    expect(s.provider).toBe('google');
    expect(s.requests).toBe(1);
    // a geocodificação da cidade com o viés, e o pedido ao Google
    const geocode = net.calls.find((c) => c.url.includes('/v1/geocode/search'));
    expect(geocode?.url).toContain('type=city');
    expect(geocode?.url).toContain('bias=proximity%3A-50.33%2C-26.37');
    expect(geocode?.headers['x-api-key']).toBe(GEO_KEY);
    expect(geocode?.url).not.toContain(GEO_KEY);
    const google = net.calls.find((c) => c.url.startsWith(GOOGLE_PLACES_URL));
    expect(google?.body).toMatchObject({
      textQuery: 'café em Canoinhas',
      includedType: 'cafe',
      locationBias: {
        circle: { center: { latitude: CANOINHAS.lat, longitude: CANOINHAS.lng }, radius: 25_000 },
      },
      rankPreference: 'RELEVANCE',
    });
    expect(s.searches[0]).toMatchObject({
      o_que: 'café',
      relacao: 'na_cidade',
      cidade: 'Canoinhas',
      refs: ['p1', 'p2'],
      neighbors: false,
    });
  });

  it('nada dentro da cidade: os vizinhos valem, ditos, e as referências ficam marcadas como vizinhas', async () => {
    const net = network(() => [CAFES[2]], {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const s = state(net);
    const result = await s.run(TOOL_NAMES.search, search());
    expect(result.content).toContain('Nenhum "café" dentro de Canoinhas; nos vizinhos há 1');
    expect(s.isNeighbor('p1')).toBe(true);
    expect(s.searches[0]?.neighbors).toBe(true);
  });

  it('nenhum lugar: a resposta diz e pede para não repetir; a busca fica registrada sem referências', async () => {
    const net = network(() => [], {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const s = state(net);
    const result = await s.run(
      TOOL_NAMES.search,
      search({ o_que: 'cortar o cabelo', tipo_google: 'hair_salon' }),
    );
    expect(result.is_error).toBe(false);
    expect(result.content).toMatch(/^Nenhum lugar para "cortar o cabelo" em Canoinhas/);
    expect(s.searches[0]?.refs).toEqual([]);
  });

  it('a cidade dita que não existe perto (só uma Mafra a 8.000 km) é um erro para a IA perguntar, nunca outra cidade em silêncio', async () => {
    const net = network(() => CAFES, { geocode: [geocodeHit('Mafra', 38.93, -9.33, 'pt')] });
    const s = state(net);
    const result = await s.run(TOOL_NAMES.search, search({}, { cidade: 'Mafra' }));
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Não achei a cidade "Mafra" perto de onde a pessoa sai');
    expect(net.calls.some((c) => c.url.startsWith(GOOGLE_PLACES_URL))).toBe(false);
    // a mesma cidade de novo não geocodifica de novo
    await s.run(TOOL_NAMES.search, search({}, { cidade: 'mafra' }));
    expect(net.calls.filter((c) => c.url.includes('/v1/geocode/search'))).toHaveLength(1);
  });

  it('"perto": o círculo no ponto, 15 km sem raio dito, 50 km no máximo, pela distância', async () => {
    const net = network(() => CAFES);
    const s = state(net);
    await s.run(
      TOOL_NAMES.search,
      search({}, { tipo: 'perto', cidade: '', lat: MAJOR_VIEIRA.lat, lng: MAJOR_VIEIRA.lng }),
    );
    await s.run(
      TOOL_NAMES.search,
      search(
        {},
        { tipo: 'perto', cidade: '', lat: MAJOR_VIEIRA.lat, lng: MAJOR_VIEIRA.lng, raio_km: 80 },
      ),
    );
    const [a, b] = net.calls.filter((c) => c.url.startsWith(GOOGLE_PLACES_URL));
    expect(a?.body).toMatchObject({
      textQuery: 'café',
      rankPreference: 'DISTANCE',
      locationBias: { circle: { center: { latitude: -26.37, longitude: -50.33 }, radius: 15_000 } },
    });
    expect(b?.body).toMatchObject({ locationBias: { circle: { radius: 50_000 } } });
    expect(s.searches[0]?.relacao).toBe('perto_de_casa');
    // sem o ponto, um erro que diz o que falta
    const bad = await s.run(TOOL_NAMES.search, search({}, { tipo: 'perto', cidade: '' }));
    expect(bad.is_error).toBe(true);
    expect(bad.content).toContain('dê lat e lng');
  });

  it('"no caminho": círculos ao longo da linha (até quatro), juntos sem repetir o mesmo lugar', async () => {
    const net = network(() => [CAFES[0]]);
    const s = state(net);
    const result = await s.run(
      TOOL_NAMES.search,
      search(
        {},
        { tipo: 'no_caminho', cidade: '', lat: -26.37, lng: -50.33, lat2: -26.3, lng2: -48.85 },
      ),
    );
    expect(result.is_error).toBe(false);
    const googleCalls = net.calls.filter((c) => c.url.startsWith(GOOGLE_PLACES_URL));
    expect(googleCalls).toHaveLength(4);
    expect(s.requests).toBe(4);
    expect(s.found).toHaveLength(1);
    expect(s.searches[0]?.relacao).toBe('no_caminho');
    expect(routeCircles({ lat: -26.37, lng: -50.33 }, { lat: -26.3, lng: -48.85 })).toHaveLength(4);
    expect(routeCircles({ lat: -26.37, lng: -50.33 }, { lat: -26.3, lng: -50.1 })).toHaveLength(1);
  });

  it('os tetos: a nona chamada e a busca que passaria de 12 voltam como erro, para a IA entregar', async () => {
    const net = network(() => CAFES);
    const s = state(net);
    const perto = search({}, { tipo: 'perto', cidade: '', lat: -26.37, lng: -50.33 });
    for (let i = 0; i < PLAN_SEARCH_MAX_TOOL_CALLS; i++) {
      expect(
        (
          await s.run(TOOL_NAMES.drive, {
            de_lat: -26,
            de_lng: -50,
            para_lat: -26.1,
            para_lng: -50.1,
          })
        ).is_error,
      ).toBe(false);
    }
    const over = await s.run(TOOL_NAMES.search, perto);
    expect(over.is_error).toBe(true);
    expect(over.content).toContain(`Teto de ${String(PLAN_SEARCH_MAX_TOOL_CALLS)} chamadas`);

    const s2 = state(network(() => CAFES));
    for (let i = 0; i < 3; i++) {
      await s2.run(
        TOOL_NAMES.search,
        search(
          {},
          { tipo: 'no_caminho', cidade: '', lat: -26.37, lng: -50.33, lat2: -26.3, lng2: -48.85 },
        ),
      );
    }
    expect(s2.requests).toBe(PLAN_SEARCH_MAX_SEARCHES);
    const more = await s2.run(TOOL_NAMES.search, perto);
    expect(more.is_error).toBe(true);
    expect(more.content).toContain(`Teto de ${String(PLAN_SEARCH_MAX_SEARCHES)} buscas`);
  });

  it('a entrada fora do formato é um erro que diz o campo', async () => {
    const s = state(network(() => CAFES));
    const result = await s.run(TOOL_NAMES.search, { o_que: 'café' });
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Entrada fora do formato em onde');
    expect((await s.run('outra_coisa', {})).is_error).toBe(true);
  });

  it('o tipo do Google só vai se existir na Tabela A; "o melhor" é a nota mínima; a saída de hoje é aberto agora', async () => {
    const net = network(() => CAFES);
    const s = state(net);
    await s.run(
      TOOL_NAMES.search,
      search(
        { tipo_google: 'waterfall', nota_minima: 4, aberto_agora: true },
        { tipo: 'perto', cidade: '', lat: -26.37, lng: -50.33 },
      ),
    );
    const body = net.calls.find((c) => c.url.startsWith(GOOGLE_PLACES_URL))?.body;
    expect(body).not.toHaveProperty('includedType');
    expect(body).toMatchObject({ minRating: 4, openNow: true });
  });
});

describe('a fonte de reserva', () => {
  it('sem a chave do Google, a Geoapify pelas palavras (as categorias largas e a primeira palavra que distingue), e a resposta diz a fonte', async () => {
    const feature = {
      type: 'Feature',
      properties: {
        place_id: 'geo-1',
        name: 'Café Central',
        lat: -26.177,
        lon: -50.391,
        categories: ['catering.cafe'],
        city: 'Canoinhas',
        formatted: 'Café Central, Canoinhas',
        datasource: { raw: { osm_id: 1, osm_type: 'n' } },
      },
    };
    const net = network(() => CAFES, {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
      geoapifyPlaces: [feature],
    });
    const s = state(net, { googleKey: undefined });
    const result = await s.run(TOOL_NAMES.search, search());
    expect(result.is_error).toBe(false);
    expect(result.content).toContain('fonte de reserva');
    expect(result.content).toContain('p1 · Café Central · Canoinhas');
    expect(s.provider).toBe('geoapify');
    expect(s.noSource).toBe(true);
    const places = net.calls.find((c) => c.url.includes('/v2/places'));
    const params = new URL(places?.url ?? 'https://x').searchParams;
    expect(params.get('categories')).toContain('catering');
    expect(params.get('name')).toBe('cafe');
    expect(params.get('filter')).toBe(
      `circle:${String(CANOINHAS.lng)},${String(CANOINHAS.lat)},25000`,
    );
    expect(places?.headers['x-api-key']).toBe(GEO_KEY);
    expect(net.calls.some((c) => c.url.startsWith(GOOGLE_PLACES_URL))).toBe(false);
  });

  it('a chave do Google recusada (403) também cai na reserva, uma vez só', async () => {
    const net = network(() => ({ status: 403 }), {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
      geoapifyPlaces: [],
    });
    const s = state(net);
    const first = await s.run(TOOL_NAMES.search, search());
    expect(first.is_error).toBe(false);
    expect(first.content).toContain('Nenhum lugar');
    expect(s.noSource).toBe(true);
    await s.run(TOOL_NAMES.search, search({ o_que: 'padaria' }));
    expect(net.calls.filter((c) => c.url.startsWith(GOOGLE_PLACES_URL))).toHaveLength(1);
  });

  it('o Google que falha de outro jeito (500) vira um erro da ferramenta só com a classe, nunca a mensagem', async () => {
    const net = network(() => ({ status: 500 }), {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const result = await state(net).run(TOOL_NAMES.search, search());
    expect(result).toEqual({ is_error: true, content: 'A ferramenta falhou: provider_failed.' });
  });
});

describe('localizar_nome e tempo_de_carro', () => {
  it('o nome com a cidade, até 5 candidatos perto do ponto, com as coordenadas para o caminho', async () => {
    const net = network(() => [
      gplace('g-parque', 'Parque das Araucárias', 'Jaraguá do Sul', -26.48, -49.07, {
        types: ['park'],
      }),
    ]);
    const s = state(net);
    const result = await s.run(TOOL_NAMES.locate, {
      nome: 'Parque das Araucárias',
      cidade: 'Jaraguá do Sul',
      lat: 0,
      lng: 0,
    });
    expect(result.is_error).toBe(false);
    expect(result.content).toContain('1 candidatos para "Parque das Araucárias"');
    expect(result.content).toContain('p1 · Parque das Araucárias · Jaraguá do Sul');
    expect(result.content).toContain('lat -26.480, lng -49.070');
    const body = net.calls[0]?.body;
    // sem ponto dito, o viés é o ponto de referência de onde a pessoa sai
    expect(body).toMatchObject({
      textQuery: 'Parque das Araucárias, Jaraguá do Sul',
      pageSize: 5,
      locationBias: { circle: { center: { latitude: -26.37, longitude: -50.33 } } },
    });
    const none = await state(network(() => [])).run(TOOL_NAMES.locate, {
      nome: 'a casa da minha mãe',
      cidade: '',
      lat: 0,
      lng: 0,
    });
    expect(none.is_error).toBe(false);
    expect(none.content).toContain('Não achei "a casa da minha mãe"');
  });

  it('o tempo de carro é o medido pelo Google (D310), dito como medido; sem a fonte, a IA ouve que não deu e que não estime', async () => {
    const trip = { de_lat: -26.37, de_lng: -50.33, para_lat: -26.18, para_lng: -50.39 };
    const net = network(() => []);
    const s = state(net);
    const result = await s.run(TOOL_NAMES.drive, trip);
    expect(result).toEqual({
      is_error: false,
      content: '25 min de carro (26 km de estrada, medido pelo Google, sem o trânsito da hora)',
    });
    expect(s.routes).toBe(1);
    const call = net.calls.find((c) => c.url.startsWith(GOOGLE_ROUTE_MATRIX_URL));
    expect(call?.headers['X-Goog-Api-Key']).toBe(GOOGLE_KEY);
    expect(call?.body).toMatchObject({ travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' });
    expect(
      (await s.run(TOOL_NAMES.drive, { de_lat: 0, de_lng: 0, para_lat: -26, para_lng: -50 }))
        .is_error,
    ).toBe(true);
    // sem estrada entre os dois: dito
    const noRoad = state(
      network(() => [], { routes: [{ status: {}, condition: 'ROUTE_NOT_FOUND' }] }),
    );
    expect((await noRoad.run(TOOL_NAMES.drive, trip)).content).toBe(
      'O Google não achou estrada entre esses dois pontos.',
    );
    // a chave recusada pela Routes API: não deu para medir, e a ferramenta não chuta; a próxima nem
    // tenta de novo
    const deniedNet = network(() => [], { routes: { status: 403 } });
    const denied = state(deniedNet);
    const first = await denied.run(TOOL_NAMES.drive, trip);
    expect(first.is_error).toBe(true);
    expect(first.content).toContain('Não deu para medir o tempo de carro agora. Não estime');
    await denied.run(TOOL_NAMES.drive, trip);
    expect(deniedNet.calls.filter((c) => c.url.startsWith(GOOGLE_ROUTE_MATRIX_URL))).toHaveLength(
      1,
    );
    // sem a chave do Google: nenhuma chamada, a mesma resposta
    const keyless = network(() => []);
    expect(
      (await state(keyless, { googleKey: undefined }).run(TOOL_NAMES.drive, trip)).is_error,
    ).toBe(true);
    expect(keyless.calls).toHaveLength(0);
  });
});

describe('a cidade que vale e o passeio de reserva', () => {
  it('com referência, a mais perto a até 400 km; sem referência, a primeira do Brasil; nenhuma plausível, nulo', () => {
    const hits = [
      { name: 'Mafra', lat: 38.93, lng: -9.33, label: 'Mafra, Portugal', br: false },
      { name: 'Mafra', lat: -26.11, lng: -49.8, label: 'Mafra, SC', br: true },
    ];
    expect(pickCity(hits, MAJOR_VIEIRA)?.label).toBe('Mafra, SC');
    expect(pickCity(hits, null)?.label).toBe('Mafra, SC');
    expect(pickCity([hits[0]!], MAJOR_VIEIRA)).toBeNull();
    expect(pickCity([hits[0]!], null)?.label).toBe('Mafra, Portugal');
    expect(pickCity([], null)).toBeNull();
  });

  it('o nome dito e o Brasil antes do mais perto (fase 26): "Gramado" de Santa Rosa não vira o lugar de outro nome mais perto, nem a homônima de fora', () => {
    const SANTA_ROSA = { lat: -27.87, lng: -54.48 };
    const hits = [
      // o resultado mais perto, com outro nome (o que a rodada da bateria escolheu)
      { name: 'Municipio de San Pedro', lat: -26.63, lng: -54.11, label: 'Misiones', br: false },
      { name: 'Gramado', lat: -29.37, lng: -50.87, label: 'Gramado, RS, Brasil', br: true },
    ];
    expect(pickCity(hits, SANTA_ROSA, 'Gramado')?.label).toBe('Gramado, RS, Brasil');
    // a homônima de fora mais perto e a do Brasil mais longe, as duas com o nome: a do Brasil
    const homonimas = [
      { name: 'Gramado', lat: -26.63, lng: -54.11, label: 'fora', br: false },
      { name: 'Gramado', lat: -29.37, lng: -50.87, label: 'Gramado, RS', br: true },
    ];
    expect(pickCity(homonimas, SANTA_ROSA, 'gramado')?.label).toBe('Gramado, RS');
    // o estado dito junto e o nome mais longo ainda casam; um erro de digitação ainda acha (o mais perto)
    expect(pickCity(homonimas, SANTA_ROSA, 'Gramado RS')?.label).toBe('Gramado, RS');
    expect(
      pickCity(
        [{ name: 'São Bento do Sul', lat: -26.25, lng: -49.38, label: 'SBS', br: true }],
        MAJOR_VIEIRA,
        'sao bento',
      )?.label,
    ).toBe('SBS');
    expect(
      pickCity(
        [{ name: 'Canoinhas', lat: -26.18, lng: -50.39, label: 'Canoinhas', br: true }],
        MAJOR_VIEIRA,
        'Canoinas',
      )?.label,
    ).toBe('Canoinhas');
    // sem referência, o nome dito primeiro
    expect(pickCity(hits, null, 'Gramado')?.label).toBe('Gramado, RS, Brasil');
  });

  it('sem entrega da IA, cada busca feita vira um passo com os candidatos dela; sem busca, uma pergunta', async () => {
    const net = network((q) => (q.startsWith('café') ? CAFES : []), {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const s = state(net);
    await s.run(TOOL_NAMES.search, search());
    await s.run(TOOL_NAMES.search, search({ o_que: 'cortar o cabelo', tipo_google: '' }));
    const outing = outingFromSearches(s, 'max_turns');
    expect(outing.passos).toEqual([
      {
        ordem: 1,
        o_que: 'café',
        relacao: 'na_cidade',
        cidade: 'Canoinhas',
        hora_do_dia: '',
        buscado: true,
        busca: { palavras: 'café', tipo_google: '', aberto_agora: false, nota_minima: 0 },
        candidatos: ['p1', 'p2'],
        achou: true,
        fora_da_cidade: false,
      },
      {
        ordem: 2,
        o_que: 'cortar o cabelo',
        relacao: 'na_cidade',
        cidade: 'Canoinhas',
        hora_do_dia: '',
        buscado: true,
        busca: {
          palavras: 'cortar o cabelo',
          tipo_google: '',
          aberto_agora: false,
          nota_minima: 0,
        },
        candidatos: [],
        achou: false,
        fora_da_cidade: false,
      },
    ]);
    expect(outing.perguntas).toEqual([]);
    const empty = outingFromSearches(state(network(() => [])), 'no_plan');
    expect(empty.passos).toEqual([]);
    expect(empty.perguntas[0]?.text).toContain('Não consegui montar o passeio');
  });
});

describe('o que a entrega precisa e a IA não sabe (fase 26)', () => {
  it('a cidade de um passo, resolvida pela mesma regra e pelo cache da rodada; o destino pelo que localizar_nome achou com cara de cidade, senão pela geocodificação', async () => {
    const net = network(
      (q) =>
        q === 'Joinville'
          ? [
              gplace('g-jlle', 'Joinville', 'Joinville', -26.3, -48.85, {
                types: ['locality', 'political'],
              }),
            ]
          : CAFES,
      { geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)] },
    );
    const s = state(net);
    await s.run(TOOL_NAMES.search, search());
    const geocodes = () => net.calls.filter((c) => c.url.includes('/v1/geocode/search')).length;
    expect(geocodes()).toBe(1);
    // a cidade do passo: do cache (nenhuma geocodificação a mais); vazia, nada
    expect(await s.cityHit('canoinhas')).toMatchObject({ name: 'Canoinhas', lat: CANOINHAS.lat });
    expect(geocodes()).toBe(1);
    expect(await s.cityHit('')).toBeNull();
    // o destino: o que localizar_nome achou com cara de cidade, sem geocodificar
    await s.run(TOOL_NAMES.locate, { nome: 'Joinville', cidade: '', lat: 0, lng: 0 });
    expect(await s.destination('Joinville')).toEqual({ lat: -26.3, lng: -48.85 });
    expect(geocodes()).toBe(1);
    // um destino que ninguém localizou vai à geocodificação (a resposta de mentira é Canoinhas)
    expect(await s.destination('Mafra')).toEqual({ lat: CANOINHAS.lat, lng: CANOINHAS.lng });
    expect(geocodes()).toBe(2);
    expect(await s.destination('')).toBeNull();
  });

  it('a IA procurou o passo? pelas palavras da busca ou do passo', async () => {
    const net = network(() => CAFES, {
      geocode: [geocodeHit('Canoinhas', CANOINHAS.lat, CANOINHAS.lng)],
    });
    const s = state(net);
    await s.run(TOOL_NAMES.search, search({ o_que: 'Café' }));
    expect(s.searchedFor({ o_que: 'café' })).toBe(true);
    expect(s.searchedFor({ o_que: 'tomar um café', busca: { palavras: 'café' } })).toBe(true);
    expect(s.searchedFor({ o_que: 'cortar o cabelo' })).toBe(false);
  });

  it('o resumo que a IA vê traz o tipo principal do Google, para ela julgar se uma banca é um café', async () => {
    const net = network(() => [
      gplace('g-banca', 'Banca da Colônia', 'Canoinhas', -26.177, -50.391, {
        primaryType: 'grocery_store',
        types: ['grocery_store', 'food', 'store'],
      }),
    ]);
    const s = state(net);
    const result = await s.run(
      TOOL_NAMES.search,
      search({}, { tipo: 'perto', cidade: '', lat: -26.37, lng: -50.33 }),
    );
    expect(result.content).toContain(
      'p1 · Banca da Colônia · Canoinhas · tipo grocery_store · nota',
    );
  });
});
