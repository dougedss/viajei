import {
  downscaleSteps,
  fitSize,
  PLACEHOLDER_SIDE,
  searchQuality,
  type ImagePreset,
  type Size,
} from './compress.ts';
import { encodePlaceholder } from './placeholder.ts';

/**
 * Decodifica, endireita, reduz e codifica em JPEG. Roda num worker (com `OffscreenCanvas`) ou na
 * thread principal (com `<canvas>`), com o mesmo código. Recodificar apaga o EXIF inteiro,
 * inclusive a localização da foto: é de propósito.
 */
export type Encoded = {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
  placeholder: string | null;
};

export class DecodeError extends Error {
  constructor() {
    super('decode');
    this.name = 'DecodeError';
  }
}

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas({ width, height }: Size): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function context(canvas: AnyCanvas): Canvas2D {
  // cada tipo de canvas pelo seu getContext (no worker não existe HTMLCanvasElement para instanceof)
  const ctx: Canvas2D | null =
    'convertToBlob' in canvas
      ? canvas.getContext('2d', { alpha: false })
      : canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new DecodeError();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

function toBlob(canvas: AnyCanvas, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob devolveu vazio'))),
      'image/jpeg',
      quality,
    );
  });
}

/** `createImageBitmap` com a orientação do EXIF aplicada; HEIC abre no Safari, não no Chrome. */
async function decode(source: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(source, { imageOrientation: 'from-image' });
  } catch {
    throw new DecodeError();
  }
}

/** Desenha a imagem no tamanho final em passos de metade, sobre fundo branco (JPEG não tem alfa). */
function draw(bitmap: ImageBitmap, to: Size): AnyCanvas {
  let src: CanvasImageSource = bitmap;
  let srcSize: Size = { width: bitmap.width, height: bitmap.height };
  let canvas: AnyCanvas = makeCanvas(to);
  for (const step of downscaleSteps(srcSize, to)) {
    canvas = makeCanvas(step);
    const ctx = context(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, step.width, step.height);
    ctx.drawImage(src, 0, 0, srcSize.width, srcSize.height, 0, 0, step.width, step.height);
    src = canvas;
    srcSize = step;
  }
  return canvas;
}

function placeholderOf(canvas: AnyCanvas, size: Size): string | null {
  try {
    const small = fitSize(size.width, size.height, PLACEHOLDER_SIDE);
    const c = makeCanvas(small);
    const ctx = context(c);
    ctx.drawImage(canvas, 0, 0, size.width, size.height, 0, 0, small.width, small.height);
    const { data } = ctx.getImageData(0, 0, small.width, small.height);
    return encodePlaceholder(small.width, small.height, data);
  } catch {
    return null; // sem borrão a foto ainda vai; só aparece cinza até chegar
  }
}

export async function encodeImage(
  source: Blob,
  preset: ImagePreset,
  withPlaceholder: boolean,
): Promise<Encoded> {
  const bitmap = await decode(source);
  try {
    const size = fitSize(bitmap.width, bitmap.height, preset.maxSide);
    const canvas = draw(bitmap, size);
    const { blob, quality } = await searchQuality((q) => toBlob(canvas, q), preset);
    return {
      blob,
      width: size.width,
      height: size.height,
      quality,
      placeholder: withPlaceholder ? placeholderOf(canvas, size) : null,
    };
  } finally {
    bitmap.close();
  }
}
