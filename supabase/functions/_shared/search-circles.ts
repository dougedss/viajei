import { haversineM } from './geo.ts';

/**
 * Onde se procura um passo do passeio (fase 27, D289; o app procura o passo seguinte desde a fase 26):
 * os círculos de busca, puros e sem rede, usados pela ferramenta `procurar_lugares` da função e pela
 * busca do passo seguinte no app, para os dois procurarem do mesmo jeito. O `locationBias` da Text
 * Search do Google é um círculo de até 50 km; "no caminho" são círculos ao longo da linha reta entre
 * dois pontos (a busca ao longo de uma rota não existe na Text Search).
 */
export type Point = { lat: number; lng: number };
export type Circle = Point & { radius_m: number };

/** O círculo em volta do centro de uma cidade: o município costuma caber nisto. */
export const CITY_RADIUS_M = 25_000;
/** "Perto" sem raio dito, e o teto do Google. */
export const NEAR_DEFAULT_KM = 15;
export const NEAR_MAX_KM = 50;
/** "No caminho": círculos ao longo da linha, no máximo quatro por busca. */
export const ROUTE_MAX_CIRCLES = 4;
export const ROUTE_CIRCLE_KM = 40;

export const kmBetween = (a: Point, b: Point): number =>
  haversineM([a.lng, a.lat], [b.lng, b.lat]) / 1000;

/** O círculo de "perto": 15 km sem raio dito, até 50. */
export function nearCircle(at: Point, radiusKm = NEAR_DEFAULT_KM): Circle {
  const km = radiusKm > 0 ? Math.min(NEAR_MAX_KM, radiusKm) : NEAR_DEFAULT_KM;
  return { lat: at.lat, lng: at.lng, radius_m: Math.round(km * 1000) };
}

/** O círculo de uma cidade: 25 km em volta do centro dela. */
export function cityCircle(center: Point): Circle {
  return { lat: center.lat, lng: center.lng, radius_m: CITY_RADIUS_M };
}

/** Os círculos ao longo da linha reta entre dois pontos: até quatro, de uns 40 km cada. */
export function routeCircles(from: Point, to: Point): Circle[] {
  const dist = kmBetween(from, to);
  const n = Math.max(1, Math.min(ROUTE_MAX_CIRCLES, Math.ceil(dist / ROUTE_CIRCLE_KM)));
  const radiusKm = Math.min(NEAR_MAX_KM, dist / n / 2 + 10);
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
      radius_m: Math.round(radiusKm * 1000),
    };
  });
}

/** Um ponto vale: finito, dentro do mapa, e não o (0, 0) que a IA usa para "não se usa". */
export const isPoint = (lat: number, lng: number): boolean =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  !(lat === 0 && lng === 0) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
