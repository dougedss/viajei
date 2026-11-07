import { createHash, randomUUID } from 'node:crypto';

/** UUID v5 (SHA-1), igual ao `uuid_generate_v5` do Postgres e ao `uuidV5` do app. */
export function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(ns).update(name, 'utf8').digest();
  const b = hash.subarray(0, 16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x50;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export const uuidV4 = (): string => randomUUID();
