import {
  SCENERY_KINDS,
  type SceneryWeights,
  type TerrainSample,
  type WorldLayout,
} from '../layout.ts';

/**
 * O terreno amostrado uma vez só: altura, pesos dos cenários, água, distância da estrada e `s`
 * de cada célula de uma grade regular dentro dos limites visíveis, com a célula dimensionada para
 * caber no orçamento de vértices. A geometria do terreno lê as células; a decoração e o carro fora
 * da rota interpolam aqui em vez de chamar `terrainAt` de novo.
 */
export const TERRAIN_MAX_VERTICES = 70_000;
/** lado do talhão de lavoura, em unidades da cena */
export const PATCH = 9;

const WATER_CODE = { none: 0, sea: 1, lake: 2 } as const;
const WATER_KIND: TerrainSample['water'][] = ['none', 'sea', 'lake'];

export type HeightField = {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  heights: Float32Array;
  /** 5 pesos por célula, na ordem de SCENERY_KINDS */
  weights: Float32Array;
  water: Uint8Array;
  dist: Float32Array;
  km: Float32Array;
  s: Float32Array;
};

/** Tamanho da célula que mantém o terreno dentro do orçamento de vértices. */
export function cellSize(bounds: WorldLayout['bounds']): number {
  const area = (bounds.x1 - bounds.x0) * (bounds.z1 - bounds.z0);
  return Math.max(1, Math.sqrt(area / TERRAIN_MAX_VERTICES));
}

export function buildHeightField(layout: WorldLayout): HeightField {
  const { bounds } = layout;
  const cell = cellSize(bounds);
  const nx = Math.round((bounds.x1 - bounds.x0) / cell) + 1;
  const nz = Math.round((bounds.z1 - bounds.z0) / cell) + 1;
  const n = nx * nz;
  const field: HeightField = {
    x0: bounds.x0,
    z0: bounds.z0,
    cell,
    nx,
    nz,
    heights: new Float32Array(n),
    weights: new Float32Array(n * SCENERY_KINDS.length),
    water: new Uint8Array(n),
    dist: new Float32Array(n),
    km: new Float32Array(n),
    s: new Float32Array(n),
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const t = layout.terrainAt(bounds.x0 + i * cell, bounds.z0 + j * cell);
      field.heights[k] = t.h;
      SCENERY_KINDS.forEach((kind, w) => {
        field.weights[k * SCENERY_KINDS.length + w] = t.weights[kind];
      });
      field.water[k] = WATER_CODE[t.water];
      field.dist[k] = t.dist;
      field.km[k] = t.km;
      field.s[k] = t.s;
    }
  }
  return field;
}

/** Altura do terreno em qualquer ponto, interpolada do heightfield. */
export function heightAt(field: HeightField, x: number, z: number): number {
  const fx = Math.max(0, Math.min(field.nx - 1.001, (x - field.x0) / field.cell));
  const fz = Math.max(0, Math.min(field.nz - 1.001, (z - field.z0) / field.cell));
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - j;
  const h = (a: number, b: number) => field.heights[b * field.nx + a] ?? 0;
  const top = h(i, j) * (1 - tx) + h(i + 1, j) * tx;
  const bottom = h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx;
  return top * (1 - tz) + bottom * tz;
}

/** O índice da célula mais perto de um ponto. */
export function cellIndex(field: HeightField, x: number, z: number): number {
  const i = Math.max(0, Math.min(field.nx - 1, Math.round((x - field.x0) / field.cell)));
  const j = Math.max(0, Math.min(field.nz - 1, Math.round((z - field.z0) / field.cell)));
  return j * field.nx + i;
}

/** A amostra guardada numa célula, pelo índice. */
export function sampleCell(field: HeightField, k: number): TerrainSample {
  const weights = {} as SceneryWeights;
  SCENERY_KINDS.forEach((kind, w) => {
    weights[kind] = field.weights[k * SCENERY_KINDS.length + w] ?? 0;
  });
  return {
    h: field.heights[k] ?? 0,
    weights,
    water: WATER_KIND[field.water[k] ?? 0] ?? 'none',
    dist: field.dist[k] ?? 0,
    km: field.km[k] ?? 0,
    s: field.s[k] ?? 0,
  };
}

/** A amostra do terreno num ponto: a célula mais perto, com a altura interpolada. */
export function sampleField(field: HeightField, x: number, z: number): TerrainSample {
  const t = sampleCell(field, cellIndex(field, x, z));
  t.h = heightAt(field, x, z);
  return t;
}
