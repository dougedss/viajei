import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { constantTimeEqual, signSvix, svixHeaders, verifySvix } from './svix.ts';

/** O segredo do exemplo da documentação do svix (um valor de teste, não um segredo de verdade). */
const SECRET = 'whsec_plJ3nmyCDGBKInavdOK15jsl';
const ID = 'msg_loFOjxBNrRLzqYUf';
const TS = '1731705121';
const NOW = Number(TS) * 1000;
const BODY = '{"type":"email.received","data":{"email_id":"abc"}}';

describe('verifySvix', () => {
  it('a assinatura bate com um HMAC-SHA256 feito à parte, sobre id.timestamp.corpo, com a chave depois de whsec_', async () => {
    const key = Buffer.from(SECRET.split('_')[1] ?? '', 'base64');
    const expected = createHmac('sha256', key).update(`${ID}.${TS}.${BODY}`).digest('base64');
    expect(await signSvix(BODY, ID, TS, SECRET)).toBe(`v1,${expected}`);
    expect(
      await verifySvix(BODY, { id: ID, timestamp: TS, signature: `v1,${expected}` }, SECRET, NOW),
    ).toEqual({ ok: true });
  });

  it('aceita a lista de assinaturas separadas por espaço (uma rotação de segredo) e ignora as de outra versão', async () => {
    const sig = await signSvix(BODY, ID, TS, SECRET);
    const list = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= v2,xyz ${sig}`;
    expect(await verifySvix(BODY, { id: ID, timestamp: TS, signature: list }, SECRET, NOW)).toEqual(
      { ok: true },
    );
  });

  it('o corpo mudado, outro id, outro segredo ou cabeçalho faltando não passam', async () => {
    const sig = await signSvix(BODY, ID, TS, SECRET);
    const h = { id: ID, timestamp: TS, signature: sig };
    expect(await verifySvix(`${BODY} `, h, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(await verifySvix(BODY, { ...h, id: 'msg_outro' }, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(await verifySvix(BODY, h, 'whsec_b3V0cm8tc2VncmVkbw==', NOW)).toEqual({
      ok: false,
      reason: 'signature',
    });
    expect(await verifySvix(BODY, { ...h, signature: null }, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'missing',
    });
    expect(await verifySvix(BODY, h, 'whsec_%%%', NOW)).toEqual({ ok: false, reason: 'secret' });
    expect(await verifySvix(BODY, h, '', NOW)).toEqual({ ok: false, reason: 'secret' });
  });

  it('um carimbo fora da tolerância de 5 minutos (para trás ou para a frente) não passa', async () => {
    const sig = await signSvix(BODY, ID, TS, SECRET);
    const h = { id: ID, timestamp: TS, signature: sig };
    expect(await verifySvix(BODY, h, SECRET, NOW + 299_000)).toEqual({ ok: true });
    expect(await verifySvix(BODY, h, SECRET, NOW + 301_000)).toEqual({
      ok: false,
      reason: 'timestamp',
    });
    expect(await verifySvix(BODY, h, SECRET, NOW - 301_000)).toEqual({
      ok: false,
      reason: 'timestamp',
    });
    expect(await verifySvix(BODY, { ...h, timestamp: 'ontem' }, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'timestamp',
    });
  });

  it('lê os três cabeçalhos do pedido e compara em tempo constante', () => {
    const req = new Request('https://x/inbound-mail', {
      method: 'POST',
      headers: { 'svix-id': ID, 'svix-timestamp': TS, 'svix-signature': 'v1,abc' },
      body: BODY,
    });
    expect(svixHeaders(req)).toEqual({ id: ID, timestamp: TS, signature: 'v1,abc' });
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'ab')).toBe(false);
  });
});
