import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonColor } from '@shared/constants.ts';
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

export async function signOut() {
  await supabase.auth.signOut();
}
