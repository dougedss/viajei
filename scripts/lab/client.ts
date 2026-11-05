import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../src/lib/supabase/database.types.ts';
import { derivePassword, type LabConfig, type LabUser } from './env.ts';

/**
 * Os clients do laboratório. Cada usuário de laboratório é um client com sessão própria, sem
 * persistência: o laboratório fala com o servidor como o app fala, pelas mesmas RPCs e com a RLS
 * valendo. Escritas nas tabelas sincronizadas vão pelo `sync_push`, o mesmo caminho da outbox.
 */
export type Lab = SupabaseClient<Database>;

export function labClient(cfg: Pick<LabConfig, 'url'>, key: string): Lab {
  return createClient<Database>(cfg.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function signIn(cfg: LabConfig, user: LabUser): Promise<{ client: Lab; uid: string }> {
  const client = labClient(cfg, cfg.publishableKey);
  const password = await derivePassword(cfg.secret, user.email);
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error(`entrar como ${user.email}: ${error.message}`);
  return { client, uid: data.user.id };
}

export type Op = {
  table: string;
  id: string;
  op: 'upsert' | 'patch';
  values: Record<string, unknown>;
};

type PushResult = { seq: number; status: string; code?: string; message?: string };

/** Um lote pelo `sync_push`, com versões da hora desta escrita. Qualquer erro de operação lança. */
export async function syncPush(client: Lab, ops: readonly Op[]): Promise<void> {
  if (ops.length === 0) return;
  const now = new Date().toISOString();
  const p_ops = ops.map((o, i) => ({
    seq: i + 1,
    table: o.table,
    id: o.id,
    op: o.op,
    values: o.values,
    versions: Object.fromEntries(Object.keys(o.values).map((k) => [k, now])),
    updated_at: now,
  })) as unknown as Json;
  const { data, error } = await client.rpc('sync_push', { p_ops });
  if (error) throw new Error(`sync_push: ${error.message}`);
  const results = data as unknown as PushResult[];
  const bad = results.filter((r) => r.status !== 'applied' && r.status !== 'ignored');
  if (bad.length > 0) {
    const detail = bad
      .map((r) => {
        const op = ops[r.seq - 1];
        return `${op?.table ?? '?'}/${op?.op ?? '?'}: ${r.status} ${r.code ?? ''} ${r.message ?? ''}`;
      })
      .join('; ');
    throw new Error(`sync_push recusou: ${detail}`);
  }
}

/** O resultado de uma consulta que tem de trazer dados. */
export function must<T>(
  result: { data: T | null; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: veio vazio`);
  return result.data;
}

/** O resultado de uma escrita sem retorno (delete, insert sem select). */
export function ok(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}
