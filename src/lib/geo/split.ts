import { haversineM } from '@shared/geo.ts';
import type { LngLat } from '@/lib/db/schema.ts';

/**
 * Corta a geometria da rota nas paradas: para cada parada, o vértice mais perto dela, sempre adiante
 * do anterior. Devolve um pedaço por trecho. Serve ao filme (a viagem num caminho só) e ao mapa (o trecho rodado com outro peso).
 */
export function splitAtStops(geometry: readonly LngLat[], stops: readonly LngLat[]): LngLat[][] {
  const cuts: number[] = [];
  let from = 0;
  for (const p of stops) {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < geometry.length; i++) {
      const g = geometry[i];
      if (!g) continue;
      const d = haversineM(g, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    cuts.push(best);
    from = best;
  }
  const pieces: LngLat[][] = [];
  for (let k = 0; k < cuts.length - 1; k++) {
    pieces.push(geometry.slice(cuts[k] ?? 0, (cuts[k + 1] ?? 0) + 1));
  }
  return pieces;
}
