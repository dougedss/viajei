/**
 * Codificação compacta dos dados geográficos embutidos: coordenadas em milésimos de grau
 * (≈ 111 m), delta entre pontos consecutivos, zigzag e varint, tudo em base64. Um traçado de
 * costa ou um anel de bioma vira uma string curta; o decodificador roda em qualquer ambiente
 * (navegador, Node, Vitest). O script `scripts/geo/build-data.ts` usa o codificador; o app só lê.
 */
export const QUANT = 1000;

function zigzag(n: number): number {
  return n < 0 ? -2 * n - 1 : 2 * n;
}
function unzigzag(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

function writeVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Inteiros com sinal (zigzag + varint) em base64. */
export function encodeInts(values: readonly number[]): string {
  const out: number[] = [];
  for (const v of values) writeVarint(out, zigzag(Math.round(v)));
  return bytesToBase64(Uint8Array.from(out));
}

export function decodeInts(b64: string): number[] {
  const bytes = base64ToBytes(b64);
  const out: number[] = [];
  let value = 0;
  let shift = 1;
  for (const b of bytes) {
    value += (b & 0x7f) * shift;
    if (b & 0x80) {
      shift *= 128;
    } else {
      out.push(unzigzag(value));
      value = 0;
      shift = 1;
    }
  }
  return out;
}

/** Linha ou anel [lng, lat][] quantizado e em deltas. */
export function encodeLine(coords: readonly (readonly number[])[]): string {
  const ints: number[] = [];
  let px = 0;
  let py = 0;
  for (const c of coords) {
    const x = Math.round((c[0] ?? 0) * QUANT);
    const y = Math.round((c[1] ?? 0) * QUANT);
    ints.push(x - px, y - py);
    px = x;
    py = y;
  }
  return encodeInts(ints);
}

export function decodeLine(b64: string): [number, number][] {
  const ints = decodeInts(b64);
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i + 1 < ints.length; i += 2) {
    x += ints[i] ?? 0;
    y += ints[i + 1] ?? 0;
    out.push([x / QUANT, y / QUANT]);
  }
  return out;
}

export type Bbox = [number, number, number, number];

export function bboxOf(coords: readonly (readonly number[])[]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    const x = c[0] ?? 0;
    const y = c[1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Formato dos arquivos em `src/lib/geo/data/`. */
export type CoastData = {
  source: string;
  license: string;
  generated_at: string;
  bbox: Bbox;
  lines: string[];
};
export type BiomeCode =
  'amazonia' | 'caatinga' | 'cerrado' | 'mata_atlantica' | 'pampa' | 'pantanal';
export type BiomesData = {
  source: string;
  license: string;
  generated_at: string;
  biomes: { code: BiomeCode; name: string; rings: string[] }[];
};
export type MunicipalitiesData = {
  source: string;
  license: string;
  generated_at: string;
  count: number;
  /** nomes separados por "|", na mesma ordem das coordenadas */
  names: string;
  /** siglas de UF, 2 caracteres por município, concatenadas */
  uf: string;
  /** [lng, lat] quantizados e em deltas, como uma linha */
  coords: string;
  /** população estimada, varint */
  pop: string;
};
