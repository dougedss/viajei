import { describe, expect, it } from 'vitest';
import type { DrivePair, DrivePoint } from './drive-schema.ts';
import { ProviderError } from './google-places.ts';
import {
  driveTimes,
  GOOGLE_ROUTE_MATRIX_URL,
  GOOGLE_ROUTES_FIELD_MASK,
  matrixBody,
  matrixRequest,
  planMatrices,
  routeMatrix,
  secondsOf,
} from './google-routes.ts';

/**
 * O tempo de carro do Google com entrada fixa (D310): um `fetch` de mentira que devolve respostas no
 * formato da documentação da Routes API lida em 22/11/2026 (um array JSON fora de ordem, a duração em
 * texto, os índices e a distância que somem quando valem zero), sem rede e sem elemento cobrado.
 */
const KEY = 'chave-de-teste-AIza-nao-e-uma-chave';
const CASA: DrivePoint = { lat: -26.37, lng: -50.33 };
const SUSHI: DrivePoint = { lat: -26.1825, lng: -50.389 };
const CAFE: DrivePoint = { lat: -26.18, lng: -50.39 };
const PRACA: DrivePoint = { lat: -26.176, lng: -50.391 };

type Call = { url: string; init: RequestInit };
const fakeFetch = (answer: (body: ReturnType<typeof matrixBody>) => Response) => {
  const calls: Call[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    // o corpo que `matrixRequest` monta é sempre texto (o JSON do pedido)
    return Promise.resolve(
      answer(JSON.parse(init.body as string) as ReturnType<typeof matrixBody>),
    );
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};
const sizes = (body: ReturnType<typeof matrixBody>) => ({
  origins: (body.origins as unknown[]).length,
  destinations: (body.destinations as unknown[]).length,
});
/** Todos os pares da matriz com 1500 s e 26 km, como o Google devolve. */
const everyPair = (body: ReturnType<typeof matrixBody>) => {
  const { origins, destinations } = sizes(body);
  const out: unknown[] = [];
  for (let o = 0; o < origins; o++) {
    for (let d = 0; d < destinations; d++) {
      out.push({
        originIndex: o,
        destinationIndex: d,
        status: {},
        distanceMeters: 26_000,
        duration: '1500s',
        condition: 'ROUTE_EXISTS',
      });
    }
  }
  return Response.json(out);
};

describe('o pedido da matriz ao Google', () => {
  it('POST no computeRouteMatrix, a chave e o field mask nos cabeçalhos, nunca na URL; de carro e sem trânsito', () => {
    const { url, init } = matrixRequest([CASA], [SUSHI, CAFE], KEY);
    expect(url).toBe(GOOGLE_ROUTE_MATRIX_URL);
    expect(url).not.toContain(KEY);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Goog-Api-Key']).toBe(KEY);
    // o status vai na máscara: sem ele, todo elemento parece ter dado certo
    expect(headers['X-Goog-FieldMask']).toBe(GOOGLE_ROUTES_FIELD_MASK);
    expect(GOOGLE_ROUTES_FIELD_MASK.split(',')).toEqual(
      expect.arrayContaining([
        'originIndex',
        'destinationIndex',
        'status',
        'condition',
        'duration',
      ]),
    );
    expect(matrixBody([CASA], [SUSHI])).toEqual({
      origins: [{ waypoint: { location: { latLng: { latitude: -26.37, longitude: -50.33 } } } }],
      destinations: [
        { waypoint: { location: { latLng: { latitude: -26.1825, longitude: -50.389 } } } },
      ],
      travelMode: 'DRIVE',
      // sem trânsito: o padrão, e o que mantém o pedido no SKU Essentials
      routingPreference: 'TRAFFIC_UNAWARE',
    });
  });

  it('a duração do Google em segundos: "160s", com fração; o que não é duração, nulo', () => {
    expect(secondsOf('160s')).toBe(160);
    expect(secondsOf('1499.6s')).toBe(1500);
    expect(secondsOf('0s')).toBe(0);
    expect(secondsOf(undefined)).toBeNull();
    expect(secondsOf('25 min')).toBeNull();
  });
});

describe('a resposta da matriz', () => {
  it('os elementos fora de ordem vão ao lugar pelos índices; o índice 0 e a distância 0 podem não vir', async () => {
    const { fetch } = fakeFetch(() =>
      Response.json([
        {
          destinationIndex: 1,
          status: {},
          distanceMeters: 300,
          duration: '60s',
          condition: 'ROUTE_EXISTS',
        },
        // origem 0 e destino 0 omitidos (o valor padrão não vem); a distância 0 também
        { status: {}, duration: '1500s', condition: 'ROUTE_EXISTS' },
      ]),
    );
    const table = await routeMatrix({ fetch }, KEY, [CASA], [SUSHI, CAFE]);
    expect(table).toEqual([
      [
        { duration_s: 1500, distance_m: 0 },
        { duration_s: 60, distance_m: 300 },
      ],
    ]);
  });

  it('o par sem estrada (ROUTE_NOT_FOUND) e o par com erro só dele ficam nulos; os outros valem', async () => {
    const { fetch } = fakeFetch(() =>
      Response.json([
        { originIndex: 0, destinationIndex: 0, status: {}, condition: 'ROUTE_NOT_FOUND' },
        { originIndex: 0, destinationIndex: 1, status: { code: 3, message: 'x' }, duration: '9s' },
        {
          originIndex: 0,
          destinationIndex: 2,
          status: {},
          duration: '300s',
          distanceMeters: 4_000,
          condition: 'ROUTE_EXISTS',
        },
      ]),
    );
    const table = await routeMatrix({ fetch }, KEY, [CASA], [SUSHI, CAFE, PRACA]);
    expect(table[0]).toEqual([null, null, { duration_s: 300, distance_m: 4_000 }]);
  });

  it('a chave que não vale para a Routes API é "sem fonte"; o 429 é a cota; o resto falhou, com o status do Google e sem a chave', async () => {
    // o envelope de erro da matriz vem dentro de um array (visto numa chamada sem chave em 22/11)
    const denied = fakeFetch(() =>
      Response.json([{ error: { code: 403, message: 'x', status: 'PERMISSION_DENIED' } }], {
        status: 403,
      }),
    );
    await expect(routeMatrix(denied, KEY, [CASA], [SUSHI])).rejects.toMatchObject({
      code: 'no_source',
      status: 503,
    });
    const quota = fakeFetch(() => Response.json({}, { status: 429 }));
    await expect(routeMatrix(quota, KEY, [CASA], [SUSHI])).rejects.toMatchObject({
      code: 'provider_quota',
    });
    const bad = fakeFetch(() =>
      Response.json(
        [{ error: { code: 400, message: `chave ${KEY}`, status: 'INVALID_ARGUMENT' } }],
        {
          status: 400,
        },
      ),
    );
    const err = await routeMatrix(bad, KEY, [CASA], [SUSHI]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe('provider_failed');
    expect((err as ProviderError).message).toBe('http 400 INVALID_ARGUMENT');
    expect((err as ProviderError).message).not.toContain(KEY);
    // a resposta que não é um array não é uma matriz
    const odd = fakeFetch(() => Response.json({ rows: [] }));
    await expect(routeMatrix(odd, KEY, [CASA], [SUSHI])).rejects.toMatchObject({
      code: 'provider_failed',
    });
  });
});

describe('dos pares às matrizes: nenhum elemento a mais (o Google cobra por elemento)', () => {
  const pair = (from: DrivePoint, to: DrivePoint): DrivePair => ({ from, to });

  it('as opções de um passo: de casa a cada candidato é uma matriz, e de cada candidato a casa é outra', () => {
    const pairs = [
      pair(CASA, SUSHI),
      pair(CASA, CAFE),
      pair(CASA, PRACA),
      pair(SUSHI, CASA),
      pair(CAFE, CASA),
      pair(PRACA, CASA),
    ];
    const plans = planMatrices(pairs);
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => [p.origins.length, p.destinations.length])).toEqual([
      [1, 3],
      [3, 1],
    ]);
    // seis pares, seis elementos: nenhuma matriz 4 × 4
    const elements = plans.reduce((n, p) => n + p.origins.length * p.destinations.length, 0);
    expect(elements).toBe(pairs.length);
    // cada par do pedido está numa célula
    expect(plans.flatMap((p) => p.cells.map((c) => c[0])).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('os trechos de um caminho (cada par com origem e destino próprios) viram uma matriz por par', () => {
    const plans = planMatrices([pair(CASA, CAFE), pair(CAFE, SUSHI), pair(SUSHI, CASA)]);
    expect(plans).toHaveLength(3);
    expect(plans.every((p) => p.origins.length * p.destinations.length === 1)).toBe(true);
  });

  it('o par repetido no pedido usa a mesma célula, sem elemento a mais', () => {
    const plans = planMatrices([pair(CASA, SUSHI), pair(CASA, SUSHI), pair(CASA, CAFE)]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.destinations).toHaveLength(2);
    expect(plans[0]?.cells).toEqual([
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 1],
    ]);
  });

  it('o tempo de cada par volta na ordem do pedido, com as matrizes e os elementos contados', async () => {
    const { fetch, calls } = fakeFetch(everyPair);
    const pairs = [pair(CASA, SUSHI), pair(SUSHI, CASA), pair(CASA, CAFE), pair(CAFE, CASA)];
    const out = await driveTimes({ fetch }, KEY, pairs);
    expect(out.times).toEqual(pairs.map(() => ({ duration_s: 1500, distance_m: 26_000 })));
    expect(out.requests).toBe(2);
    expect(out.elements).toBe(4);
    expect(calls).toHaveLength(2);
  });

  it('o erro de uma matriz é o erro do pedido: nenhum tempo pela metade', async () => {
    let n = 0;
    const { fetch } = fakeFetch((body) => {
      n += 1;
      return n === 1 ? everyPair(body) : Response.json({}, { status: 429 });
    });
    await expect(
      driveTimes({ fetch }, KEY, [pair(CASA, SUSHI), pair(CAFE, PRACA)]),
    ).rejects.toMatchObject({ code: 'provider_quota' });
  });
});
