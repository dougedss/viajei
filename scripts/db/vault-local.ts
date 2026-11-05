/**
 * Vault do Supabase local: cria ou atualiza `viajei_project_url` e `viajei_secret_key`, os dois
 * segredos que o job do pg_cron lê para chamar a Edge Function `send-notifications`. No hospedado
 * eles são criados uma vez pelo painel; aqui, a cada `db:reset`, porque o reset apaga o Vault.
 *
 * Lê `supabase status -o env` (SECRET_KEY) e grava pelo psql do container do banco, com o valor
 * no stdin, nunca em argumentos. De dentro do Postgres, a API local responde em
 * host.docker.internal (Docker Desktop no macOS); o Kong encaminha /functions/v1 à edge-runtime.
 */
import { execFileSync, spawnSync } from 'node:child_process';

const PROJECT_URL = 'http://host.docker.internal:54321';
const CONTAINER = 'supabase_db_viajei';

function statusEnv(): Map<string, string> {
  const out = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  const env = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) env.set(m[1], m[2].replace(/^"(.*)"$/, '$1'));
  }
  return env;
}

/** Dollar quoting com uma etiqueta que o valor não contém: nada de escapar aspas. */
function literal(value: string): string {
  let tag = 'v';
  while (value.includes(`$${tag}$`)) tag += 'v';
  return `$${tag}$${value}$${tag}$`;
}

const env = statusEnv();
const secret = env.get('SECRET_KEY');
if (!secret) {
  console.error(
    'supabase status não devolveu SECRET_KEY. O Supabase local está rodando (pnpm db:start)?',
  );
  process.exit(1);
}

const sql = [
  `delete from vault.secrets where name in ('viajei_project_url', 'viajei_secret_key');`,
  `select vault.create_secret(${literal(PROJECT_URL)}, 'viajei_project_url');`,
  `select vault.create_secret(${literal(secret)}, 'viajei_secret_key');`,
  '',
].join('\n');

const psql = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    CONTAINER,
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
if (psql.status !== 0) {
  console.error(psql.stderr || psql.stdout);
  process.exit(psql.status ?? 1);
}
console.log(`Vault local: viajei_project_url = ${PROJECT_URL} e viajei_secret_key gravados.`);
