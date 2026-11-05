import { fromBase64Url, toBase64Url } from './vapid.ts';

/**
 * O lado de quem recebe um Web Push: conferir o cabeçalho `Authorization: vapid t=<jwt>, k=<chave>`
 * como um push service faria (RFC 8292). O receptor de laboratório usa isto para só aceitar o que o
 * nosso servidor assinou e, de quebra, provar que o VAPID de produção está certo. A assinatura
 * (`signVapidJwt`) existe para os testes. Só SubtleCrypto: roda no Deno, no Node e no Vitest.
 */
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;
/** A RFC 8292 manda recusar `exp` a mais de 24 h; um minuto de folga para relógios. */
const MAX_EXP_S = 24 * 60 * 60 + 60;

export type VapidClaims = { aud: string; exp: number; sub: string };

export type VapidVerdict =
  | { ok: true; claims: VapidClaims }
  | { ok: false; error: string; claims: Partial<VapidClaims> | null };

const encoder = new TextEncoder();

function decodeJson(part: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(part)));
  } catch {
    return null;
  }
}

/** `vapid t=…, k=…` → `{ t, k }`; null fora desse formato. */
export function parseVapidHeader(header: string | null): { t: string; k: string } | null {
  if (!header) return null;
  const m = /^vapid\s+(.+)$/i.exec(header.trim());
  if (!m?.[1]) return null;
  const params = new Map<string, string>();
  for (const part of m[1].split(',')) {
    const eq = part.indexOf('=');
    if (eq > 0) params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  const t = params.get('t');
  const k = params.get('k');
  return t && k ? { t, k } : null;
}

function readClaims(value: unknown): Partial<VapidClaims> | null {
  if (typeof value !== 'object' || value === null) return null;
  const c = value as Record<string, unknown>;
  return {
    ...(typeof c.aud === 'string' ? { aud: c.aud } : {}),
    ...(typeof c.exp === 'number' ? { exp: c.exp } : {}),
    ...(typeof c.sub === 'string' ? { sub: c.sub } : {}),
  };
}

export type VerifyOptions = {
  /** a nossa chave pública VAPID (raw, base64url): só ela é aceita */
  publicKey: string;
  /** a origem do endpoint que recebeu o POST */
  audience: string;
  /** epoch em ms */
  now: number;
};

export async function verifyVapidAuthorization(
  header: string | null,
  { publicKey, audience, now }: VerifyOptions,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<VapidVerdict> {
  const parsed = parseVapidHeader(header);
  if (!parsed) return { ok: false, error: 'sem cabeçalho vapid t=…, k=…', claims: null };
  if (parsed.k !== publicKey) {
    return { ok: false, error: 'k não é a nossa chave pública VAPID', claims: null };
  }
  const parts = parsed.t.split('.');
  const [h, p, s] = parts;
  if (parts.length !== 3 || !h || !p || !s) {
    return { ok: false, error: 'JWT malformado', claims: null };
  }
  const head = decodeJson(h) as { alg?: unknown; typ?: unknown } | null;
  const claims = readClaims(decodeJson(p));
  if (head?.alg !== 'ES256') return { ok: false, error: 'alg não é ES256', claims };

  let valid = false;
  try {
    const key = await subtle.importKey('raw', fromBase64Url(parsed.k), ECDSA, false, ['verify']);
    valid = await subtle.verify(SIGN, key, fromBase64Url(s), encoder.encode(`${h}.${p}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: 'assinatura ES256 inválida', claims };

  if (!claims?.aud || claims.aud !== audience) {
    return { ok: false, error: `aud ${claims?.aud ?? '(vazio)'} ≠ ${audience}`, claims };
  }
  const nowS = Math.floor(now / 1000);
  if (claims.exp === undefined || claims.exp <= nowS) {
    return { ok: false, error: 'exp vencido ou ausente', claims };
  }
  if (claims.exp - nowS > MAX_EXP_S) return { ok: false, error: 'exp a mais de 24 h', claims };
  if (!claims.sub || !/^(mailto:|https:)/.test(claims.sub)) {
    return { ok: false, error: 'sub não é mailto: nem https:', claims };
  }
  return { ok: true, claims: { aud: claims.aud, exp: claims.exp, sub: claims.sub } };
}

/** Assina um JWT VAPID (ES256). Para os testes do receptor; o servidor usa o @negrel/webpush. */
export async function signVapidJwt(
  privateKey: CryptoKey,
  claims: VapidClaims,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  const h = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const p = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await subtle.sign(SIGN, privateKey, encoder.encode(`${h}.${p}`)));
  return `${h}.${p}.${toBase64Url(sig)}`;
}
