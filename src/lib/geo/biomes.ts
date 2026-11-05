import { biomes, type Polyline } from './data.ts';
import type { BiomeCode } from './codec.ts';

function inBbox(lng: number, lat: number, ring: Polyline): boolean {
  const [minX, minY, maxX, maxY] = ring.bbox;
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY;
}

/** Ray casting: ímpar de cruzamentos para a direita = dentro. */
function inRing(lng: number, lat: number, ring: Polyline): boolean {
  const pts = ring.coords;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i] ?? [0, 0];
    const [xj, yj] = pts[j] ?? [0, 0];
    const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * O bioma do IBGE em que o ponto cai, ou `null` fora do Brasil. Regra par-ímpar sobre todos os
 * anéis do bioma: um buraco conta de novo e anula, então ilhas e enclaves saem certos sem
 * distinguir anel externo de interno.
 */
export function biomeAt(lng: number, lat: number): BiomeCode | null {
  for (const biome of biomes()) {
    let inside = false;
    for (const ring of biome.rings) {
      if (inBbox(lng, lat, ring) && inRing(lng, lat, ring)) inside = !inside;
    }
    if (inside) return biome.code;
  }
  return null;
}

export { biomes } from './data.ts';
