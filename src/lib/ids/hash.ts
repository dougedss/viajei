/**
 * FNV-1a em duas rodadas de 32 bits (64 bits em hex, 16 caracteres). Não é criptográfico: serve para
 * dizer se o que gerou um cache mudou (as coordenadas da rota, os lugares do clima).
 */
export function fnv64(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
