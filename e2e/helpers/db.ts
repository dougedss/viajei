import { localEnv } from './users.ts';

/**
 * Lê o banco local pelo PostgREST com a chave secreta (só no Supabase local dos testes): é como o
 * e2e confere que a linha chegou ao servidor, e não só ao Dexie.
 */
export async function linhas(table: string, query: string): Promise<Record<string, unknown>[]> {
  const env = localEnv();
  const apiUrl = env.API_URL;
  const secret = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!apiUrl || !secret) throw new Error('supabase status não devolveu API_URL e SECRET_KEY');
  const res = await fetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>[];
}
