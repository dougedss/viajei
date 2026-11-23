import { describe, expect, it } from 'vitest';
import { handleDrive, type DriveDeps } from './drive-handler.ts';
import {
  DRIVE_MAX_PAIRS,
  driveKey,
  drivePair,
  driveRequestSchema,
  driveResponseSchema,
  measuredMinutes,
  missingPairs,
  tableAmong,
  tableOf,
  type DriveRequest,
} from './drive-schema.ts';
import type { LngLat } from './geo.ts';

/**
 * A `drive-times` com entrada fixa (D310): um `fetch` de mentira no lugar do Google e uma cota de
 * mentira; e a tabela dos tempos medidos, pura (a chave do par, os minutos, o que falta medir).
 */
const KEY = 'chave-de-teste-AIza-nao-e-uma-chave';
const CASA: LngLat = [-50.33, -26.37];
const SUSHI: LngLat = [-50.3889548, -26.1825104];
const CAFE: LngLat = [-50.39, -26.18];

const request = (body: unknown, method = 'POST') =>
  new Request('http://localhost/functions/v1/drive-times', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });

function deps(over: Partial<DriveDeps> = {}) {
  const logs: string[] = [];
  const calls: { url: string; init: RequestInit }[] = [];
  let claims = 0;
  const all: DriveDeps = {
    googleKey: KEY,
    claim: () => {
      claims += 1;
      return Promise.resolve('ok');
    },
    fetch: ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      // o corpo que `matrixRequest` monta é sempre texto (o JSON do pedido)
      const body = JSON.parse(init.body as string) as {
        origins: unknown[];
        destinations: unknown[];
      };
      const out: unknown[] = [];
      body.origins.forEach((_, o) => {
        body.destinations.forEach((__, d) => {
          out.push({
            originIndex: o,
            destinationIndex: d,
            status: {},
            distanceMeters: 26_100,
            duration: '1480s',
            condition: 'ROUTE_EXISTS',
          });
        });
      });
      return Promise.resolve(Response.json(out));
    }) as unknown as typeof fetch,
    log: (line) => logs.push(line),
    now: () => Date.parse('2026-11-23T12:00:00Z'),
    ...over,
  };
  return { deps: all, logs, calls, claims: () => claims };
}

const BODY: DriveRequest = { pairs: [drivePair(CASA, SUSHI), drivePair(SUSHI, CASA)] };

describe('a drive-times', () => {
  it('devolve o tempo medido de cada par, na ordem; o log é só de números, sem ponto nem chave', async () => {
    const t = deps();
    const res = await handleDrive(request(BODY), t.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = driveResponseSchema.parse(await res.json());
    expect(body.provider).toBe('google');
    expect(body.times).toEqual([
      { duration_s: 1480, distance_m: 26_100 },
      { duration_s: 1480, distance_m: 26_100 },
    ]);
    expect(t.claims()).toBe(1);
    expect(t.logs).toHaveLength(1);
    expect(t.logs[0]).toMatch(
      /^drive-times status=ok pairs=2 requests=2 elements=2 found=2 ms=\d+$/,
    );
    expect(t.logs[0]).not.toContain(KEY);
    expect(t.logs[0]).not.toContain('-26');
  });

  it('sem a chave: "sem fonte", antes de gastar a cota e sem chamar o Google', async () => {
    const t = deps({ googleKey: undefined });
    const res = await handleDrive(request(BODY), t.deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'no_source' } });
    expect(t.claims()).toBe(0);
    expect(t.calls).toHaveLength(0);
  });

  it('a cota da pessoa acabou: 429, sem chamar o Google; a cota que não se conferiu: 500', async () => {
    const limit = deps({ claim: () => Promise.resolve('limit') });
    const res = await handleDrive(request(BODY), limit.deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: 'daily_limit' } });
    expect(limit.calls).toHaveLength(0);
    const broken = deps({ claim: () => Promise.reject(new Error('edge_call 42501')) });
    expect((await handleDrive(request(BODY), broken.deps)).status).toBe(500);
  });

  it('o pedido fora do formato é recusado: sem pares, pares demais, um ponto fora do mapa, outro método', async () => {
    const t = deps();
    expect((await handleDrive(request({ pairs: [] }), t.deps)).status).toBe(400);
    const many = Array.from({ length: DRIVE_MAX_PAIRS + 1 }, () => drivePair(CASA, SUSHI));
    expect((await handleDrive(request({ pairs: many }), t.deps)).status).toBe(400);
    const off = { pairs: [{ from: { lat: 91, lng: 0 }, to: { lat: 0, lng: 0 } }] };
    expect((await handleDrive(request(off), t.deps)).status).toBe(400);
    expect((await handleDrive(request(null, 'GET'), t.deps)).status).toBe(405);
    expect(t.claims()).toBe(0);
  });

  it('o Google recusou a chave para a Routes API: "sem fonte" (503); o app diz que não deu para medir', async () => {
    const t = deps({
      fetch: (() =>
        Promise.resolve(
          Response.json([{ error: { code: 403, status: 'PERMISSION_DENIED' } }], { status: 403 }),
        )) as unknown as typeof fetch,
    });
    const res = await handleDrive(request(BODY), t.deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: 'no_source' } });
    expect(t.logs[0]).toContain('status=no_source');
  });
});

