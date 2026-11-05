/**
 * `pnpm lab:setup --target production [--viewer <e-mail>]… [--github]`
 * `pnpm lab:setup --target local`
 *
 * Prepara o laboratório num ambiente, uma vez: cria os dois usuários de laboratório, dá os acessos
 * (executores e quem vê o painel) e, com --github, grava LAB_SECRET nos secrets do repositório para
 * o agente agendado. Em produção, a chave secreta do projeto é lida na hora pela CLI (com o token
 * de .env.local) e fica só na memória deste processo; LAB_SECRET é gerado na primeira vez e fica em
 * ~/.config/viajei/lab-secret (0600). Nenhum valor secreto é impresso.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { argValues, loadConfig, parseTarget, SECRET_FILE } from './env.ts';
import { ensureLabUsers, ensureLocalLab, probeReceiver } from './setup-lib.ts';

const REPO = 'dougedss/viajei';
const GITHUB_ACCOUNT = 'dougedss';

/** A chave secreta default do projeto linkado, pela CLI. Procura `sb_secret_…` na resposta. */
function revealSecretKey(): string {
  const out = execFileSync('supabase', ['projects', 'api-keys', '--reveal', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const found: { name: string; key: string }[] = [];
  const walk = (value: unknown, name = '') => {
    if (typeof value === 'string' && value.startsWith('sb_secret_'))
      found.push({ name, key: value });
    else if (Array.isArray(value)) for (const v of value) walk(v, name);
    else if (typeof value === 'object' && value !== null) {
      const o = value as Record<string, unknown>;
      const own = typeof o.name === 'string' ? o.name : name;
      for (const v of Object.values(o)) walk(v, own);
    }
  };
  try {
    walk(JSON.parse(out));
  } catch {
    for (const m of out.matchAll(/sb_secret_[A-Za-z0-9_-]+/g)) found.push({ name: '', key: m[0] });
  }
  const key = (found.find((f) => f.name === 'default') ?? found[0])?.key;
  if (!key)
    throw new Error('a CLI não devolveu uma chave sb_secret_ (SUPABASE_ACCESS_TOKEN carregado?)');
  return key;
}

/** LAB_SECRET nos secrets do repositório, conferindo antes que o gh está na conta pessoal. */
function setGithubSecret(secret: string): string {
  const login = spawnSync('gh', ['api', 'user', '--jq', '.login'], {
    encoding: 'utf8',
  }).stdout.trim();
  if (login !== GITHUB_ACCOUNT) {
    throw new Error(
      `gh está como "${login}", não ${GITHUB_ACCOUNT}: rode gh auth switch -u ${GITHUB_ACCOUNT}`,
    );
  }
  const res = spawnSync('gh', ['secret', 'set', 'LAB_SECRET', '--repo', REPO], {
    input: secret,
    encoding: 'utf8',
  });
  if (res.status !== 0) throw new Error(`gh secret set: ${res.stderr}`);
  return `LAB_SECRET gravado nos secrets de ${REPO} (conta ${login})`;
}

const argv = process.argv.slice(2);
const target = parseTarget(argv);
const cfg = await loadConfig(target, { createSecret: true });
const lines: string[] = [];

if (target === 'local') {
  lines.push(...(await ensureLocalLab(cfg)));
} else {
  lines.push(...(await ensureLabUsers(cfg, revealSecretKey(), argValues(argv, '--viewer'))));
  lines.push(`LAB_SECRET em ${SECRET_FILE}`);
  if (argv.includes('--github')) lines.push(setGithubSecret(cfg.secret));
}
await probeReceiver(cfg);
lines.push(`receptor no ar: ${cfg.receiverProbe}`);
for (const l of lines) console.log(`· ${l}`);
