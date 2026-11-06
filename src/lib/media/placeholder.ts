import { rgbaToThumbHash, thumbHashToDataURL } from 'thumbhash';

/**
 * O borrão de uma foto antes de o arquivo chegar: o thumbhash (uns 25 bytes) em base64, guardado
 * em `attachments.placeholder` e sincronizado com a linha. Sai de uma redução de até 100 px.
 */
export function encodePlaceholder(width: number, height: number, rgba: Uint8ClampedArray): string {
  const hash = rgbaToThumbHash(width, height, rgba);
  let bin = '';
  for (const byte of hash) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function decode(base64: string): Uint8Array | null {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function toDataUrl(bytes: Uint8Array | null): string | null {
  if (!bytes) return null;
  try {
    return thumbHashToDataURL(bytes);
  } catch {
    return null;
  }
}

const dataUrls = new Map<string, string | null>();

/** A imagem PNG (data URL) do borrão, calculada uma vez por placeholder. */
export function placeholderUrl(base64: string | null): string | null {
  if (!base64) return null;
  const cached = dataUrls.get(base64);
  if (cached !== undefined) return cached;
  const url = toDataUrl(decode(base64));
  dataUrls.set(base64, url);
  return url;
}
