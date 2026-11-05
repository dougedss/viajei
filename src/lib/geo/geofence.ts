import { haversineM } from '@shared/geo.ts';

/**
 * Chegada e saída por presença, para o catch-up e o modo painel (fase 4). Chegada: dentro de
 * 150 m por pelo menos 3 min. Saída: mais de 300 m. Regras puras sobre leituras de posição.
 */
export type Fix = { lng: number; lat: number; t: number };
type Place = { lat: number; lng: number };

export const ARRIVAL_RADIUS_M = 150;
export const ARRIVAL_DWELL_MS = 3 * 60_000;
export const DEPARTURE_RADIUS_M = 300;

export function isWithin(fix: Place, place: Place, radiusM: number): boolean {
  return haversineM([fix.lng, fix.lat], [place.lng, place.lat]) <= radiusM;
}

/**
 * O instante em que a chegada ficou provada: o fim do primeiro intervalo de 3 min em que todas
 * as leituras ficaram a menos de 150 m da parada. `null` se ainda não houve.
 */
export function arrivalAt(fixes: readonly Fix[], place: Place): number | null {
  let runStart: number | null = null;
  for (const fix of [...fixes].sort((a, b) => a.t - b.t)) {
    if (isWithin(fix, place, ARRIVAL_RADIUS_M)) {
      runStart ??= fix.t;
      if (fix.t - runStart >= ARRIVAL_DWELL_MS) return fix.t;
    } else {
      runStart = null;
    }
  }
  return null;
}

export function hasArrived(fixes: readonly Fix[], place: Place): boolean {
  return arrivalAt(fixes, place) !== null;
}

/** Saiu da parada: a leitura está a mais de 300 m dela. */
export function hasDeparted(fix: Place, place: Place): boolean {
  return !isWithin(fix, place, DEPARTURE_RADIUS_M);
}
