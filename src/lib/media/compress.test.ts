import { describe, expect, it } from 'vitest';
import {
  downscaleSteps,
  fitSize,
  formatBytes,
  PHOTO_PRESET,
  PRINT_PRESET,
  searchQuality,
  sniffKind,
  storedFilename,
} from './compress.ts';

/** Um codificador de mentira: o tamanho cresce com a qualidade, como num JPEG. */
function fakeEncoder(bytesAt: (q: number) => number) {
  const calls: number[] = [];
  const encode = (q: number) => {
    calls.push(q);
    return Promise.resolve(new Blob([new Uint8Array(Math.round(bytesAt(q)))]));
  };
  return { encode, calls };
}

describe('dimensões', () => {
  it('cabe o lado maior e nunca amplia', () => {
    expect(fitSize(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitSize(1170, 2532, 2400)).toEqual({ width: 1109, height: 2400 });
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('reduz em passos de no máximo metade, terminando no tamanho final', () => {
    expect(downscaleSteps({ width: 4032, height: 3024 }, { width: 1600, height: 1200 })).toEqual([
      { width: 2016, height: 1512 },
      { width: 1600, height: 1200 },
    ]);
    expect(downscaleSteps({ width: 8064, height: 6048 }, { width: 1600, height: 1200 })).toEqual([
      { width: 4032, height: 3024 },
      { width: 2016, height: 1512 },
      { width: 1600, height: 1200 },
    ]);
    expect(downscaleSteps({ width: 1700, height: 1275 }, { width: 1600, height: 1200 })).toEqual([
      { width: 1600, height: 1200 },
    ]);
  });
});

describe('busca de qualidade', () => {
  it('a primeira já cabe no alvo: uma codificação só', async () => {
    const { encode, calls } = fakeEncoder((q) => 300_000 * q);
    const r = await searchQuality(encode, PHOTO_PRESET);
    expect(calls).toEqual([0.82]);
    expect(r.quality).toBe(0.82);
  });

  it('passa do alvo: desce e fica com a maior qualidade que coube, em até 4 codificações', async () => {
    const { encode, calls } = fakeEncoder((q) => 800_000 * q);
    const r = await searchQuality(encode, PHOTO_PRESET);
    expect(calls.length).toBeLessThanOrEqual(PHOTO_PRESET.maxTries);
    expect(r.blob.size).toBeLessThanOrEqual(440_000);
    // 800 KB × q ≤ 440 KB → q ≤ 0,55: a maior que a busca achou abaixo disso
    expect(r.quality).toBeGreaterThanOrEqual(0.5);
    expect(r.quality).toBeLessThanOrEqual(0.55);
  });

  it('muito acima do alvo: a primeira descida vai direto ao piso', async () => {
    const { encode, calls } = fakeEncoder((q) => 5_000_000 * q);
    const r = await searchQuality(encode, PHOTO_PRESET);
    expect(calls[1]).toBe(PHOTO_PRESET.minQuality);
    // nada coube: fica a menor tentada
    expect(r.quality).toBe(PHOTO_PRESET.minQuality);
  });

  it('o print usa qualidade fixa, sem busca', async () => {
    const { encode, calls } = fakeEncoder(() => 1_500_000);
    const r = await searchQuality(encode, PRINT_PRESET);
    expect(calls).toEqual([0.9]);
    expect(r.blob.size).toBe(1_500_000);
  });
});

describe('o que é o arquivo', () => {
  const bytes = (...xs: (number | string)[]) => {
    const out: number[] = [];
    for (const x of xs) {
      if (typeof x === 'number') out.push(x);
      else for (const ch of x) out.push(ch.charCodeAt(0));
    }
    while (out.length < 16) out.push(0);
    return new Uint8Array(out);
  };

  it('pelos primeiros bytes, não pelo type do input', () => {
    expect(sniffKind(bytes('%PDF-1.7'), 'application/octet-stream')).toBe('pdf');
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe1), '')).toBe('jpeg');
    expect(sniffKind(bytes(0x89, 'PNG'), 'image/png')).toBe('png');
    expect(sniffKind(bytes('RIFF', 0, 0, 0, 0, 'WEBP'), '')).toBe('webp');
    expect(sniffKind(bytes(0, 0, 0, 0x18, 'ftypheic'), 'image/*')).toBe('heic');
    expect(sniffKind(bytes(0, 0, 0, 0x18, 'ftypmif1'), '')).toBe('heic');
    expect(sniffKind(bytes(0, 0, 0, 0x18, 'ftypavif'), '')).toBe('image');
    expect(sniffKind(bytes('hello'), 'text/plain')).toBe('unsupported');
  });

  it('nome guardado com a extensão do que vai', () => {
    expect(storedFilename('IMG_0001.HEIC', 'jpg', 'foto')).toBe('IMG_0001.jpg');
    expect(storedFilename('Confirmação Booking.pdf', 'pdf', 'documento')).toBe(
      'Confirmação Booking.pdf',
    );
    expect(storedFilename('', 'jpg', 'print')).toBe('print.jpg');
    expect(storedFilename('a/b.png', 'jpg', 'print')).toBe('a-b.jpg');
    expect(storedFilename(`${'x'.repeat(300)}.pdf`, 'pdf', 'd')).toHaveLength(199);
  });

  it('tamanho para ler', () => {
    expect(formatBytes(412_000)).toBe('402 KB');
    expect(formatBytes(3.2 * 1024 * 1024)).toBe('3,2 MB');
  });
});
