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

/**
 * Grava direto no banco local dos testes, com a chave secreta (como o servidor gravaria): serve para
 * montar o que o app não deixa fazer pela tela, como uma viagem que já terminou com paradas
 * concluídas (o Modo Viagem só marca o dia de hoje).
 */
export async function inserir(table: string, rows: Record<string, unknown>[]): Promise<void> {
  const env = localEnv();
  const apiUrl = env.API_URL;
  const secret = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!apiUrl || !secret) throw new Error('supabase status não devolveu API_URL e SECRET_KEY');
  const res = await fetch(`${apiUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table} ${res.status}: ${await res.text()}`);
}
