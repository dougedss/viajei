import municipalitiesJson from './data/municipalities.json';
import { decodeInts, decodeLine } from './codec.ts';

/** Os municípios do IBGE, decodificados uma vez. */
export type Municipality = { name: string; uf: string; lng: number; lat: number; pop: number };

let cache: Municipality[] | null = null;

export function municipalities(): Municipality[] {
  if (!cache) {
    const data = municipalitiesJson;
    const names = data.names.split('|');
    const coords = decodeLine(data.coords);
    const pop = decodeInts(data.pop);
    cache = names.map((name, i) => ({
      name,
      uf: data.uf.slice(i * 2, i * 2 + 2),
      lng: coords[i]?.[0] ?? 0,
      lat: coords[i]?.[1] ?? 0,
      pop: pop[i] ?? 0,
    }));
  }
  return cache;
}

export const MUNICIPALITIES_SOURCE = {
  source: municipalitiesJson.source,
  license: municipalitiesJson.license,
};
