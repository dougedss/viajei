import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types.ts';
import { pushResultsSchema, type PushOp, type PushResult } from '../outbox.ts';

/**
 * A chamada de `sync_push` a partir de um client qualquer: o motor do app usa o client da tela; o
 * service worker usa o seu, criado sobre a mesma sessão em IndexedDB. Erro de rede sobe como está.
 */
export function pushRpcFor(
  client: SupabaseClient<Database>,
): (ops: PushOp[]) => Promise<PushResult[]> {
  return async (ops) => {
    const p_ops = ops.map(({ seq, table, id, op, values, versions, updated_at }) => ({
      seq,
      table,
      id,
      op,
      values,
      versions,
      updated_at,
    })) as unknown as Json;
    const { data, error } = await client.rpc('sync_push', { p_ops });
    if (error) throw error;
    return pushResultsSchema.parse(data);
  };
}
