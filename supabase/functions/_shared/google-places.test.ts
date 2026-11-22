import { describe, expect, it } from 'vitest';
import {
  cityOf,
  GOOGLE_FIELD_MASK,
  GOOGLE_PLACES_URL,
  googleBody,
  googlePlaceOf,
  googleRequest,
  hoursOnDay,
  inCity,
  openStatusAt,
  periodsOf,
  ProviderError,
  searchGoogle,
  withinCity,
} from './google-places.ts';
import { isGoogleType, kindOfGoogleTypes } from './google-types.ts';
import { googlePlacesRequestSchema, type GooglePlacesRequest } from './places-schema.ts';

/**
 * A fonte do Google (fase 27) com entrada fixa: um `fetch` de mentira que devolve respostas na forma
 * da referência da Places API (New), inventadas (nenhum nome real de estabelecimento), sem rede e sem
 * gastar nada. A chave nunca vai à URL nem ao log; o field mask é o registrado; os status viram os
 * códigos do contrato.
 */
const KEY = 'AIzaChaveDeTeste0123456789abcdefghijk';
const CANOINHAS = { lat: -26.18, lng: -50.39 };

const request = (over: Partial<GooglePlacesRequest> = {}) =>
  googlePlacesRequestSchema.parse({
    provider: 'google',
    query: 'café em Canoinhas',
    bias: { lat: CANOINHAS.lat, lng: CANOINHAS.lng, radius_m: 15_000 },
    ...over,
  });

/** Um lugar inventado na forma da referência (`displayName.text`, `addressComponents`, `periods`). */
const place = (over: Record<string, unknown> = {}) => ({
  id: 'ChIJ-cafe-da-praca',
  displayName: { text: 'Café da Praça', languageCode: 'pt-BR' },
  formattedAddress: 'R. Vidal Ramos, 100 - Centro, Canoinhas - SC, 89460-000, Brasil',
  addressComponents: [
    { longText: '100', shortText: '100', types: ['street_number'], languageCode: 'pt-BR' },
    { longText: 'Rua Vidal Ramos', shortText: 'R. Vidal Ramos', types: ['route'] },
    { longText: 'Centro', shortText: 'Centro', types: ['sublocality_level_1', 'sublocality'] },
    { longText: 'Canoinhas', shortText: 'Canoinhas', types: ['administrative_area_level_2'] },
    { longText: 'Santa Catarina', shortText: 'SC', types: ['administrative_area_level_1'] },
    { longText: 'Brasil', shortText: 'BR', types: ['country'] },
  ],
  location: { latitude: -26.1771, longitude: -50.3902 },
  types: ['cafe', 'coffee_shop', 'food', 'point_of_interest', 'establishment'],
  primaryType: 'cafe',
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/?cid=1',
  rating: 4.6,
  userRatingCount: 212,
  regularOpeningHours: {
    openNow: true,
    periods: [
      { open: { day: 1, hour: 8, minute: 0 }, close: { day: 1, hour: 19, minute: 0 } },
      { open: { day: 2, hour: 8, minute: 0 }, close: { day: 2, hour: 19, minute: 0 } },
      { open: { day: 6, hour: 8, minute: 30 }, close: { day: 6, hour: 13, minute: 0 } },
    ],
    weekdayDescriptions: ['segunda-feira: 08:00 – 19:00', 'terça-feira: 08:00 – 19:00'],
  },
  currentOpeningHours: { openNow: false },
  websiteUri: 'https://exemplo.invalid/cafe',
  ...over,
});
const json = (body: unknown, status = 200) => Response.json(body, { status });

function fakeFetch(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch: typeof globalThis.fetch = (input, init) => {
    calls.push({ url: input instanceof Request ? input.url : input.toString(), init });
    const next = responses.shift() ?? new Response('{}', { status: 500 });
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  };
  return { fetch, calls };
}

