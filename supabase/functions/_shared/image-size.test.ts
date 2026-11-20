import { describe, expect, it } from 'vitest';
import { imageSize } from './image-size.ts';

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const v = new DataView(b.buffer);
  v.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  v.setUint32(16, width);
  v.setUint32(20, height);
  return b;
}

/** Um JPEG mínimo: SOI, um APP0 de 16 bytes, um DQT de 4 bytes, e o SOF0 com as medidas. */
function jpeg(width: number, height: number): Uint8Array {
  const parts = [
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...new Array<number>(14).fill(0),
    0xff,
    0xdb,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc2,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ];
  return new Uint8Array(parts);
}

function webpX(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  const w = width - 1;
  const h = height - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}

describe('imageSize', () => {
  it('PNG pelo IHDR, JPEG pelo SOF (inclusive progressivo), WebP pelo VP8X', () => {
    expect(imageSize(png(1170, 2532), 'image/png')).toEqual({ width: 1170, height: 2532 });
    expect(imageSize(jpeg(2400, 1800), 'image/jpeg')).toEqual({ width: 2400, height: 1800 });
    expect(imageSize(webpX(800, 600), 'image/webp')).toEqual({ width: 800, height: 600 });
  });

  it('o que não é imagem conhecida, ou tem medida impossível, é null', () => {
    expect(imageSize(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf')).toBeNull();
    expect(imageSize(png(1170, 2532), 'image/jpeg')).toBeNull();
    expect(imageSize(png(0, 10), 'image/png')).toBeNull();
    expect(imageSize(png(20_000, 10), 'image/png')).toBeNull();
    expect(imageSize(new Uint8Array(3), 'image/png')).toBeNull();
  });
});
