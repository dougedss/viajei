import { describe, expect, it } from 'vitest';
import {
  exportPrivateKeyPkcs8,
  exportPublicKeyRaw,
  fromBase64Url,
  generateVapidKeyPair,
  jwkFromRawPublicKey,
  publicKeyFromPkcs8,
  rawPublicKeyFromJwk,
  toBase64Url,
  vapidJwkFromPkcs8,
} from './vapid.ts';

describe('chaves VAPID', () => {
  it('base64url vai e volta sem padding', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
  });

  it('a pública derivada da PKCS#8 é o mesmo ponto raw que o client recebe', async () => {
    const pair = await generateVapidKeyPair();
    const pkcs8 = await exportPrivateKeyPkcs8(pair.privateKey);
    const raw = await exportPublicKeyRaw(pair.publicKey);
    expect(fromBase64Url(raw)).toHaveLength(65);
    expect(await publicKeyFromPkcs8(pkcs8)).toBe(raw);
  });

  it('raw ↔ JWK: o ponto volta igual e o JWK privado assina o que a pública raw verifica', async () => {
    const pair = await generateVapidKeyPair();
    const raw = await exportPublicKeyRaw(pair.publicKey);
    const jwk = jwkFromRawPublicKey(raw);
    expect(rawPublicKeyFromJwk(jwk)).toBe(raw);

    const { privateKey, publicKey } = await vapidJwkFromPkcs8(
      await exportPrivateKeyPkcs8(pair.privateKey),
    );
    expect(publicKey).toEqual(jwk);
    expect(privateKey.d).toBeDefined();
    const alg = { name: 'ECDSA', namedCurve: 'P-256' } as const;
    const signer = await crypto.subtle.importKey('jwk', privateKey, alg, false, ['sign']);
    const verifier = await crypto.subtle.importKey('raw', fromBase64Url(raw), alg, false, [
      'verify',
    ]);
    const data = new TextEncoder().encode('viajei');
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer, data);
    expect(
      await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifier, sig, data),
    ).toBe(true);
  });

  it('recusa chave fora do formato', () => {
    expect(() => jwkFromRawPublicKey(toBase64Url(new Uint8Array(10)))).toThrow();
    expect(() => rawPublicKeyFromJwk({ kty: 'EC' })).toThrow();
  });
});