describe('o pedido ao Google', () => {
  it('POST na Text Search, a chave e o field mask nos cabeçalhos, nunca na URL; o corpo só com o que a documentação prevê', () => {
    const { url, init } = googleRequest(request(), KEY);
    expect(url).toBe(GOOGLE_PLACES_URL);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe(KEY);
    expect(headers['X-Goog-FieldMask']).toBe(GOOGLE_FIELD_MASK.join(','));
    // a máscara registrada: os Essentials, os Pro e os Enterprise que os cartões mostram
    expect(GOOGLE_FIELD_MASK).toContain('places.rating');
    expect(GOOGLE_FIELD_MASK).toContain('places.regularOpeningHours');
    expect(GOOGLE_FIELD_MASK).toContain('places.addressComponents');
    expect(GOOGLE_FIELD_MASK).not.toContain('*');
    expect(JSON.parse(init.body as string)).toEqual({
      textQuery: 'café em Canoinhas',
      languageCode: 'pt-BR',
      regionCode: 'BR',
      pageSize: 20,
      rankPreference: 'RELEVANCE',
      locationBias: { circle: { center: { latitude: -26.18, longitude: -50.39 }, radius: 15_000 } },
    });
  });

  it('o tipo só vai se existir na Tabela A; "aberto agora" e a nota mínima só quando pedidos; a nota arredonda para cima a 0,5', () => {
    expect(
      googleBody(request({ type: 'hair_salon', open_now: true, min_rating: 4.2 })),
    ).toMatchObject({ includedType: 'hair_salon', openNow: true, minRating: 4.5 });
    expect(googleBody(request({ type: 'waterfall' }))).not.toHaveProperty('includedType');
    expect(googleBody(request({ bias: null, rank: 'distance' }))).toMatchObject({
      rankPreference: 'DISTANCE',
    });
    expect(googleBody(request({ bias: null }))).not.toHaveProperty('locationBias');
    expect(googleBody(request())).not.toHaveProperty('openNow');
    expect(googleBody(request())).not.toHaveProperty('minRating');
  });

  it('o pedido fora dos limites é recusado: o círculo passa de 50 km, o tipo com maiúscula, a nota acima de 5', () => {
    const bad = [
      { bias: { lat: -26, lng: -50, radius_m: 60_000 } },
      { type: 'Cafe' },
      { min_rating: 6 },
      { query: 'a' },
      { limit: 21 },
    ];
    for (const b of bad)
      expect(
        googlePlacesRequestSchema.safeParse({ provider: 'google', query: 'café', ...b }).success,
        JSON.stringify(b),
      ).toBe(false);
  });

  it('a Tabela A: cafe, hair_salon e farmers_market existem; waterfall não; natural_feature é da Tabela B', () => {
    expect(isGoogleType('cafe')).toBe(true);
    expect(isGoogleType('hair_salon')).toBe(true);
    expect(isGoogleType('farmers_market')).toBe(true);
    expect(isGoogleType('tourist_attraction')).toBe(true);
    expect(isGoogleType('waterfall')).toBe(false);
    expect(isGoogleType('natural_feature')).toBe(false);
  });
});

