import { execFileSync } from 'node:child_process';

/**
 * Usuário descartável por execução, criado pela Admin API do Supabase local (já confirmado). Serve
 * aos testes que precisam de uma viagem de hoje: com datas de hoje, `/` redireciona para o Modo
 * Viagem (D33), o que quebraria os outros testes se a viagem fosse de um dos usuários do seed.
 */
export const SENHA = 'viajei123';

export function localEnv(): Record<string, string> {
  const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  const env: Record<string, string> = {};
  for (const line of out.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return env;
}

export async function criarUsuarioDescartavel(nome: string): Promise<string> {
  return (await criarUsuario(nome)).email;
}

/** O usuário descartável com o id (para montar dados dele direto no banco). */
export async function criarUsuario(nome: string): Promise<{ email: string; id: string }> {
  const env = localEnv();
  const apiUrl = env.API_URL;
  const secret = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY;
  if (!apiUrl || !secret) throw new Error('supabase status não devolveu API_URL e SECRET_KEY');
  const email = `${nome}-${Date.now()}@viajei.local`;
  const res = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: SENHA,
      email_confirm: true,
      user_metadata: { name: nome },
    }),
  });
  if (!res.ok) throw new Error(`admin/users ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { id?: string };
  return { email, id: body.id ?? '' };
}
