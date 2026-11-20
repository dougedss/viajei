import { describe, expect, it } from 'vitest';
import { BRASILAPI_CNPJ_URL, lookupCnpj, memoryCnpjCache, tidyName } from './cnpj.ts';

const CNPJ = '19131243000197';

function fakeFetch(responses: Record<string, Response | Error>) {
  const calls: string[] = [];
  const f: typeof fetch = (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const r = responses[url];
    if (!r) return Promise.resolve(new Response('{"message":"não encontrado"}', { status: 404 }));
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve(r);
  };
  return { fetch: f, calls };
}

describe('lookupCnpj', () => {
  it('uma consulta por CNPJ: o nome fantasia (ou a razão social) arrumado, a cidade e a UF, e o cache guarda', async () => {
    const net = fakeFetch({
      [`${BRASILAPI_CNPJ_URL}${CNPJ}`]: new Response(
        JSON.stringify({
          razao_social: 'OPEN KNOWLEDGE BRASIL',
          nome_fantasia: 'POSTO DA SERRA',
          municipio: 'SAO PAULO',
          uf: 'SP',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    });
    const cache = memoryCnpjCache();
    const now = () => Date.parse('2026-12-12T18:00:00Z');
    const first = await lookupCnpj('19.131.243/0001-97', { fetch: net.fetch, cache, now });
    expect(first).toEqual({
      cnpj: CNPJ,
      name: 'Posto da Serra',
      city: 'Sao Paulo',
      uf: 'SP',
      fetched_at: '2026-12-12T18:00:00.000Z',
    });
    const second = await lookupCnpj(CNPJ, { fetch: net.fetch, cache, now });
    expect(second).toEqual(first);
    expect(net.calls).toHaveLength(1);
    expect(cache.size()).toBe(1);
  });

  it('sem nome fantasia, a razão social', async () => {
    const net = fakeFetch({
      [`${BRASILAPI_CNPJ_URL}${CNPJ}`]: new Response(
        JSON.stringify({ razao_social: 'AUTO POSTO SERRA GAUCHA LTDA', nome_fantasia: '' }),
        { status: 200 },
      ),
    });
    const got = await lookupCnpj(CNPJ, { fetch: net.fetch, cache: memoryCnpjCache() });
    expect(got?.name).toBe('Auto Posto Serra Gaucha Ltda');
    expect(got?.city).toBeNull();
  });

  it('CNPJ inválido não vai à rede; 404, rede caída e resposta estranha viram null, sem cache', async () => {
    const net = fakeFetch({ [`${BRASILAPI_CNPJ_URL}11111111000191`]: new Error('rede') });
    const cache = memoryCnpjCache();
    expect(await lookupCnpj('123', { fetch: net.fetch, cache })).toBeNull();
    expect(await lookupCnpj('00000000000000', { fetch: net.fetch, cache })).toBeNull();
    expect(net.calls).toHaveLength(0);
    expect(await lookupCnpj('11111111000191', { fetch: net.fetch, cache })).toBeNull();
    expect(await lookupCnpj('19131243000197', { fetch: net.fetch, cache })).toBeNull();
    expect(cache.size()).toBe(0);
  });
});

describe('tidyName', () => {
  it('maiúsculas da Receita viram nome de gente, com preposições e siglas no lugar', () => {
    expect(tidyName('POSTO  DA SERRA LTDA')).toBe('Posto da Serra Ltda');
    expect(tidyName('BR PETROBRAS S.A.')).toBe('BR Petrobras S.A.');
    expect(tidyName('CAFE DO MERCADO E CIA')).toBe('Cafe do Mercado e Cia');
  });
});
