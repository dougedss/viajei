import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client.ts';
import { invitesKeys } from './queries.ts';

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.rpc('accept_invite', { p_member_id: memberId });
      if (error) throw error;
      return data;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitesKeys.pending }),
  });
}

export function useDeclineInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.rpc('decline_invite', { p_member_id: memberId });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitesKeys.pending }),
  });
}
