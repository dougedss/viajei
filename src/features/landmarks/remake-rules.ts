import { parseRecipe, type LandmarkRecipe } from '@shared/landmark-recipe.ts';
import type { LandmarkEntry } from '@/lib/db/schema.ts';

/**
 * As regras puras do refazer (fase 23, decisão 6 de 15/11), sem rede e sem o client do Supabase (o
 * Vitest as importa; o módulo que fala com o servidor é `remake.ts`): quem planejou a viagem pede,
 * uma vez por lugar; o servidor gera **duas** opções novas; a pessoa vê as três (a atual e as duas) e
 * **precisa escolher** (0 fica a atual). Um lugar custa no máximo três gerações na vida do app.
 */
export type RemakeState =
  | { kind: 'unavailable' }
  | { kind: 'available' }
  | { kind: 'generating'; id: string }
  | { kind: 'choosing'; id: string; options: [LandmarkRecipe | null, LandmarkRecipe | null] }
  | { kind: 'done' };

/** O que a folha da parada mostra para a peça de um lugar, pelo catálogo local. */
export function remakeState(entry: LandmarkEntry | undefined, isOwner: boolean): RemakeState {
  if (entry?.status !== 'published') return { kind: 'unavailable' };
  const remake = entry.remake;
  if (remake?.status === 'choosing') {
    const [a, b] = remake.options;
    return { kind: 'choosing', id: remake.id, options: [parseRecipe(a), parseRecipe(b)] };
  }
  if (remake?.status === 'generating') return { kind: 'generating', id: remake.id };
  if (remake) return { kind: 'done' };
  return isOwner && entry.can_remake ? { kind: 'available' } : { kind: 'unavailable' };
}

/** A escolha é obrigatória e é uma das três: 0 (a atual), 1 ou 2 (as novas que vieram). */
export function validChoice(state: RemakeState, choice: number | null): choice is 0 | 1 | 2 {
  if (state.kind !== 'choosing' || choice === null) return false;
  if (choice === 0) return true;
  return (choice === 1 || choice === 2) && state.options[choice - 1] !== null;
}
