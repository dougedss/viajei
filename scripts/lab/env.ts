import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { toBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { previewOrigin } from './preview.ts';

/**
 * Onde o laboratório roda e com que credenciais. Produção é o alvo de verdade (o agente agendado);
 * local serve para desenvolver o próprio laboratório. Nenhuma chave secreta do Supabase entra
 * aqui: o executor entra como dois usuários de laboratório, com senhas derivadas de LAB_SECRET.
 */
export type Target = 'production' | 'local';

/** A URL e a chave publicável de produção são públicas (estão no bundle do app). */
export const PRODUCTION = {
  url: 'https://iihwideuknnrpvtczxjs.supabase.co',
  publishableKey: 'sb_publishable_SKNy-x_kWY_a8DsxXsXhFw_8R7p70wa',
  appOrigin: 'https://viajei-mauve.vercel.app',
} as const;

/** `.invalid` é reservado (RFC 2606): nenhum e-mail para eles sai do servidor. */
export const LAB_USERS = {
  a: { email: 'lab-a@viajei.invalid', name: 'Lab A' },
  b: { email: 'lab-b@viajei.invalid', name: 'Lab B' },
} as const;
export type LabUser = (typeof LAB_USERS)[keyof typeof LAB_USERS];

/** No local o segredo é fixo: o banco local é descartável. */
const LOCAL_SECRET = 'viajei-lab-local';
/** Fora do repositório, só do Douglas; o GitHub Actions recebe o mesmo valor como secret. */
export const SECRET_FILE = join(homedir(), '.config', 'viajei', 'lab-secret');
/** Da edge-runtime local (um container), a API do host responde por host.docker.internal. */
const LOCAL_RECEIVER_ORIGIN = 'http://host.docker.internal:54321';

export type LabConfig = {
  target: Target;
  url: string;
  publishableKey: string;
  /** base dos endpoints das assinaturas de laboratório, como o send-notifications os vê */
  receiverBase: string;
  receiverOrigin: string;
  /** a mesma função vista daqui, para conferir que está no ar */
  receiverProbe: string;
  /** a origem do app que "assinou": o navigate dos avisos volta para ela */
  appOrigin: string;
  secret: string;
  /** o segredo do bypass da Vercel, só quando o alvo é o preview de uma branch */
  bypass: string | null;
};

export function parseTarget(argv: readonly string[]): Target {
  const i = argv.indexOf('--target');
  const value = i >= 0 ? argv[i + 1] : (process.env.LAB_TARGET ?? 'production');
  if (value !== 'production' && value !== 'local') {
    throw new Error(`--target ${value ?? '(vazio)'}: use production ou local`);
  }
  return value;
}

export function argValues(argv: readonly string[], flag: string): string[] {
  return argv.flatMap((a, i) => {
    const value = argv[i + 1];
    return a === flag && value ? [value] : [];
  });
}

/** `supabase status -o env` do stack local. */
export function localStatus(): Map<string, string> {
  const out = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = new Map<string, string>();
  for (const line of out.split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) env.set(m[1], m[2].replace(/^"(.*)"$/, '$1'));
  }
  return env;
}

async function readSecretFile(): Promise<string | null> {
  try {
    const text = (await readFile(SECRET_FILE, 'utf8')).trim();
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

/** LAB_SECRET de produção: variável de ambiente (GitHub Actions) ou o arquivo deste Mac. */
export async function productionSecret(options: { create: boolean }): Promise<string> {
  const fromEnv = process.env.LAB_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = await readSecretFile();
  if (fromFile) return fromFile;
  if (!options.create) {
    throw new Error(
      `LAB_SECRET não definido e ${SECRET_FILE} não existe. Rode pnpm lab:setup --target production.`,
    );
  }
  const secret = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  await mkdir(dirname(SECRET_FILE), { recursive: true, mode: 0o700 });
  await writeFile(SECRET_FILE, `${secret}\n`, { mode: 0o600 });
  await chmod(SECRET_FILE, 0o600);
  return secret;
}

/** A senha de um usuário de laboratório: HMAC(LAB_SECRET, e-mail). Um segredo só, nada guardado. */
export async function derivePassword(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`viajei-lab:${email}`),
  );
  return toBase64Url(new Uint8Array(mac));
}

export async function loadConfig(
  target: Target,
  options: { createSecret?: boolean } = {},
): Promise<LabConfig> {
  if (target === 'local') {
    const status = localStatus();
    const url = status.get('API_URL');
    const publishableKey = status.get('PUBLISHABLE_KEY');
    if (!url || !publishableKey) throw new Error('Supabase local fora do ar: pnpm db:start');
    return {
      target,
      url,
      publishableKey,
      receiverBase: `${LOCAL_RECEIVER_ORIGIN}/functions/v1/push-receiver`,
      receiverOrigin: LOCAL_RECEIVER_ORIGIN,
      receiverProbe: `${url}/functions/v1/push-receiver`,
      appOrigin: 'http://localhost:4173',
      secret: LOCAL_SECRET,
      bypass: null,
    };
  }
  const app = appTarget();
  const url = process.env.LAB_SUPABASE_URL ?? PRODUCTION.url;
  const receiverBase = `${url}/functions/v1/push-receiver`;
  return {
    target,
    url,
    publishableKey: process.env.LAB_PUBLISHABLE_KEY ?? PRODUCTION.publishableKey,
    receiverBase,
    receiverOrigin: new URL(url).origin,
    receiverProbe: receiverBase,
    appOrigin: app.origin,
    secret: await productionSecret({ create: options.createSecret ?? false }),
    bypass: app.bypass,
  };
}

/**
 * Qual app o navegador abre: a produção (padrão) ou, com `LAB_ALVO=preview`, o preview da branch
 * (`LAB_BRANCH` ou a do GitHub Actions), que fica atrás do login da Vercel e só abre com o segredo do
 * "Protection Bypass for Automation" (`VERCEL_AUTOMATION_BYPASS_SECRET`). O banco é o mesmo da
 * produção. O segredo nunca é impresso.
 */
function appTarget(): { origin: string; bypass: string | null } {
  // vazio conta como ausente (o formulário do GitHub manda string vazia no agendamento)
  const env = (name: string) => {
    const value = process.env[name]?.trim();
    return value === '' ? undefined : value;
  };
  const alvo = env('LAB_ALVO') ?? 'producao';
  if (alvo === 'producao') {
    return { origin: process.env.LAB_APP_ORIGIN ?? PRODUCTION.appOrigin, bypass: null };
  }
  if (alvo !== 'preview') throw new Error(`LAB_ALVO=${alvo}: use producao ou preview`);
  const bypass = env('VERCEL_AUTOMATION_BYPASS_SECRET');
  if (!bypass) {
    throw new Error(
      'O preview fica atrás do login da Vercel: grave o secret VERCEL_AUTOMATION_BYPASS_SECRET no ' +
        'repositório (Vercel → Settings → Deployment Protection → Protection Bypass for Automation).',
    );
  }
  const branch = env('LAB_BRANCH') ?? env('GITHUB_REF_NAME') ?? '';
  return { origin: previewOrigin(branch), bypass };
}
