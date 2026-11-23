import { z } from 'zod';
import type { DrivePair, DrivePoint, DriveTime } from './drive-schema.ts';
import { ProviderError } from './google-places.ts';

/**
 * O tempo de carro do Google (a correção de 22/11/2026, D310): a Routes API, `computeRouteMatrix`, sem
 * Deno e sem rede, no molde do `google-places.ts` (o `fetch` vem por injeção; o Vitest liga um de
 * mentira). A documentação lida em 22/11/2026 (`developers.google.com/maps/documentation/routes`):
 * `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`; a chave no cabeçalho
 * `X-Goog-Api-Key` (nunca na URL, no log nem na resposta); o field mask é obrigatório ("There is no
 * default list of returned fields") e leva o `status` ("otherwise all messages will appear to be OK");
 * as origens e os destinos como `waypoint.location.latLng`; `travelMode: DRIVE` e
 * `routingPreference: TRAFFIC_UNAWARE` (o padrão: "average time-independent traffic conditions", e é o
 * que mantém o pedido no SKU Essentials: US$ 5 por mil elementos, com 10.000 grátis por mês, cobrado
 * **por elemento**, origem × destino); a resposta é um array JSON fora de ordem, um elemento por par,
 * com `duration` em texto ("160s"), `distanceMeters` (que some quando é 0) e `condition`
 * (`ROUTE_EXISTS`, ou `ROUTE_NOT_FOUND` sem duração nem distância); até 625 elementos por pedido.
 */
export const GOOGLE_ROUTE_MATRIX_URL =
  'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
export const GOOGLE_ROUTES_FIELD_MASK =
  'originIndex,destinationIndex,status,condition,distanceMeters,duration';
export const GOOGLE_ROUTES_TIMEOUT_MS = 15_000;
/** O teto de elementos de uma matriz (origens × destinos), pela documentação. */
export const GOOGLE_MATRIX_MAX_ELEMENTS = 625;

export type RoutesDeps = { fetch: typeof fetch };

const waypoint = (p: DrivePoint) => ({
  waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
});

/** O corpo da matriz: só o que a documentação prevê, sem trânsito. */
export function matrixBody(
  origins: readonly DrivePoint[],
  destinations: readonly DrivePoint[],
): Record<string, unknown> {
  return {
    origins: origins.map(waypoint),
    destinations: destinations.map(waypoint),
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
  };
}

/** O pedido ao Google: POST, a chave e o field mask nos cabeçalhos, nunca na URL. */
export function matrixRequest(
  origins: readonly DrivePoint[],
  destinations: readonly DrivePoint[],
  key: string,
): { url: string; init: RequestInit } {
  return {
    url: GOOGLE_ROUTE_MATRIX_URL,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': GOOGLE_ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(matrixBody(origins, destinations)),
    },
  };
}

// ----------------------------------------------------------------------- a resposta
// os índices e a distância com valor 0 podem não vir (o JSON do Google omite o valor padrão)
const elementSchema = z
  .object({
    originIndex: z.number().int().min(0).default(0),
    destinationIndex: z.number().int().min(0).default(0),
    status: z.object({ code: z.number().optional() }).loose().optional(),
    condition: z.string().optional(),
    distanceMeters: z.number().nonnegative().default(0),
    duration: z.string().optional(),
  })
  .loose();
/** O envelope de erro: um objeto no `computeRoutes`, e dentro de um array na matriz (visto em 22/11). */
const errorSchema = z.object({ error: z.object({ status: z.string().optional() }).loose() });

/** "160s", "159.5s": os segundos de uma duração do Google; null quando não é uma duração. */
export function secondsOf(duration: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(duration?.trim() ?? '');
  return m ? Math.round(Number(m[1])) : null;
}

function errorStatusOf(json: unknown): string {
  const first: unknown = Array.isArray(json) ? json[0] : json;
  const envelope = errorSchema.safeParse(first);
  return envelope.success ? (envelope.data.error.status ?? '') : '';
}

/**
 * Uma matriz no Google: o tempo e a distância de cada origem a cada destino, `[origem][destino]`;
 * `null` no par sem estrada (`ROUTE_NOT_FOUND`) ou com erro só dele. Os status: 401 e 403 são a chave
 * que não vale para a Routes API (`no_source`: a API desligada, o faturamento, a restrição da chave);
 * 429 é a cota do Google (`provider_quota`); o resto, `provider_failed`, com o `status` do envelope de
 * erro no detalhe, nunca a mensagem inteira nem a chave.
 */
