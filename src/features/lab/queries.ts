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

/** Uma rodada da bateria (fase 27), com o `data` de cada pedido (o painel lê o que saiu). */
export type BateriaRunRow = LabRunRow & {
  lab_checks: (LabRunRow['lab_checks'][number] & { data: unknown })[];
};

/** As rodadas da bateria de pedidos de leigo (`source: bateria`), com o que cada pedido guardou. */
export function useBateriaRuns(limit = 20) {
  return useQuery({
    queryKey: [...labKeys.runs, 'bateria'] as const,
    refetchInterval: 60_000,
    queryFn: async (): Promise<BateriaRunRow[]> => {
      const { data, error } = await supabase
        .from('lab_runs')
        .select(
          'id, target, source, commit_sha, status, summary, started_at, finished_at, diagnostics, lab_checks (scenario, status, latency_ms, detail, data)',
        )
        .eq('source', 'bateria')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
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
        .neq('source', 'bateria')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}
