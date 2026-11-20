/**
 * A assinatura dos webhooks do Resend (o padrão svix), conferida à mão com a WebCrypto, sem o SDK do
 * Resend nem a biblioteca do svix (uma dependência a menos nas funções). Conferido em 20/11/2026 em
 * docs.svix.com ("Verifying Webhooks Manually"): o conteúdo assinado é `${svix-id}.${svix-timestamp}.
 * ${corpo bruto}`; a chave é o que vem depois de `whsec_`, em base64; HMAC-SHA256, em base64, no
 * cabeçalho `svix-signature` como uma lista separada por espaços de `v1,<assinatura>`; a tolerância
 * recomendada para o `svix-timestamp` é de 5 minutos; a comparação é em tempo constante.
 */
export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type SvixVerdict =
  { ok: true } | { ok: false; reason: 'secret' | 'missing' | 'timestamp' | 'signature' };

/** A tolerância do carimbo de tempo, em segundos (a dos SDKs do svix). */
export const SVIX_TOLERANCE_S = 300;

export function svixHeaders(req: Request): SvixHeaders {
  return {
    id: req.headers.get('svix-id'),
    timestamp: req.headers.get('svix-timestamp'),
    signature: req.headers.get('svix-signature'),
  };
}

function keyBytes(secret: string): Uint8Array<ArrayBuffer> | null {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    const bin = atob(raw);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer): string {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function hmac(key: Uint8Array<ArrayBuffer>, content: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(content)));
}

/** Compara em tempo constante (o tamanho vaza, o conteúdo não). */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A assinatura de um corpo, como o svix a escreve (`v1,<base64>`): para os testes e o laboratório. */
export async function signSvix(
  body: string,
  id: string,
  timestamp: string,
  secret: string,
): Promise<string> {
  const key = keyBytes(secret);
  if (!key) throw new Error('segredo do webhook fora do formato');
  return `v1,${await hmac(key, `${id}.${timestamp}.${body}`)}`;
}

/** Confere o webhook: os três cabeçalhos, o carimbo dentro da tolerância e uma assinatura v1 que bate. */
export async function verifySvix(
  body: string,
  headers: SvixHeaders,
  secret: string,
  now: number = Date.now(),
  toleranceS: number = SVIX_TOLERANCE_S,
): Promise<SvixVerdict> {
  const key = keyBytes(secret);
  if (!key) return { ok: false, reason: 'secret' };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing' };
  }
  const ts = Number(headers.timestamp);
  if (!Number.isInteger(ts) || Math.abs(now / 1000 - ts) > toleranceS) {
    return { ok: false, reason: 'timestamp' };
  }
  const expected = await hmac(key, `${headers.id}.${headers.timestamp}.${body}`);
  const given = headers.signature
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3));
  return given.some((sig) => constantTimeEqual(sig, expected))
    ? { ok: true }
    : { ok: false, reason: 'signature' };
}
