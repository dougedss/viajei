import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Interest, PersonColor } from '@shared/constants.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, syncKeys, type Profile } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { mediaQueue, stopMedia } from '@/lib/media/index.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { profileKeys } from './queries.ts';

export function useUpdateProfile() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const uid = session?.user.id ?? '';
  return useMutation({
    mutationFn: async (input: { name: string; color: PersonColor }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ name: input.name, color: input.color, updated_at: new Date().toISOString() })
        .eq('id', uid);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKeys.me(uid) }),
  });
}

/**
 * Sair: tenta enviar o que está pendente; se sobrar algo, devolve a contagem para a tela
 * confirmar com a pessoa (sair apaga os dados locais, inclusive a fila). Zero = saiu.
 */
export async function trySignOut(): Promise<number> {
  if (connectivity.isOnline()) {
    // primeiro os arquivos (a linha do anexo só nasce depois deles), depois a outbox
    await mediaQueue.drain();
    await syncEngine.syncNow();
  }
  // as fotos e documentos que ainda não subiram também se perdem ao sair
  const uploads = (await db.uploads.toArray()).filter((j) => j.op === 'upload').length;
  const pending = (await db.outbox.count()) + uploads;
  if (pending > 0) return pending;
  await signOutNow();
  return 0;
}

/** Sai e apaga tudo deste aparelho. O próximo a entrar começa do zero, mesmo que seja a mesma pessoa. */
export async function signOutNow(): Promise<void> {
  syncEngine.stop();
  stopMedia();
  await supabase.auth.signOut();
  await db.delete();
  await db.open();
}

/**
 * Os padrões dos avisos das viagens novas (fase 16), no perfil, pela outbox: a antecedência e a hora
 * do briefing com que a linha de avisos de uma viagem nasce. Offline, como o carro.
 */
export async function saveNotifyDefaults(
  patch: Partial<Pick<Profile, 'notify_lead_minutes' | 'notify_morning_time'>>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const uid = (await db.sync_state.get(syncKeys.uid))?.value;
  if (!uid) throw new Error('sem a pessoa deste aparelho');
  await mutate.patch('profiles', uid, patch);
}

/**
 * "O que você gosta" (fase 17), no perfil, pela outbox: offline, como o carro. Só a própria pessoa
 * muda (o grant da 0015).
 */
export async function saveInterests(interests: readonly Interest[]): Promise<void> {
  const uid = (await db.sync_state.get(syncKeys.uid))?.value;
  if (!uid) throw new Error('sem a pessoa deste aparelho');
  await mutate.patch('profiles', uid, { interests: [...interests] });
}
