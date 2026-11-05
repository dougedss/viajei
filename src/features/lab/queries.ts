import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import type { LabRunRow } from './rules.ts';

/**
 * O laboratório é dado exclusivo de servidor (não sincroniza, não fica offline): TanStack Query,
 * como o perfil. A RLS só mostra para quem está em `lab_access`.
 */
export const labKeys = {
  role: (uid: string) => ['lab', 'role', uid] as const,
  runs: ['lab', 'runs'] as const,
};

export function useLabRole() {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  return useQuery({
    queryKey: labKeys.role(uid),
    enabled: uid !== '',
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_lab_role');
      if (error) throw error;
      return data as 'runner' | 'viewer' | null;
    },
  });
}

export function useLabRuns(limit = 30) {
  return useQuery({
    queryKey: labKeys.runs,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LabRunRow[]> => {
      const { data, error } = await supabase
        .from('lab_runs')
        .select(
          'id, target, source, commit_sha, status, summary, started_at, finished_at, diagnostics, lab_checks (scenario, status, latency_ms, detail)',
        )
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}
