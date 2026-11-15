import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { PERSON_COLOR_KEYS, type PersonColor } from '@shared/constants.ts';
import { db } from '@/lib/db/schema.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { learnedLikes, type Learned } from './likes.ts';

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

/**
 * O que a pessoa deu 4 ou 5 no "Como foi?", pelo tipo da parada (fase 17): uma leitura das notas no
 * aparelho, refeita quando elas mudam. `undefined` enquanto lê (o perfil espera, para pintar inteiro).
 */
export function useLearnedLikes(uid: string): Learned[] | undefined {
  return useLiveQuery(async () => {
    if (!uid) return [];
    const memories = await db.stop_memories.filter((m) => m.user_id === uid).toArray();
    const stops = await db.stops.bulkGet([...new Set(memories.map((m) => m.stop_id))]);
    return learnedLikes(
      memories,
      stops.filter((s) => s !== undefined),
      uid,
    );
  }, [uid]);
}
