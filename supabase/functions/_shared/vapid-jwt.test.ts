import { describe, expect, it } from 'vitest';
import { exportPublicKeyRaw, generateVapidKeyPair } from './vapid.ts';
import { parseVapidHeader, signVapidJwt, verifyVapidAuthorization } from './vapid-jwt.ts';

const AUD = 'https://iihwideuknnrpvtczxjs.supabase.co';
const NOW = Date.parse('2026-12-11T09:45:00Z');
const claims = (over = {}) => ({
  aud: AUD,
  exp: Math.floor(NOW / 1000) + 3600,
  sub: 'mailto:lab@viajei.invalid',
  ...over,
});

async function header(over = {}) {
  const pair = await generateVapidKeyPair();
  const k = await exportPublicKeyRaw(pair.publicKey);
  const t = await signVapidJwt(pair.privateKey, claims(over));
  return { value: `vapid t=${t}, k=${k}`, k, t, pair };
}

describe('VAPID do lado de quem recebe (RFC 8292)', () => {
  it('lê o cabeçalho vapid t=…, k=…', () => {
    expect(parseVapidHeader('vapid t=a.b.c, k=XYZ')).toEqual({ t: 'a.b.c', k: 'XYZ' });
    expect(parseVapidHeader('Bearer x')).toBeNull();
    expect(parseVapidHeader(null)).toBeNull();
  });

  it('aceita o que a nossa chave assinou para esta origem', async () => {
    const h = await header();
    const v = await verifyVapidAuthorization(h.value, { publicKey: h.k, audience: AUD, now: NOW });
    expect(v).toEqual({ ok: true, claims: claims() });
  });

  it('recusa outra chave, outra origem, exp vencido ou longe demais, sub inválido', async () => {
    const h = await header();
    const other = await exportPublicKeyRaw((await generateVapidKeyPair()).publicKey);
    const opts = { publicKey: h.k, audience: AUD, now: NOW };
    expect((await verifyVapidAuthorization(h.value, { ...opts, publicKey: other })).ok).toBe(false);
    expect(
      (await verifyVapidAuthorization(h.value, { ...opts, audience: 'https://x.dev' })).ok,
    ).toBe(false);
    expect((await verifyVapidAuthorization(h.value, { ...opts, now: NOW + 2 * 3600_000 })).ok).toBe(
      false,
    );
    const far = await header({ exp: Math.floor(NOW / 1000) + 30 * 3600 });
    expect(await verifyVapidAuthorization(far.value, { ...opts, publicKey: far.k })).toMatchObject({
      ok: false,
      error: 'exp a mais de 24 h',
    });
    const badSub = await header({ sub: 'lab@viajei.invalid' });
    expect(
      (await verifyVapidAuthorization(badSub.value, { ...opts, publicKey: badSub.k })).ok,
    ).toBe(false);
  });

  it('recusa assinatura adulterada', async () => {
    const h = await header();
    const [a, , s] = h.t.split('.');
    const forged = `${a}.${btoa(JSON.stringify(claims({ aud: 'https://evil.dev' })))}.${s}`;
    const v = await verifyVapidAuthorization(`vapid t=${forged}, k=${h.k}`, {
      publicKey: h.k,
      audience: 'https://evil.dev',
      now: NOW,
    });
    expect(v).toMatchObject({ ok: false, error: 'assinatura ES256 inválida' });
  });
});
