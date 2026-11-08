/**
 * O que nunca pode estar no client (regra 9 do prompt): o detector puro da varredura do `dist/`. Cada
 * achado diz o tipo e onde, nunca o valor (o log da CI é público para quem vê o repositório).
 */
export type SecretKind =
  | 'chave secreta do Supabase'
  | 'chave da Anthropic'
  | 'JWT com service_role'
  | 'chave privada (PKCS#8)'
  | 'chave privada (JWK)'
  | 'chave do OpenRouteService';

export type SecretHit = { kind: SecretKind; index: number };

const B64URL = '[A-Za-z0-9_-]';

/** Prefixo DER de uma chave privada P-256 em PKCS#8, em base64 e base64url: o formato da VAPID_PRIVATE_KEY (D39). */
const PKCS8_P256 = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg';
/** As chaves do ORS: o hexadecimal clássico e o formato novo da HeiGIT (base64 de `{"org":"5b3ce…`). */
const ORS_ORG = '5b3ce3597851110001cf6248';
const ORS_B64 = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgi';

const PATTERNS: readonly { kind: SecretKind; re: RegExp }[] = [
  { kind: 'chave secreta do Supabase', re: new RegExp(`sb_secret_${B64URL}{16,}`, 'g') },
  { kind: 'chave da Anthropic', re: new RegExp(`sk-ant-${B64URL}{16,}`, 'g') },
  {
    kind: 'chave privada (PKCS#8)',
    re: new RegExp(`${PKCS8_P256}|-----BEGIN [A-Z ]*PRIVATE KEY-----`, 'g'),
  },
  { kind: 'chave do OpenRouteService', re: new RegExp(`${ORS_ORG}[0-9a-f]{32}|${ORS_B64}`, 'g') },
];

const JWT = new RegExp(`eyJ${B64URL}{8,}\\.(eyJ${B64URL}{8,})\\.${B64URL}{16,}`, 'g');
/** um JWK com o componente privado `d` (43 caracteres em P-256), com aspas ou não, perto do `kty` */
const JWK_D = new RegExp(`kty["']?\\s*:[^}]{0,300}?\\bd["']?\\s*:\\s*["']${B64URL}{43}["']`, 'g');

function decodePayload(part: string): unknown {
  try {
    const b64 = part.replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

/** Os segredos num texto. A publishable key, a VAPID pública e o JWT `anon` não são segredo. */
export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ kind, index: m.index });
  }
  for (const m of text.matchAll(JWT)) {
    const payload = decodePayload(m[1] ?? '');
    if (
      payload &&
      typeof payload === 'object' &&
      'role' in payload &&
      payload.role === 'service_role'
    ) {
      hits.push({ kind: 'JWT com service_role', index: m.index });
    }
  }
  for (const m of text.matchAll(JWK_D)) hits.push({ kind: 'chave privada (JWK)', index: m.index });
  return hits.sort((a, b) => a.index - b.index);
}
