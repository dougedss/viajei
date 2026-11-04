import { useQuery } from '@tanstack/react-query';
import { PERSON_COLOR_KEYS, type PersonColor } from '@shared/constants.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';

export const profileKeys = { me: (uid: string) => ['profile', uid] as const };

export function asPersonColor(value: string): PersonColor {
  return (PERSON_COLOR_KEYS as string[]).includes(value) ? (value as PersonColor) : 'sunset';
}

/** O próprio perfil. Editado online (TanStack Query), não pela outbox. */
export function useProfile() {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  return useQuery({
    queryKey: profileKeys.me(uid),
    enabled: uid !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, color')
        .eq('id', uid)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
