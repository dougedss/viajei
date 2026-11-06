import { MEDIA } from '@shared/constants.ts';

/**
 * As regras puras da compressão, sem canvas: tamanhos, passos de redução, a busca de qualidade (com
 * o codificador injetado) e o reconhecimento do arquivo pelos primeiros bytes. Quem desenha e
 * codifica é `encode.ts`, no worker ou na thread principal.
 */
export type ImagePreset = {
  /** lado maior, em px; nunca amplia */
  maxSide: number;
  /** alvo de tamanho em bytes; null = qualidade fixa */
  target: number | null;
  /** qualidade inicial (ou a fixa) */
  quality: number;
  /** abaixo disto a busca não desce */
  minQuality: number;
  /** codificações no máximo */
  maxTries: number;
};

/** Foto de memória: 1600 px e cerca de 400 KB, por busca de qualidade em poucos passos. */
export const PHOTO_PRESET: ImagePreset = {
  maxSide: 1600,
  target: 400_000,
  quality: 0.82,
  minQuality: 0.5,
  maxTries: 4,
};

/** Print de reserva: 2400 px e qualidade alta, para o texto continuar legível. */
export const PRINT_PRESET: ImagePreset = {
  maxSide: 2400,
  target: null,
  quality: 0.9,
  minQuality: 0.9,
  maxTries: 1,
};

/** Lado maior da redução de onde sai o thumbhash (o algoritmo aceita até 100 × 100). */
export const PLACEHOLDER_SIDE = 100;

/** Folga sobre o alvo: 440 KB ainda é "cerca de 400 KB". */
export const TARGET_TOLERANCE = 1.1;

export type Size = { width: number; height: number };

/** Cabe o lado maior em `maxSide`, mantendo a proporção; nunca amplia. */
export function fitSize(width: number, height: number, maxSide: number): Size {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Os tamanhos intermediários da redução: cada passo no máximo pela metade, o último no tamanho
 * final. Reduzir 4032 → 1600 de uma vez serrilha no Safari; pela metade, a suavização dá conta.
 */
export function downscaleSteps(from: Size, to: Size): Size[] {
  const steps: Size[] = [];
  let { width, height } = from;
  while (width / 2 > to.width && height / 2 > to.height) {
    width = Math.round(width / 2);
    height = Math.round(height / 2);
    steps.push({ width, height });
  }
  steps.push(to);
  return steps;
}

export type QualityResult = { blob: Blob; quality: number; tries: number };

/**
 * Busca binária da qualidade: começa em `quality`; se passa do alvo, desce entre `minQuality` e a
 * última que passou, guardando a maior qualidade que coube. Sem nenhuma que caiba, fica a menor
 * tentada (a 0,5 uma foto de 1600 px já está bem abaixo dos 10 MB do bucket).
 */
export async function searchQuality(
  encode: (quality: number) => Promise<Blob>,
  preset: ImagePreset,
): Promise<QualityResult> {
  const first = await encode(preset.quality);
  if (preset.target === null) return { blob: first, quality: preset.quality, tries: 1 };
  const limit = preset.target * TARGET_TOLERANCE;
  if (first.size <= limit) return { blob: first, quality: preset.quality, tries: 1 };

  let lo = preset.minQuality;
  let hi = preset.quality;
  let fit: { blob: Blob; quality: number } | null = null;
  let smallest = { blob: first, quality: preset.quality };
  let tries = 1;
  while (tries < preset.maxTries) {
    // a primeira descida vai direto ao piso quando a anterior passou muito do alvo
    const q = tries === 1 && first.size > 3 * limit ? lo : round2((lo + hi) / 2);
    const blob = await encode(q);
    tries += 1;
    if (blob.size < smallest.blob.size) smallest = { blob, quality: q };
    if (blob.size <= limit) {
      if (!fit || q > fit.quality) fit = { blob, quality: q };
      lo = q;
    } else {
      hi = q;
    }
    if (hi - lo < 0.04) break;
  }
  const chosen = fit ?? smallest;
  return { ...chosen, tries };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type FileKind = 'jpeg' | 'png' | 'webp' | 'heic' | 'pdf' | 'image' | 'unsupported';

/**
 * O que é o arquivo, pelos primeiros 16 bytes (o `type` do input mente: o Android manda HEIC como
 * `image/*` ou vazio, e um PDF baixado pode vir como `application/octet-stream`).
 */
export function sniffKind(head: Uint8Array, declaredType: string): FileKind {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (ascii(0, 5) === '%PDF-') return 'pdf';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
      return 'heic';
    }
    return 'image'; // avif e afins: o navegador decide se abre
  }
  if (declaredType === 'application/pdf') return 'pdf';
  if (declaredType.startsWith('image/')) return 'image';
  return 'unsupported';
}

/** Nome do arquivo guardado: o original com a extensão do que vai, até 200 caracteres. */
export function storedFilename(original: string, ext: 'jpg' | 'pdf', fallback: string): string {
  const base = original
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/]/g, '-')
    .trim();
  const name = `${base === '' ? fallback : base}.${ext}`;
  return name.length <= 200 ? name : `${name.slice(0, 195)}.${ext}`;
}

/** Cabe no bucket? */
export function withinLimit(size: number): boolean {
  return size > 0 && size <= MEDIA.maxBytes;
}

/** "3,2 MB", "412 KB" */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
