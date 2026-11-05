import { describe, expect, it } from 'vitest';
import { fromBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { DecryptError, decryptWebPush, importSubscriptionKeys } from './webpush-decrypt.ts';

// RFC 8291, Apêndice A (os espaços dos valores da RFC removidos)
const UA_PRIVATE = 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94';
const UA_PUBLIC =
  'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
const AUTH = 'BTBZMqHH6r4Tts7J_aSIgg';
const HEADER =
  'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const CIPHERTEXT = '8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ';

function message(): Uint8Array {
  const h = fromBase64Url(HEADER);
  const c = fromBase64Url(CIPHERTEXT);
  const out = new Uint8Array(h.length + c.length);
  out.set(h, 0);
  out.set(c, h.length);
  return out;
}

describe('Web Push do lado do aparelho (RFC 8291)', () => {
  it('decifra o exemplo do Apêndice A', async () => {
    const keys = await importSubscriptionKeys(UA_PRIVATE, UA_PUBLIC, AUTH);
    const plain = await decryptWebPush(message(), keys);
    expect(new TextDecoder().decode(plain)).toBe('When I grow up, I want to be a watermelon');
  });

  it('recusa com outro segredo de autenticação', async () => {
    const keys = await importSubscriptionKeys(UA_PRIVATE, UA_PUBLIC, 'AAAAAAAAAAAAAAAAAAAAAA');
    await expect(decryptWebPush(message(), keys)).rejects.toBeInstanceOf(DecryptError);
  });

  it('recusa corpo curto ou keyid fora de P-256', async () => {
    const keys = await importSubscriptionKeys(UA_PRIVATE, UA_PUBLIC, AUTH);
    await expect(decryptWebPush(new Uint8Array(10), keys)).rejects.toThrow(/cabeçalho/);
    const bad = message();
    bad[20] = 10;
    await expect(decryptWebPush(bad, keys)).rejects.toThrow(/keyid/);
  });
});