describe('a resposta do Google como lugar do app', () => {
  it('o nome, a cidade pelo município, a nota com as avaliações, o aberto agora, o horário em texto e os períodos', () => {
    const p = googlePlaceOf(place());
    expect(p).toMatchObject({
      id: 'ChIJ-cafe-da-praca',
      name: 'Café da Praça',
      lat: -26.1771,
      lng: -50.3902,
      categories: ['cafe', 'coffee_shop', 'food', 'point_of_interest', 'establishment'],
      city: 'Canoinhas',
      address: 'R. Vidal Ramos, 100 - Centro, Canoinhas - SC, 89460-000, Brasil',
      opening_hours: 'segunda-feira: 08:00 – 19:00 · terça-feira: 08:00 – 19:00',
      website: 'https://exemplo.invalid/cafe',
      cuisine: null,
      osm: null,
      distance_m: null,
      provider: 'google',
      google_place_id: 'ChIJ-cafe-da-praca',
      rating: 4.6,
      user_rating_count: 212,
      // o "aberto agora" é o de agora (currentOpeningHours), não o do horário fixo
      open_now: false,
      business_status: 'operational',
      maps_url: 'https://maps.google.com/?cid=1',
      hours: [
        { day: 1, open: '08:00', close: '19:00' },
        { day: 2, open: '08:00', close: '19:00' },
        { day: 6, open: '08:30', close: '13:00' },
      ],
    });
  });

  it('sem nota, sem horário e sem status, nada se inventa: nulos; o fechado de vez e o por abrir vêm ditos', () => {
    const bare = googlePlaceOf(
      place({
        rating: undefined,
        userRatingCount: undefined,
        regularOpeningHours: undefined,
        currentOpeningHours: undefined,
        businessStatus: undefined,
        websiteUri: undefined,
        googleMapsUri: undefined,
      }),
    );
    expect(bare).toMatchObject({
      rating: null,
      user_rating_count: null,
      open_now: null,
      opening_hours: null,
      hours: null,
      business_status: null,
      website: null,
      maps_url: null,
    });
    expect(googlePlaceOf(place({ businessStatus: 'CLOSED_PERMANENTLY' }))?.business_status).toBe(
      'closed_permanently',
    );
    expect(googlePlaceOf(place({ businessStatus: 'FUTURE_OPENING' }))?.business_status).toBe(
      'future_opening',
    );
    expect(googlePlaceOf(place({ businessStatus: 'OUTRA_COISA' }))?.business_status).toBeNull();
    // sem nome ou sem coordenada, não é um lugar que se escolhe
    expect(googlePlaceOf(place({ displayName: undefined }))).toBeNull();
    expect(googlePlaceOf({ id: 'x', displayName: { text: 'Sem lugar' } })).toBeNull();
  });

  it('a cidade: o município antes da localidade; sem os dois, o bairro; sem nada, nulo', () => {
    expect(
      cityOf([
        { longText: 'Marcílio Dias', types: ['locality'] },
        { longText: 'Canoinhas', types: ['administrative_area_level_2'] },
      ]),
    ).toBe('Canoinhas');
    expect(cityOf([{ longText: 'Três Barras', types: ['locality', 'political'] }])).toBe(
      'Três Barras',
    );
    expect(cityOf([{ longText: 'Centro', types: ['sublocality'] }])).toBe('Centro');
    expect(cityOf([{ longText: 'Brasil', types: ['country'] }])).toBeNull();
    expect(cityOf(undefined)).toBeNull();
  });

  it('o lugar 24 h vem sem fechar; os períodos saem na forma do app', () => {
    expect(periodsOf({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] })).toEqual([
      { day: 0, open: '00:00', close: null },
    ]);
    expect(periodsOf({ periods: [] })).toBeNull();
    expect(periodsOf(undefined)).toBeNull();
  });
});

describe('"dentro da cidade" (a decisão 8 de 21/11)', () => {
  const inside = googlePlaceOf(place())!;
  const neighbor = googlePlaceOf(
    place({
      id: 'ChIJ-tres-barras',
      displayName: { text: 'Café do Rio' },
      addressComponents: [
        { longText: 'Três Barras', types: ['administrative_area_level_2'] },
        { longText: 'Santa Catarina', shortText: 'SC', types: ['administrative_area_level_1'] },
      ],
    }),
  )!;
  it('a cidade do endereço decide, sem acento, sem caixa e sem o estado', () => {
    expect(inCity(inside, 'canoinhas')).toBe(true);
    expect(inCity(inside, 'Canoinhas - SC')).toBe(true);
    expect(inCity(inside, 'Canoinhas, SC')).toBe(true);
    expect(inCity(neighbor, 'Canoinhas')).toBe(false);
    expect(inCity({ city: null }, 'Canoinhas')).toBe(false);
    expect(inCity({ city: 'Três Barras' }, 'tres barras')).toBe(true);
  });

  it('o que é da cidade fica; só sem nada dentro é que os vizinhos valem, ditos', () => {
    expect(withinCity([inside, neighbor], 'Canoinhas')).toEqual({
      places: [inside],
      neighbors: false,
    });
    expect(withinCity([neighbor], 'Canoinhas')).toEqual({ places: [neighbor], neighbors: true });
    expect(withinCity([inside, neighbor], null)).toEqual({
      places: [inside, neighbor],
      neighbors: false,
    });
    expect(withinCity([], 'Canoinhas')).toEqual({ places: [], neighbors: true });
  });
});

