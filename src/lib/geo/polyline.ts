import { bboxOf, decodeLine, type Bbox } from './codec.ts';

/** Uma linha decodificada, com a caixa que a contém (para descartar rápido o que está longe). */
export type Polyline = { bbox: Bbox; coords: [number, number][] };

export function toPolyline(encoded: string): Polyline {
  const coords = decodeLine(encoded);
  return { bbox: bboxOf(coords), coords };
}
