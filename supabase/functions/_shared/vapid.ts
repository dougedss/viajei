/**
 * Chaves VAPID (RFC 8292), nos formatos que cada lado consome. O par é P-256, gerado uma vez e
 * nunca trocado (trocar invalida todas as assinaturas). Só SubtleCrypto: roda igual no Node 22 do
 * script `vapid:generate`, no Vitest e no Deno da Edge Function.
 *
 * - `VITE_VAPID_PUBLIC_KEY`: o ponto público raw (65 bytes, base64url), o `applicationServerKey`
 *   que o navegador exige na assinatura.
 * - `VAPID_PRIVATE_KEY`: a chave privada em PKCS#8 (base64url). É o formato padrão de chave privada
 *   e carrega o ponto público dentro, então o servidor deriva tudo de uma variável só.
 *
 * Os tipos são estruturais (não `JsonWebKey`/`CryptoKeyPair` da lib DOM) porque este arquivo é
 * compilado também pelo tsconfig do Node, que não tem a lib DOM.
 */
const P256 = { name: 'ECDSA', namedCurve: 'P-256' } as const;

/** Uma chave JWK EC, só o que usamos. */
export type Jwk = {
  kty: string;
  crv: string;
  x: string;
  y: string;
  d?: string;
};
export type VapidJwkPair = { publicKey: Jwk; privateKey: Jwk };
export type KeyPair = { publicKey: CryptoKey; privateKey: CryptoKey };

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateVapidKeyPair(subtle: SubtleCrypto = crypto.subtle): Promise<KeyPair> {
  return await subtle.generateKey(P256, true, ['sign', 'verify']);
}

/** A chave privada como `VAPID_PRIVATE_KEY` (PKCS#8, base64url). */
export async function exportPrivateKeyPkcs8(
  key: CryptoKey,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle.exportKey('pkcs8', key)));
}

/** A chave pública como `VITE_VAPID_PUBLIC_KEY` (ponto raw, base64url). */
export async function exportPublicKeyRaw(
  key: CryptoKey,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  return toBase64Url(new Uint8Array(await subtle.exportKey('raw', key)));
}

/** PKCS#8 → par JWK (a pública sem `d`), o formato que `importVapidKeys` do @negrel/webpush consome. */
export async function vapidJwkFromPkcs8(
  pkcs8: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<VapidJwkPair> {
  const key = await subtle.importKey('pkcs8', fromBase64Url(pkcs8), P256, true, ['sign']);
  const jwk = (await subtle.exportKey('jwk', key)) as Partial<Jwk>;
  if (!jwk.x || !jwk.y || !jwk.d) throw new Error('chave VAPID sem x, y ou d');
  const publicKey: Jwk = { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
  return { publicKey, privateKey: { ...publicKey, d: jwk.d } };
}

/** JWK pública → ponto raw `0x04 ‖ x ‖ y` em base64url (65 bytes). */
export function rawPublicKeyFromJwk(jwk: Partial<Jwk>): string {
  if (!jwk.x || !jwk.y) throw new Error('JWK sem x e y');
  const x = fromBase64Url(jwk.x);
  const y = fromBase64Url(jwk.y);
  if (x.length !== 32 || y.length !== 32) throw new Error('coordenadas fora de P-256');
  const out = new Uint8Array(65);
  out[0] = 0x04;
  out.set(x, 1);
  out.set(y, 33);
  return toBase64Url(out);
}

/** O inverso: ponto raw → JWK pública. */
export function jwkFromRawPublicKey(raw: string): Jwk {
  const bytes = fromBase64Url(raw);
  if (bytes.length !== 65 || bytes[0] !== 0x04) {
    throw new Error('ponto público fora do formato raw');
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(bytes.slice(1, 33)),
    y: toBase64Url(bytes.slice(33, 65)),
  };
}

/** A chave pública que uma `VAPID_PRIVATE_KEY` carrega: o que o client tem de usar como `applicationServerKey`. */
export async function publicKeyFromPkcs8(
  pkcs8: string,
  subtle: SubtleCrypto = crypto.subtle,
): Promise<string> {
  return rawPublicKeyFromJwk((await vapidJwkFromPkcs8(pkcs8, subtle)).publicKey);
}
