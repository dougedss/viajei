import { z } from 'zod';
import { db, type LandmarkEntry } from '@/lib/db/schema.ts';
import type { Json } from '@/lib/supabase/database.types.ts';
import { supabase } from '@/lib/supabase/client.ts';
import type { RemakeState } from './remake-rules.ts';

export { remakeState, validChoice, type RemakeState } from './remake-rules.ts';

/**
 * Refazer, com limite (fase 23, decisão 6 de 15/11): quem planejou a viagem pede, uma vez por lugar;
 * o servidor gera **duas** opções novas; a pessoa vê as três (a atual e as duas) e **precisa escolher**
 * (0 fica a atual); a escolhida vira a peça do catálogo para todos. Um lugar custa no máximo três
 * gerações na vida do app. As regras puras aqui são testadas sem rede.
 */
/** Pede o refazer ao servidor e marca o pedido no catálogo local. */
export async function requestRemake(tripId: string, entry: LandmarkEntry): Promise<string | null> {
  if (!entry.landmark_id) return null;
  const { data, error } = await supabase.rpc('landmark_remake', {
    p_trip: tripId,
    p_landmark: entry.landmark_id,
  });
  if (error || typeof data !== 'string') return null;
  await db.landmarks.update(entry.place_key, {
    can_remake: false,
    remake: { id: data, status: 'generating', options: [null, null] },
  });
  return data;
}

const chooseSchema = z.object({ landmark_id: z.string(), chosen: z.number(), version: z.number() });

/** Escolhe; a escolhida passa a ser a peça (aqui e, pelo catálogo, para todos). */
export async function chooseRemake(
  entry: LandmarkEntry,
  state: RemakeState,
  choice: 0 | 1 | 2,
): Promise<boolean> {
  if (state.kind !== 'choosing') return false;
  const { data, error } = await supabase.rpc('landmark_choose', {
    p_remake: state.id,
    p_choice: choice,
  });
  const parsed = chooseSchema.safeParse(data);
  if (error || !parsed.success) return false;
  const recipe =
    choice === 0 ? entry.recipe : ((state.options[choice - 1] ?? null) as unknown as Json);
  await db.landmarks.update(entry.place_key, {
    recipe,
    version: parsed.data.version,
    remake: { id: state.id, status: 'chosen', options: [null, null] },
    fetched_at: new Date().toISOString(),
  });
  return true;
}
