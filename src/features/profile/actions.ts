import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonColor } from '@shared/constants.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { db } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
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
  if (connectivity.isOnline()) await syncEngine.syncNow();
  const pending = await db.outbox.count();
  if (pending > 0) return pending;
  await signOutNow();
  return 0;
}

/** Sai e apaga tudo deste aparelho. O próximo a entrar começa do zero, mesmo que seja a mesma pessoa. */
export async function signOutNow(): Promise<void> {
  syncEngine.stop();
  await supabase.auth.signOut();
  await db.delete();
  await db.open();
}
