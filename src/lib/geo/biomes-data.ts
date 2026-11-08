import biomesJson from './data/biomes.json';
import type { BiomeCode, BiomesData } from './codec.ts';
import { toPolyline, type Polyline } from './polyline.ts';

/** Os biomas, decodificados uma vez. */
export type Biome = { code: BiomeCode; name: string; rings: Polyline[] };

const BIOME_NAMES: Record<BiomeCode, string> = {
  amazonia: 'Amazônia',
  caatinga: 'Caatinga',
  cerrado: 'Cerrado',
  mata_atlantica: 'Mata Atlântica',
  pampa: 'Pampa',
  pantanal: 'Pantanal',
};

let cache: Biome[] | null = null;

export function biomes(): Biome[] {
  cache ??= (biomesJson as BiomesData).biomes.map((b) => ({
    code: b.code,
    name: BIOME_NAMES[b.code],
    rings: b.rings.map(toPolyline),
  }));
  return cache;
}

export const BIOMES_SOURCE = {
  source: (biomesJson as BiomesData).source,
  license: (biomesJson as BiomesData).license,
};
