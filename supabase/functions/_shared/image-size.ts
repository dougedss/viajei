/**
 * As medidas de uma imagem pelos cabeçalhos, sem decodificar (fase 18): a função de recebimento grava
 * o anexo de um e-mail em `attachments`, cujo `check` exige largura e altura numa imagem; no Deno não
 * há canvas. JPEG (o marcador SOF), PNG (o IHDR) e WebP (VP8, VP8L e VP8X). Null quando não dá para
 * ler: o anexo então não entra como imagem.
 */
export type ImageSize = { width: number; height: number };

function pngSize(b: Uint8Array): ImageSize | null {
  if (b.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!sig.every((v, i) => b[i] === v)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(...b.subarray(12, 16)) !== 'IHDR') return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(b: Uint8Array): ImageSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    // marcadores sem tamanho (padding e os RSTn)
    if (marker === 0xff || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += marker === 0xff ? 1 : 2;
      continue;
    }
    const length = view.getUint16(i + 2);
    // SOF0..SOF15, menos DHT (c4), JPG (c8) e DAC (cc): altura e largura logo depois da precisão
    const sof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
    if (marker === 0xd9 || marker === 0xda) return null; // fim, ou os dados antes de um SOF
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const chunk = ascii(12, 16);
  if (chunk === 'VP8X') {
    const at = (i: number) => b[i] ?? 0;
    const w = 1 + (at(24) | (at(25) << 8) | (at(26) << 16));
    const h = 1 + (at(27) | (at(28) << 8) | (at(29) << 16));
    return { width: w, height: h };
  }
  if (chunk === 'VP8 ') {
    return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = view.getUint32(21, true);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

export function imageSize(bytes: Uint8Array, mime: string): ImageSize | null {
  const size =
    mime === 'image/png'
      ? pngSize(bytes)
      : mime === 'image/jpeg'
        ? jpegSize(bytes)
        : mime === 'image/webp'
          ? webpSize(bytes)
          : null;
  if (!size || size.width < 1 || size.height < 1 || size.width > 10_000 || size.height > 10_000) {
    return null;
  }
  return size;
}
