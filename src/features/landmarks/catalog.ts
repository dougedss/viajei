import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { parseRecipe, type LandmarkRecipe } from '@shared/landmark-recipe.ts';
import { db, type LandmarkEntry } from '@/lib/db/schema.ts';

/**
 * O catálogo dos cartões-postais neste aparelho (fase 23): o que a `landmark_sync` disse de cada
 * lugar do app, guardado no Dexie (`landmarks`, v7) para a peça do lugar abrir sem rede. A maquete lê
 * só as publicadas que passam no schema; o resto (pendente, sem referência, teto) serve ao pedido
 * seguinte e à folha da parada (o refazer).
 */
export type Catalog = ReadonlyMap<string, LandmarkEntry>;

/** Todas as linhas do catálogo local, pela chave (`undefined` enquanto o Dexie lê). */
export function useLandmarkCatalog(): Catalog | undefined {
  const rows = useLiveQuery(() => db.landmarks.toArray(), []);
  return useMemo(() => (rows ? new Map(rows.map((r) => [r.place_key, r])) : undefined), [rows]);
}

/** As receitas publicadas e válidas, pela chave: o que a maquete monta. */
export function publishedRecipes(
  catalog: Catalog | undefined,
): ReadonlyMap<string, LandmarkRecipe> {
  const out = new Map<string, LandmarkRecipe>();
  if (!catalog) return out;
  for (const [key, row] of catalog) {
    if (row.status !== 'published') continue;
    const recipe = parseRecipe(row.recipe);
    if (recipe) out.set(key, recipe);
  }
  return out;
}

/** Grava o que o servidor respondeu; o que ele não citou fica como estava. */
export async function storeCatalog(rows: readonly LandmarkEntry[]): Promise<void> {
  if (rows.length === 0) return;
  await db.landmarks.bulkPut([...rows]);
}
