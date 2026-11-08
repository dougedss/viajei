import { describe, expect, it } from 'vitest';
import { findSecrets } from './secrets.ts';

// as chaves de mentira são montadas aqui, para nenhuma ficar escrita por inteiro no repositório
const fill = (n: number) => 'Ab3_x-'.repeat(Math.ceil(n / 6)).slice(0, n);
const b64url = (o: object) =>
  btoa(JSON.stringify(o)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const jwt = (payload: object) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.${fill(43)}`;

describe('findSecrets', () => {
  it('acha a chave secreta do Supabase e a da Anthropic', () => {
    const text = `const a="${'sb_' + 'secret_' + fill(30)}";const b='${'sk-' + 'ant-' + fill(90)}'`;
    expect(findSecrets(text).map((h) => h.kind)).toEqual([
      'chave secreta do Supabase',
      'chave da Anthropic',
    ]);
  });

  it('o JWT de service_role sim; o anon e a publishable não', () => {
    const text = [
      jwt({ role: 'anon', iss: 'supabase' }),
      'sb_publishable_' + fill(30),
      jwt({ role: 'service_role', iss: 'supabase' }),
    ].join(' ');
    expect(findSecrets(text).map((h) => h.kind)).toEqual(['JWT com service_role']);
  });

  it('a chave privada da VAPID em PKCS#8 e um JWK com o componente d', () => {
    const pkcs8 = 'MIGHAgEAMBMGByqGSM49' + 'AgEGCCqGSM49AwEHBG0wawIBAQQg' + fill(120);
    const jwk = `{kty:"EC",crv:"P-256",x:"${fill(43)}",y:"${fill(43)}",d:"${fill(43)}"}`;
    expect(findSecrets(`${pkcs8}\n${jwk}`).map((h) => h.kind)).toEqual([
      'chave privada (PKCS#8)',
      'chave privada (JWK)',
    ]);
  });

  it('a VAPID pública (um JWK sem d) não é segredo', () => {
    expect(findSecrets(`{kty:"EC",crv:"P-256",x:"${fill(43)}",y:"${fill(43)}"}`)).toEqual([]);
  });

  it('a chave do OpenRouteService, nos dois formatos', () => {
    const hex = '5b3ce3597851110001cf6248' + 'a'.repeat(32);
    const heigit = 'eyJvcmciOiI1YjNjZTM1OTc4' + 'NTExMTAwMDFjZjYyNDgi' + fill(40);
    expect(findSecrets(`${hex} ${heigit}`).map((h) => h.kind)).toEqual([
      'chave do OpenRouteService',
      'chave do OpenRouteService',
    ]);
  });

  it('código comum não dispara', () => {
    expect(findSecrets('function d(a){return{kty:a,d:1}} const sk="sk-antes"')).toEqual([]);
  });
});