describe('o horário na conta do passeio', () => {
  const hours = [
    { day: 1, open: '08:00', close: '19:00' },
    { day: 6, open: '18:00', close: '02:00' },
  ];
  it('aberto dentro do período, fechado fora dele, desconhecido sem períodos; a noite vira o dia seguinte; 24 h é sempre', () => {
    expect(openStatusAt(hours, 1, '10:00')).toBe('open');
    expect(openStatusAt(hours, 1, '19:00')).toBe('closed');
    expect(openStatusAt(hours, 3, '10:00')).toBe('closed');
    expect(openStatusAt(hours, 6, '23:30')).toBe('open');
    expect(openStatusAt(hours, 0, '01:00')).toBe('open');
    expect(openStatusAt(hours, 0, '03:00')).toBe('closed');
    expect(openStatusAt([{ day: 0, open: '00:00', close: null }], 4, '15:00')).toBe('open');
    expect(openStatusAt(null, 1, '10:00')).toBe('unknown');
    expect(openStatusAt([], 1, '10:00')).toBe('unknown');
  });

  it('os períodos de um dia, em texto', () => {
    expect(hoursOnDay(hours, 1)).toBe('08:00–19:00');
    expect(hoursOnDay(hours, 2)).toBeNull();
    expect(hoursOnDay([{ day: 2, open: '00:00', close: null }], 2)).toBe('24 h');
  });
});

describe('o tipo do app pelos tipos do Google', () => {
  it('café é comida, cabeleireiro é outro, parque é natureza, mercado é evento, hotel é hotel', () => {
    expect(kindOfGoogleTypes(['cafe', 'food'])).toBe('food');
    expect(kindOfGoogleTypes(['brazilian_restaurant', 'restaurant'])).toBe('food');
    expect(kindOfGoogleTypes(['hair_salon', 'point_of_interest'])).toBe('other');
    expect(kindOfGoogleTypes(['park', 'tourist_attraction'])).toBe('nature');
    expect(kindOfGoogleTypes(['farmers_market', 'market'])).toBe('event');
    expect(kindOfGoogleTypes(['hotel', 'lodging'])).toBe('hotel');
    expect(kindOfGoogleTypes(['winery'])).toBe('winery');
    expect(kindOfGoogleTypes(['gas_station'])).toBe('fuel');
    expect(kindOfGoogleTypes(['museum'])).toBe('city');
    expect(kindOfGoogleTypes([])).toBe('other');
  });
});

describe('a busca no Google: os status e a chave', () => {
  it('a resposta boa vira lugares; a chave não aparece na chamada além do cabeçalho', async () => {
    const { fetch, calls } = fakeFetch([json({ places: [place(), { id: 'sem-nome' }] })]);
    const places = await searchGoogle({ fetch }, KEY, request());
    expect(places.map((p) => p.name)).toEqual(['Café da Praça']);
    expect(calls[0]?.url).not.toContain(KEY);
    expect(calls[0]?.init?.body as string).not.toContain(KEY);
  });

  it('403 e 401 são a chave que não vale (no_source); 429 é a cota do Google; o 400 diz o status do envelope, nunca a mensagem', async () => {
    const cases: [Response | Error, string, string][] = [
      [
        json(
          { error: { code: 403, message: 'PERMISSION_DENIED', status: 'PERMISSION_DENIED' } },
          403,
        ),
        'no_source',
        'key',
      ],
      [json({ error: { code: 401 } }, 401), 'no_source', 'key'],
      [
        json({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }, 429),
        'provider_quota',
        'quota',
      ],
      [
        json(
          { error: { code: 400, message: `chave ${KEY} inválida`, status: 'INVALID_ARGUMENT' } },
          400,
        ),
        'provider_failed',
        'http 400 INVALID_ARGUMENT',
      ],
      [json('não é um objeto'), 'provider_failed', 'format'],
      [
        new DOMException('The operation timed out.', 'TimeoutError'),
        'provider_failed',
        'TimeoutError',
      ],
    ];
    for (const [response, code, detail] of cases) {
      const { fetch } = fakeFetch([response]);
      const err = await searchGoogle({ fetch }, KEY, request()).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).code, code).toBe(code);
      expect((err as ProviderError).message, code).toBe(detail);
      expect((err as ProviderError).message).not.toContain(KEY);
    }
  });

  it('uma resposta vazia é uma lista vazia, não um erro', async () => {
    const { fetch } = fakeFetch([json({})]);
    expect(await searchGoogle({ fetch }, KEY, request())).toEqual([]);
  });
});
