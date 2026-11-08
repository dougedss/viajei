import { BIOMES_SOURCE } from './biomes-data.ts';
import { COAST_SOURCE } from './coast-data.ts';
import { MUNICIPALITIES_SOURCE } from './municipalities-data.ts';

/**
 * Os dados embutidos: a costa, os biomas e os municípios, cada um no seu módulo, decodificados uma
 * vez e guardados em memória. Gerados por `scripts/geo/build-data.ts`; fontes e licenças em
 * docs/dados-geo.md. Tudo roda no celular.
 */
export { biomes, type Biome } from './biomes-data.ts';
export { coastLines } from './coast-data.ts';
export { municipalities, type Municipality } from './municipalities-data.ts';
export type { Polyline } from './polyline.ts';

export const DATA_SOURCES = {
  coast: COAST_SOURCE,
  biomes: BIOMES_SOURCE,
  municipalities: MUNICIPALITIES_SOURCE,
} as const;
