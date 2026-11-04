import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client.ts';

export const invitesKeys = { pending: ['invites', 'pending'] as const };

/** Convites pendentes do e-mail confirmado (RPC my_pending_invites). Online; some ao aceitar ou recusar. */
export function usePendingInvites() {
  return useQuery({
    queryKey: invitesKeys.pending,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_pending_invites');
      if (error) throw error;
      return data;
    },
  });
}
