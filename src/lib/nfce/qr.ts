/**
 * O QR code de uma foto, no aparelho e sem IA (fase 18). Onde existe, o `BarcodeDetector` do
 * navegador (o Chrome do Android); onde não (o Safari só o tem atrás de uma flag, conferido no
 * caniuse em 20/11/2026), o `jsqr` (1.4.0, Apache-2.0, sem dependências, ~280 KB desempacotados),
 * carregado só na hora, sobre a imagem desenhada num canvas. A foto de uma nota tem o QR pequeno:
 * tenta-se em dois tamanhos, o menor primeiro.
 */
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorLike = {
  detect(image: ImageBitmap): Promise<DetectedBarcode[]>;
};
type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** o QR de uma nota é pequeno: primeiro um tamanho leve, depois o grande, se a foto tiver mais */
const SMALL_SIDE = 1_400;
const LARGE_SIDE = 2_800;

function detectorOf(): BarcodeDetectorCtor | null {
  const g = globalThis as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof g.BarcodeDetector === 'function' ? g.BarcodeDetector : null;
}

async function withDetector(bitmap: ImageBitmap): Promise<string | null> {
  const D = detectorOf();
  if (!D) return null;
  try {
    const formats = D.getSupportedFormats ? await D.getSupportedFormats() : ['qr_code'];
    if (!formats.includes('qr_code')) return null;
    const codes = await new D({ formats: ['qr_code'] }).detect(bitmap);
    return codes.find((c) => c.rawValue.trim() !== '')?.rawValue ?? null;
  } catch {
    return null;
  }
}

function imageData(bitmap: ImageBitmap, maxSide: number): ImageData | null {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    ctx = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true });
  } else {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

async function withJsQr(bitmap: ImageBitmap): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  const sides =
    Math.max(bitmap.width, bitmap.height) > SMALL_SIDE ? [SMALL_SIDE, LARGE_SIDE] : [SMALL_SIDE];
  for (const side of sides) {
    const data = imageData(bitmap, side);
    if (!data) return null;
    const found = jsQR(data.data, data.width, data.height, { inversionAttempts: 'dontInvert' });
    if (found?.data.trim()) return found.data;
  }
  return null;
}

/** O texto do QR code da imagem, ou null quando não há (ou a imagem não abre). */
export async function decodeQr(file: Blob): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }
  try {
    return (await withDetector(bitmap)) ?? (await withJsQr(bitmap));
  } finally {
    bitmap.close();
  }
}
