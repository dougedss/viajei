import { spawnSync } from 'node:child_process';
import { labClient, signIn } from './client.ts';
import { derivePassword, LAB_USERS, localStatus, type LabConfig } from './env.ts';

/**
 * Preparo do laboratório num ambiente: os dois usuários de laboratório (criados pela Admin API,
 * já confirmados, com a senha derivada de LAB_SECRET) e os acessos em `private.lab_access`
 * (executores e quem vê o painel). Usa a chave secreta só aqui, uma vez; o executor nunca a vê.
 */
export async function ensureLabUsers(
  cfg: LabConfig,
  secretKey: string,
  viewers: readonly string[],
): Promise<string[]> {
  const admin = labClient(cfg, secretKey);
  const lines: string[] = [];
  for (const user of Object.values(LAB_USERS)) {
    try {
      await signIn(cfg, user);
      lines.push(`${user.email}: já existe`);
      continue;
    } catch {
      // não entrou: cria
    }
    const { error } = await admin.auth.admin.createUser({
      email: user.email,
      password: await derivePassword(cfg.secret, user.email),
      email_confirm: true,
      user_metadata: { name: user.name },
    });
    if (error) {
      throw new Error(
        `${user.email}: ${error.message}. Se ele já existe com outra senha, apague-o no painel do Supabase e rode de novo.`,
      );
    }
    lines.push(`${user.email}: criado`);
  }
  const grants: [string, 'runner' | 'viewer'][] = [
    ...Object.values(LAB_USERS).map((u): [string, 'runner'] => [u.email, 'runner']),
    ...viewers.map((v): [string, 'viewer'] => [v, 'viewer']),
  ];
  for (const [email, role] of grants) {
    const { error } = await admin.rpc('lab_grant', { p_email: email, p_role: role });
    if (error) throw new Error(`lab_grant ${email}: ${error.message}`);
    lines.push(`${email}: ${role === 'runner' ? 'executor' : 'vê o painel'}`);
  }
  return lines;
}

/**
 * Só no banco LOCAL: a edge-runtime alcança o receptor por http://host.docker.internal, e o
 * `check` de `push_subscriptions.endpoint` exige https (como deve ser em produção). O laboratório
 * local troca esse check por um que aceita http. `pnpm db:reset` devolve o original.
 */
export function loosenLocalEndpointCheck(): void {
  const sql = [
    'alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;',
    'alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check_local;',
    "alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check_local check (endpoint ~ '^https?://');",
    '',
  ].join('\n');
  const psql = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_viajei',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8' },
  );
  if (psql.status !== 0) throw new Error(`check local: ${psql.stderr || psql.stdout}`);
}

export async function ensureLocalLab(cfg: LabConfig): Promise<string[]> {
  if (cfg.target !== 'local') throw new Error('ensureLocalLab só no alvo local');
  const secretKey = localStatus().get('SECRET_KEY');
  if (!secretKey) throw new Error('supabase status não devolveu SECRET_KEY');
  const lines = await ensureLabUsers(cfg, secretKey, ['dono@viajei.local']);
  loosenLocalEndpointCheck();
  lines.push('check de endpoint local aceita http (pnpm db:reset devolve o original)');
  return lines;
}

/**
 * O receptor está no ar? Um POST para um endpoint desconhecido tem de voltar 404, como num push
 * service de verdade. Qualquer outra coisa (rede, 5xx) para o laboratório antes de mexer em dados.
 */
export async function probeReceiver(cfg: LabConfig): Promise<void> {
  const hint =
    cfg.target === 'local'
      ? 'Suba as funções: pnpm functions:serve -- --env-file <arquivo com VAPID_PRIVATE_KEY e VAPID_SUBJECT>.'
      : 'Publique a função: pnpm remote:functions-deploy.';
  let status: number;
  try {
    const res = await fetch(`${cfg.receiverProbe}/00000000-0000-4000-8000-000000000000`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });
    status = res.status;
    await res.body?.cancel();
  } catch (err) {
    throw new Error(
      `o receptor não respondeu (${err instanceof Error ? err.message : String(err)}). ${hint}`,
      { cause: err },
    );
  }
  if (status !== 404) throw new Error(`o receptor respondeu ${status} em vez de 404. ${hint}`);
}