describe('a tabela dos tempos medidos', () => {
  it('a chave do par tem quatro casas, e a ida não é a volta', () => {
    expect(driveKey(CASA, SUSHI)).toBe('-50.3300,-26.3700>-50.3890,-26.1825');
    expect(driveKey(SUSHI, CASA)).not.toBe(driveKey(CASA, SUSHI));
    // o par do pedido vai arredondado como a chave
    expect(driveRequestSchema.parse({ pairs: [drivePair(CASA, SUSHI)] }).pairs[0]).toEqual({
      from: { lat: -26.37, lng: -50.33 },
      to: { lat: -26.1825, lng: -50.389 },
    });
  });

  it('os minutos são os medidos, arredondados a 5; o mesmo ponto é zero; sem medida ou sem estrada, nulo', () => {
    const table = { [driveKey(CASA, SUSHI)]: 1480, [driveKey(SUSHI, CAFE)]: null };
    // 1480 s são 24 min 40 s: "cerca de 25 min", o que o Douglas disse da estrada até Canoinhas
    expect(measuredMinutes(table, CASA, SUSHI)).toBe(25);
    expect(measuredMinutes(table, CASA, CASA)).toBe(0);
    // a volta não foi medida: nulo, nunca o tempo da ida nem uma estimativa
    expect(measuredMinutes(table, SUSHI, CASA)).toBeNull();
    // o Google respondeu que não há estrada
    expect(measuredMinutes(table, SUSHI, CAFE)).toBeNull();
    expect(measuredMinutes(undefined, CASA, SUSHI)).toBeNull();
  });

  it('o que falta medir: sem o mesmo ponto, sem repetir, sem o que a tabela já tem (inclusive o "sem estrada")', () => {
    const table = { [driveKey(CASA, SUSHI)]: 1480, [driveKey(SUSHI, CAFE)]: null };
    const missing = missingPairs(table, [
      [CASA, SUSHI],
      [SUSHI, CASA],
      [SUSHI, CASA],
      [SUSHI, CAFE],
      [CAFE, CAFE],
    ]);
    expect(missing).toEqual([[SUSHI, CASA]]);
  });

  it('o que voltou da função entra pela chave; só os pares entre os pontos do caminho seguem para a revisão', () => {
    const added = tableOf(
      [
        [CASA, SUSHI],
        [SUSHI, CASA],
        [CASA, CAFE],
      ],
      [{ duration_s: 1480, distance_m: 26_100 }, null, { duration_s: 1500, distance_m: 26_300 }],
    );
    expect(added).toEqual({
      [driveKey(CASA, SUSHI)]: 1480,
      [driveKey(SUSHI, CASA)]: null,
      [driveKey(CASA, CAFE)]: 1500,
    });
    expect(Object.keys(tableAmong(added, [CASA, SUSHI])).sort()).toEqual(
      [driveKey(CASA, SUSHI), driveKey(SUSHI, CASA)].sort(),
    );
  });
});