export async function routeMatrix(
  deps: RoutesDeps,
  key: string,
  origins: readonly DrivePoint[],
  destinations: readonly DrivePoint[],
): Promise<(DriveTime | null)[][]> {
  const { url, init } = matrixRequest(origins, destinations, key);
  let res: Response;
  try {
    res = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(GOOGLE_ROUTES_TIMEOUT_MS) });
  } catch (err) {
    throw new ProviderError('provider_failed', 502, err instanceof Error ? err.name : 'fetch');
  }
  if (res.status === 401 || res.status === 403) throw new ProviderError('no_source', 503, 'key');
  if (res.status === 429) throw new ProviderError('provider_quota', 503, 'quota');
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ProviderError(
      'provider_failed',
      502,
      `http ${String(res.status)} ${errorStatusOf(json)}`.trim(),
    );
  }
  if (!Array.isArray(json)) throw new ProviderError('provider_failed', 502, 'format');
  const out: (DriveTime | null)[][] = origins.map(() => destinations.map(() => null));
  for (const raw of json) {
    const parsed = elementSchema.safeParse(raw);
    if (!parsed.success) continue;
    const e = parsed.data;
    const row = out[e.originIndex];
    if (!row || e.destinationIndex >= row.length) continue;
    const seconds = secondsOf(e.duration);
    const failed = e.status?.code !== undefined && e.status.code !== 0;
    if (failed || e.condition !== 'ROUTE_EXISTS' || seconds === null) continue;
    row[e.destinationIndex] = { duration_s: seconds, distance_m: Math.round(e.distanceMeters) };
  }
  return out;
}

// ------------------------------------------------------------------ dos pares às matrizes
const pointKey = (p: DrivePoint) => `${String(p.lat)},${String(p.lng)}`;

/** Uma matriz a pedir: as origens, os destinos e, de cada par atendido, onde ele está no pedido. */
export type MatrixPlan = {
  origins: DrivePoint[];
  destinations: DrivePoint[];
  /** `[o índice do par no pedido, a origem na matriz, o destino na matriz]` */
  cells: [number, number, number][];
};

/**
 * Os pares agrupados em matrizes **sem elemento a mais** (o Google cobra por elemento): cada matriz é
 * uma origem para vários destinos, ou várias origens para um destino. A cada volta, a origem ou o
 * destino que atende mais pares ainda sem matriz vira uma; os pares repetidos saem numa só célula. As
 * opções de um passo (de casa a cada candidato; de cada candidato a casa) viram duas matrizes.
 */
export function planMatrices(pairs: readonly DrivePair[]): MatrixPlan[] {
  const left = new Map<number, DrivePair>(pairs.map((p, i) => [i, p]));
  const plans: MatrixPlan[] = [];
  while (left.size > 0) {
    const byFrom = new Map<string, number[]>();
    const byTo = new Map<string, number[]>();
    for (const [i, p] of left) {
      byFrom.set(pointKey(p.from), [...(byFrom.get(pointKey(p.from)) ?? []), i]);
      byTo.set(pointKey(p.to), [...(byTo.get(pointKey(p.to)) ?? []), i]);
    }
    const best = (groups: Map<string, number[]>) =>
      [...groups.values()].reduce<number[]>((a, b) => (b.length > a.length ? b : a), []);
    const fromGroup = best(byFrom);
    const toGroup = best(byTo);
    const fanOut = fromGroup.length >= toGroup.length;
    const group = (fanOut ? fromGroup : toGroup).slice(0, GOOGLE_MATRIX_MAX_ELEMENTS);
    const first = left.get(group[0] ?? -1);
    if (!first) break;
    // o lado que varia, sem repetir o ponto
    const many: DrivePoint[] = [];
    const indexOf = new Map<string, number>();
    const cells: [number, number, number][] = [];
    for (const i of group) {
      const p = left.get(i);
      if (!p) continue;
      const side = fanOut ? p.to : p.from;
      let at = indexOf.get(pointKey(side));
      if (at === undefined) {
        at = many.length;
        many.push(side);
        indexOf.set(pointKey(side), at);
      }
      cells.push(fanOut ? [i, 0, at] : [i, at, 0]);
      left.delete(i);
    }
    plans.push(
      fanOut
        ? { origins: [first.from], destinations: many, cells }
        : { origins: many, destinations: [first.to], cells },
    );
  }
  return plans;
}

/**
 * O tempo de carro de cada par, na ordem do pedido: as matrizes em paralelo, o erro de qualquer uma é o
 * erro do pedido (a tela diz que não deu para medir, e não mostra tempo). Devolve também quantas
 * matrizes e quantos elementos foram ao Google, para o log.
 */
export async function driveTimes(
  deps: RoutesDeps,
  key: string,
  pairs: readonly DrivePair[],
): Promise<{ times: (DriveTime | null)[]; requests: number; elements: number }> {
  const plans = planMatrices(pairs);
  const tables = await Promise.all(
    plans.map((plan) => routeMatrix(deps, key, plan.origins, plan.destinations)),
  );
  const times: (DriveTime | null)[] = pairs.map(() => null);
  plans.forEach((plan, p) => {
    for (const [i, o, d] of plan.cells) times[i] = tables[p]?.[o]?.[d] ?? null;
  });
  return {
    times,
    requests: plans.length,
    elements: plans.reduce((n, plan) => n + plan.origins.length * plan.destinations.length, 0),
  };
}
