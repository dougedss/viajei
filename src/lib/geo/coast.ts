import { toXY } from '@shared/geo.ts';
import { coastLines } from './coast-data.ts';
import type { Polyline } from './polyline.ts';
import type { Bbox } from './codec.ts';

const DEG = Math.PI / 180;
const M_PER_DEG = 111_195;

/** Distância mínima (m) de um ponto a uma caixa, no plano local: corte barato antes de olhar os segmentos. */
function bboxDistanceM(lng: number, lat: number, bbox: Bbox): number {
  const dx = Math.max(bbox[0] - lng, 0, lng - bbox[2]) * Math.cos(lat * DEG);
  const dy = Math.max(bbox[1] - lat, 0, lat - bbox[3]);
  return Math.hypot(dx, dy) * M_PER_DEG;
}

function lineDistanceM(lng: number, lat: number, line: Polyline): number {
  const p = toXY([lng, lat], lat);
  let best = Number.POSITIVE_INFINITY;
  const pts = line.coords;
  let a = toXY(pts[0] ?? [lng, lat], lat);
  for (let i = 1; i < pts.length; i++) {
    const b = toXY(pts[i] ?? [lng, lat], lat);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < best) best = d;
    a = b;
  }
  return best;
}

/**
 * Distância em metros até a linha de costa mais próxima (Natural Earth 1:10m, recortada ao Brasil
 * e vizinhos). Fora da caixa embutida, devolve a distância até a costa mais perto que existe no
 * dado, que ainda é uma resposta honesta ("longe do mar").
 */
export function distanceToCoast(lng: number, lat: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (const line of coastLines()) {
    if (bboxDistanceM(lng, lat, line.bbox) >= best) continue;
    const d = lineDistanceM(lng, lat, line);
    if (d < best) best = d;
  }
  return best;
}
