import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonColor } from '@shared/constants.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { db } from '@/lib/db/schema.ts';
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
