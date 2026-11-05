import biomesJson from './data/biomes.json';
import coastJson from './data/coast.json';
import municipalitiesJson from './data/municipalities.json';
import {
  bboxOf,
  decodeInts,
  decodeLine,
  type Bbox,
  type BiomeCode,
  type BiomesData,
  type CoastData,
} from './codec.ts';

/**
 * Os dados embutidos, decodificados uma vez e guardados em memória. Gerados por
 * `scripts/geo/build-data.ts`; fontes e licenças em docs/dados-geo.md. Tudo roda no celular.
 */
export type Polyline = { bbox: Bbox; coords: [number, number][] };
export type Municipality = { name: string; uf: string; lng: number; lat: number; pop: number };
export type Biome = { code: BiomeCode; name: string; rings: Polyline[] };

const BIOME_NAMES: Record<BiomeCode, string> = {
  amazonia: 'Amazônia',
  caatinga: 'Caatinga',
  cerrado: 'Cerrado',
  mata_atlantica: 'Mata Atlântica',
  pampa: 'Pampa',
  pantanal: 'Pantanal',
};

let coastCache: Polyline[] | null = null;
let biomesCache: Biome[] | null = null;
let municipalitiesCache: Municipality[] | null = null;

function toPolyline(encoded: string): Polyline {
  const coords = decodeLine(encoded);
  return { bbox: bboxOf(coords), coords };
}

export function coastLines(): Polyline[] {
  coastCache ??= (coastJson as CoastData).lines.map(toPolyline);
  return coastCache;
}

export function biomes(): Biome[] {
  biomesCache ??= (biomesJson as BiomesData).biomes.map((b) => ({
    code: b.code,
    name: BIOME_NAMES[b.code],
    rings: b.rings.map(toPolyline),
  }));
  return biomesCache;
}

export function municipalities(): Municipality[] {
  if (!municipalitiesCache) {
    const data = municipalitiesJson;
    const names = data.names.split('|');
    const coords = decodeLine(data.coords);
    const pop = decodeInts(data.pop);
    municipalitiesCache = names.map((name, i) => ({
      name,
      uf: data.uf.slice(i * 2, i * 2 + 2),
      lng: coords[i]?.[0] ?? 0,
      lat: coords[i]?.[1] ?? 0,
      pop: pop[i] ?? 0,
    }));
  }
  return municipalitiesCache;
}

export const DATA_SOURCES = {
  coast: { source: (coastJson as CoastData).source, license: (coastJson as CoastData).license },
  biomes: {
    source: (biomesJson as BiomesData).source,
    license: (biomesJson as BiomesData).license,
  },
  municipalities: {
    source: municipalitiesJson.source,
    license: municipalitiesJson.license,
  },
} as const;
