import { FunctionsHttpError } from '@supabase/supabase-js';
import { stopPlaceKey } from '@shared/landmark-keys.ts';
import { checkResponseSchema, LANDMARKS_FN, type CheckRequest } from '@shared/landmark-protocol.ts';
import { parseRecipe } from '@shared/landmark-recipe.ts';
import { asStopKind } from '@/features/itinerary/stop-kinds.ts';
import { MINIATURE_BOX } from '@/art/stops/types.ts';
import { db, type LandmarkEntry } from '@/lib/db/schema.ts';
import type { Json } from '@/lib/supabase/database.types.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { renderPieceViews } from './render.ts';
import { pendingChecks } from './sync.ts';

/**
 * A segunda olhada, pelo aparelho (fase 23): a receita gerada que o servidor mandou a quem pediu é
 * montada e fotografada fora da tela, e as capturas vão à função `landmarks`, que compara com as
 * fotos de referência. `published`: a peça entra no catálogo local e na maquete (e na de todo mundo
 * pela próxima leitura). `adjusted`: a receita corrigida volta, e o aparelho desenha e confere mais
 * uma vez (uma rodada só). `rejected`/`stale`: o lugar fica com a miniatura do tipo. Uma conferência
 * de cada vez por lugar.
 */
const running = new Set<string>();

export type CheckOutcome = {
  place_key: string;
  result: 'published' | 'rejected' | 'stale' | 'failed';
  rounds: number;
};

export async function checkEntry(
  entry: LandmarkEntry,
  variant?: 'sonnet' | 'opus',
): Promise<CheckOutcome> {
  if (!entry.landmark_id) return { place_key: entry.place_key, result: 'failed', rounds: 0 };
  if (running.has(entry.place_key))
    return { place_key: entry.place_key, result: 'failed', rounds: 0 };
  running.add(entry.place_key);
  try {
    const box = await boxFor(entry);
    let recipe = parseRecipe(entry.recipe);
    let version = entry.version;
    for (let round = 0; round < 2; round++) {
      if (!recipe) break;
      const images = await renderPieceViews(recipe, box, 1);
      const body: CheckRequest = {
        action: 'check',
        landmark_id: entry.landmark_id,
        version,
        images,
        ...(variant ? { variant } : {}),
      };
      const res = await supabase.functions.invoke<unknown>(LANDMARKS_FN, { body });
      if (res.error) {
        if (res.error instanceof FunctionsHttpError) {
          // a cota ou a peça que já não espera a conferência: fica para a próxima leitura
          await db.landmarks.update(entry.place_key, {
            status: 'pending',
            fetched_at: new Date().toISOString(),
          });
        }
        return { place_key: entry.place_key, result: 'failed', rounds: round + 1 };
      }
      const parsed = checkResponseSchema.safeParse(res.data);
      if (!parsed.success)
        return { place_key: entry.place_key, result: 'failed', rounds: round + 1 };
      const out = parsed.data;
      if (out.result === 'published') {
        await db.landmarks.update(entry.place_key, {
          status: 'published',
          version: out.version,
          recipe: recipe as unknown as Json,
          fetched_at: new Date().toISOString(),
        });
        return { place_key: entry.place_key, result: 'published', rounds: round + 1 };
      }
      if (out.result === 'adjusted') {
        recipe = parseRecipe(out.recipe);
        version = out.version;
        await db.landmarks.update(entry.place_key, {
          version,
          recipe: (out.recipe ?? null) as Json,
        });
        continue;
      }
      await db.landmarks.update(entry.place_key, {
        status: out.result === 'rejected' ? 'none' : 'pending',
        recipe: null,
        fetched_at: new Date().toISOString(),
      });
      return { place_key: entry.place_key, result: out.result, rounds: round + 1 };
    }
    return { place_key: entry.place_key, result: 'failed', rounds: 2 };
  } catch {
    return { place_key: entry.place_key, result: 'failed', rounds: 0 };
  } finally {
    running.delete(entry.place_key);
  }
}

/** A caixa da peça: a do tipo da parada que tem essa chave, ou a da cidade. */
async function boxFor(entry: LandmarkEntry) {
  if (entry.kind === 'city') return MINIATURE_BOX.city;
  const stops = await db.stops
    .filter((s) => s.deleted_at === null && stopPlaceKey(s) === entry.place_key)
    .toArray();
  const kind = stops[0] ? asStopKind(stops[0].kind) : 'nature';
  return MINIATURE_BOX[kind];
}

/** Todas as receitas que este aparelho tem para conferir, uma depois da outra. */
export async function runPendingChecks(
  _tripId: string,
  variant?: 'sonnet' | 'opus',
): Promise<CheckOutcome[]> {
  const out: CheckOutcome[] = [];
  for (const entry of await pendingChecks()) out.push(await checkEntry(entry, variant));
  return out;
}
