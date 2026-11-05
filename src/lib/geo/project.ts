import { cumulativeM, projectOntoLine, type LngLat } from '@shared/geo.ts';

export type RouteIndex = { coords: readonly LngLat[]; cum: number[]; total_m: number };

/** Prepara a rota uma vez (distâncias acumuladas) para projetar muitos pontos nela. */
export function indexRoute(geometry: readonly LngLat[]): RouteIndex {
  const cum = cumulativeM(geometry);
  return { coords: geometry, cum, total_m: cum.at(-1) ?? 0 };
}

export type Projection = {
  /** fração percorrida, 0 a 1 */
  fraction: number;
  /** metros desde o início da rota */
  along_m: number;
  /** distância do ponto ao traçado, em metros */
  distance_m: number;
};

/** Onde um ponto cai na rota: a fração percorrida e a que distância está do traçado. */
export function projectOntoRoute(route: RouteIndex, point: LngLat): Projection {
  const p = projectOntoLine(route.coords, route.cum, point);
  return {
    fraction: p.fraction,
    along_m: p.fraction * route.total_m,
    distance_m: p.distance_m,
  };
}

/** Mais de 2 km do traçado é "fora da rota" (sem recálculo: o carrinho aparece fora da trilha). */
export const OFF_ROUTE_M = 2000;

export function isOffRoute(projection: Projection): boolean {
  return projection.distance_m > OFF_ROUTE_M;
}
