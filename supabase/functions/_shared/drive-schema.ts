import { z } from 'zod';
import { round5 } from './drive.ts';
import type { LngLat } from './geo.ts';
import { placesErrorSchema, type PlacesErrorCode } from './places-schema.ts';

/**
 * Contrato da Edge Function `drive-times` (a correção de 22/11/2026, D310), o mesmo Zod no servidor e
 * no app: **o tempo de carro medido**, par a par, pela Routes API do Google (`computeRouteMatrix`, sem
 * trânsito). É o que a tela mostra em "X min de carro" e o que entra na conta do passeio: nenhum tempo
 * de carro mostrado é estimativa em linha reta (o pedido do Douglas de 22/11: "a estimativa deveria vir
 * da api do google e não cálculo com chute"). A chave só no servidor (`GOOGLE_PLACES_API_KEY`, com a
 * Routes API na restrição dela); nenhuma chamada ao Google sai do navegador.
 */
export const DRIVE_FN = 'drive-times';
/** Por pessoa, em 24 h móveis (`edge_call`): uma conversa faz de três a dez medições. */
export const DRIVE_DAILY_LIMIT = 200;
/** Os pares de um pedido: cada par é um elemento cobrado pelo Google (o teto dele é 625 por matriz). */
export const DRIVE_MAX_PAIRS = 60;

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type DrivePoint = z.infer<typeof pointSchema>;

/** Um par: de onde e para onde. O tempo de ida não é o de volta (mão única, acessos): cada um é um par. */
export const drivePairSchema = z.object({ from: pointSchema, to: pointSchema });
export type DrivePair = z.infer<typeof drivePairSchema>;

export const driveRequestSchema = z.object({
  pairs: z.array(drivePairSchema).min(1).max(DRIVE_MAX_PAIRS),
});
export type DriveRequest = z.infer<typeof driveRequestSchema>;

/** O que o Google mediu num par: os segundos de carro e os metros de estrada. */
export const driveTimeSchema = z.object({
  duration_s: z.number().int().nonnegative(),
  distance_m: z.number().int().nonnegative(),
});
export type DriveTime = z.infer<typeof driveTimeSchema>;

/** A resposta: um item por par, na ordem do pedido; `null` quando o Google não achou estrada entre os dois. */
export const driveResponseSchema = z.object({
  provider: z.literal('google'),
  fetched_at: z.string(),
  times: z.array(driveTimeSchema.nullable()),
});
export type DriveResponse = z.infer<typeof driveResponseSchema>;

/** Os códigos de erro são os da `find-places` (a mesma fonte, a mesma cota, os mesmos casos). */
export type DriveErrorCode = PlacesErrorCode;
export const driveErrorSchema = placesErrorSchema;

// ------------------------------------------------------------------ a tabela dos tempos medidos
/**
 * Os tempos de carro medidos, por par de pontos: os segundos, ou `null` quando o Google respondeu que
 * não há estrada entre os dois. **O par que não está na tabela não foi medido**: a tela não mostra tempo
 * para ele (mostra a distância em linha reta, que é um fato) e a conta do passeio espera.
 */
export type DriveTable = Readonly<Record<string, number | null>>;

/** A coordenada na chave e no pedido: quatro casas (uns 11 m). */
const r4 = (n: number) => n.toFixed(4);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** Um ponto como aparece na chave: "lng,lat", com quatro casas. */
export function drivePoint(p: LngLat): string {
  return `${r4(p[0])},${r4(p[1])}`;
}

/** A chave de um par na tabela: "lng,lat>lng,lat", com quatro casas. */
export function driveKey(from: LngLat, to: LngLat): string {
  return `${drivePoint(from)}>${drivePoint(to)}`;
}

/** Só os pares da tabela entre os pontos dados (o que o caminho pronto leva para a revisão). */
export function tableAmong(
  table: DriveTable,
  points: readonly LngLat[],
): Record<string, number | null> {
  const kept = new Set(points.map(drivePoint));
  const out: Record<string, number | null> = {};
  for (const [key, seconds] of Object.entries(table)) {
    const [from = '', to = ''] = key.split('>');
    if (kept.has(from) && kept.has(to)) out[key] = seconds;
  }
  return out;
}

/** Os dois pontos são o mesmo lugar para a medição (a mesma chave): o tempo entre eles é zero. */
export function samePoint(a: LngLat, b: LngLat): boolean {
  return r4(a[0]) === r4(b[0]) && r4(a[1]) === r4(b[1]);
}

/** O par como vai no pedido, arredondado como a chave. */
export function drivePair(from: LngLat, to: LngLat): DrivePair {
  return {
    from: { lat: round4(from[1]), lng: round4(from[0]) },
    to: { lat: round4(to[1]), lng: round4(to[0]) },
  };
}

/**
 * Os minutos de carro entre dois pontos, pela tabela: arredondados a 5 (os horários do roteiro ficam em
 * múltiplos de 5, e a tela diz "cerca de": o Google mede sem o trânsito da hora); 0 no mesmo ponto;
 * `null` quando o par não foi medido ou não tem estrada.
 */
export function measuredMinutes(
  table: DriveTable | null | undefined,
  from: LngLat,
  to: LngLat,
): number | null {
  if (samePoint(from, to)) return 0;
  const seconds = table?.[driveKey(from, to)];
  return seconds === undefined || seconds === null ? null : round5(seconds / 60);
}

/** Os pares que faltam medir: sem o mesmo ponto, sem repetir, sem o que a tabela já tem. */
export function missingPairs(
  table: DriveTable | null | undefined,
  pairs: readonly (readonly [LngLat, LngLat])[],
): [LngLat, LngLat][] {
  const seen = new Set<string>();
  const out: [LngLat, LngLat][] = [];
  for (const [from, to] of pairs) {
    if (samePoint(from, to)) continue;
    const key = driveKey(from, to);
    if (seen.has(key) || (table && key in table)) continue;
    seen.add(key);
    out.push([from, to]);
  }
  return out;
}

/** O que voltou da função, como entradas da tabela (os segundos; `null` sem estrada). */
export function tableOf(
  pairs: readonly (readonly [LngLat, LngLat])[],
  times: readonly (DriveTime | null)[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  pairs.forEach(([from, to], i) => {
    const time = times[i];
    if (time !== undefined) out[driveKey(from, to)] = time === null ? null : time.duration_s;
  });
  return out;
}
