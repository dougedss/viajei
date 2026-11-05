import { fromBase64Url, toBase64Url } from '../../supabase/functions/_shared/vapid.ts';

/**
 * O lado do aparelho no Web Push: gerar as chaves de uma assinatura (P-256 + segredo de 16 bytes)
 * e decifrar a mensagem `aes128gcm` que chega (RFC 8291 sobre a RFC 8188). É o que o navegador faz
 * antes de entregar o `push` ao service worker; o laboratório faz igual para ler o que o servidor
 * mandou. Só SubtleCrypto. Conferido com os valores do Apêndice A da RFC 8291.
 */
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const HMAC = { name: 'HMAC', hash: 'SHA-256' } as const;
const encoder = new TextEncoder();

export type SubscriptionKeys = {
  privateKey: CryptoKey;
  /** ponto público raw (65 bytes): vai como `p256dh` */
  publicRaw: Uint8Array<ArrayBuffer>;
  /** 16 bytes: vai como `auth` */
  authSecret: Uint8Array<ArrayBuffer>;
};

export async function generateSubscriptionKeys(): Promise<SubscriptionKeys> {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return { privateKey: pair.privateKey, publicRaw, authSecret };
}

/** As chaves de uma assinatura conhecida (d, ponto público, auth), para os vetores da RFC. */
export async function importSubscriptionKeys(
  d: string,
  publicRaw: string,
  authSecret: string,
): Promise<SubscriptionKeys> {
  const pub = fromBase64Url(publicRaw);
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d,
      x: toBase64Url(pub.slice(1, 33)),
      y: toBase64Url(pub.slice(33, 65)),
    },
    ECDH,
    false,
    ['deriveBits'],
  );
  return { privateKey, publicRaw: pub, authSecret: fromBase64Url(authSecret) };
}

export function subscriptionJson(endpoint: string, keys: SubscriptionKeys) {
  return {
    endpoint,
    keys: { p256dh: toBase64Url(keys.publicRaw), auth: toBase64Url(keys.authSecret) },
  };
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey('raw', key, HMAC, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ONE = Uint8Array.of(1);

export class DecryptError extends Error {}

/** Decifra uma mensagem Web Push `aes128gcm` de um só registro (o caso de toda mensagem push). */
export async function decryptWebPush(
  body: Uint8Array,
  keys: SubscriptionKeys,
): Promise<Uint8Array> {
  if (body.length < 21) throw new DecryptError('corpo menor que o cabeçalho aes128gcm');
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  const idlen = body[20] ?? 0;
  if (idlen !== 65) throw new DecryptError(`keyid com ${idlen} bytes; esperado o ponto P-256 (65)`);
  const asPublic = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  if (ciphertext.length > rs)
    throw new DecryptError('mais de um registro: não é uma mensagem push');

  const asKey = await crypto.subtle.importKey('raw', asPublic, ECDH, false, []);
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, keys.privateKey, 256),
  );
  const prkKey = await hmac(keys.authSecret, ecdh);
  const keyInfo = concat(encoder.encode('WebPush: info\0'), keys.publicRaw, asPublic);
  const ikm = await hmac(prkKey, concat(keyInfo, ONE));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(encoder.encode('Content-Encoding: aes128gcm\0'), ONE))).slice(
    0,
    16,
  );
  const nonce = (await hmac(prk, concat(encoder.encode('Content-Encoding: nonce\0'), ONE))).slice(
    0,
    12,
  );

  let plain: Uint8Array;
  try {
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    plain = new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext),
    );
  } catch {
    throw new DecryptError('AES-GCM recusou: chave, salt ou corpo não batem');
  }
  // padding: zeros à direita e o delimitador 0x02 do último registro
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (end < 0 || plain[end] !== 0x02) throw new DecryptError('sem o delimitador 0x02 do registro');
  return plain.slice(0, end);
}
