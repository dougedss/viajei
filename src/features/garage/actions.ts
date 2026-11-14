import { mutate } from '@/lib/db/mutate.ts';
import { db, syncKeys } from '@/lib/db/schema.ts';
import type { CarPatch } from './rules.ts';

/**
 * Grava a escolha da garagem no perfil da pessoa (fase 16), pela mesma `mutate` de tudo: só as
 * colunas tocadas, no Dexie e na outbox, offline. A outbox funde toques seguidos na mesma coluna
 * antes de enviar. A prévia nunca chega aqui. A pessoa é a dona deste banco local.
 */
export async function saveCar(patch: CarPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const uid = (await db.sync_state.get(syncKeys.uid))?.value;
  if (!uid) throw new Error('sem a pessoa deste aparelho');
  await mutate.patch('profiles', uid, patch);
}
