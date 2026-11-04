/**
 * Ids gerados no client. v4 para linhas sem chave natural; v5 determinístico quando há uma
 * (dias, convites, memórias, conquistas, XP, missões sugeridas, trilhas): dois aparelhos sem
 * sinal geram o mesmo id e escrevem a mesma linha, em vez de colidir no `unique`. O banco
 * confere com `extensions.uuid_generate_v5(namespace, name)`, que é a RFC 4122 com SHA-1 sobre
 * os 16 bytes do namespace seguidos do nome em UTF-8. Esta implementação produz o mesmo valor.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function uuidV4(): string {
  return crypto.randomUUID();
}

function uuidToBytes(uuid: string): Uint8Array {
  if (!isUuid(uuid)) throw new Error(`uuid inválido: ${uuid}`);
  const hex = uuid.replaceAll('-', '');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** UUID v5: SHA-1(namespace ‖ name), com versão 5 e variante RFC 4122. Igual ao `uuid_generate_v5` do Postgres. */
export async function uuidV5(namespace: string, name: string): Promise<string> {
  const ns = uuidToBytes(namespace);
  const nm = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nm.length);
  input.set(ns, 0);
  input.set(nm, ns.length);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const out = hash.slice(0, 16);
  out[6] = ((out[6] ?? 0) & 0x0f) | 0x50; // versão 5
  out[8] = ((out[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  return bytesToUuid(out);
}
