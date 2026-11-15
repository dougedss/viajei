import type { Interest } from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, syncKeys } from '@/lib/db/schema.ts';

/**
 * "O que você gosta" (fase 17), no perfil, pela outbox: offline, como o carro. Só a própria pessoa
 * muda (o grant da 0015). Num módulo só dele, sem o client do Supabase: só a outbox escreve.
 */
export async function saveInterests(interests: readonly Interest[]): Promise<void> {
  const uid = (await db.sync_state.get(syncKeys.uid))?.value;
  if (!uid) throw new Error('sem a pessoa deste aparelho');
  await mutate.patch('profiles', uid, { interests: [...interests] });
}
