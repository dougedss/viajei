/**
 * A matemática do visualizador em tela cheia, pura: pinça, arrasto com zoom, toque duplo e o
 * deslizar entre fotos. A imagem cabe inteira na tela em escala 1 (`contain`); o deslocamento é do
 * centro da imagem em relação ao centro da tela, em px.
 */
export type Zoom = { scale: number; x: number; y: number };
export type Point = { x: number; y: number };
export type Box = { width: number; height: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;
/** arrasto horizontal que troca de foto (escala 1) */
export const SWIPE_PX = 60;

export const IDENTITY: Zoom = { scale: 1, x: 0, y: 0 };

/** O tamanho da imagem em escala 1: cabe na tela mantendo a proporção. */
export function containSize(content: Box, view: Box): Box {
  const s = Math.min(view.width / content.width, view.height / content.height);
  return { width: content.width * s, height: content.height * s };
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Prende o deslocamento para a imagem nunca descolar da borda (e centralizada quando cabe). */
export function clampPan(z: Zoom, fitted: Box, view: Box): Zoom {
  const maxX = Math.max(0, (fitted.width * z.scale - view.width) / 2);
  const maxY = Math.max(0, (fitted.height * z.scale - view.height) / 2);
  return {
    scale: z.scale,
    x: Math.min(maxX, Math.max(-maxX, z.x)),
    y: Math.min(maxY, Math.max(-maxY, z.y)),
  };
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Pinça: a escala segue a distância entre os dedos e o ponto entre eles fica parado sob os dedos.
 * Pontos em coordenadas da tela com origem no centro.
 */
export function pinch(start: Zoom, from: [Point, Point], to: [Point, Point]): Zoom {
  const d0 = dist(from[0], from[1]);
  if (d0 < 1) return start;
  const scale = clampScale((start.scale * dist(to[0], to[1])) / d0);
  const m0 = mid(from[0], from[1]);
  const m1 = mid(to[0], to[1]);
  const k = scale / start.scale;
  return { scale, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k };
}

/** Toque duplo: aproxima no ponto tocado; aproximado, volta ao inteiro. */
export function doubleTap(z: Zoom, at: Point): Zoom {
  if (z.scale > 1.01) return IDENTITY;
  const k = DOUBLE_TAP_SCALE / z.scale;
  return { scale: DOUBLE_TAP_SCALE, x: at.x - (at.x - z.x) * k, y: at.y - (at.y - z.y) * k };
}

/** Soltou o dedo em escala 1: troca de foto se o arrasto foi horizontal e longo. */
export function swipeDirection(dx: number, dy: number, scale: number): -1 | 1 | 0 {
  if (scale > 1.01 || Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}
