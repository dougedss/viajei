/**
 * Vetores e a câmera da maquete em matemática pura, sem three: o layout e a projeção das pílulas
 * são testados no Vitest, e a cena só copia os mesmos números para a câmera de verdade.
 */
export type Vec3 = [number, number, number];

export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vlen = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function vnorm(a: Vec3): Vec3 {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Onde a câmera fica e para onde olha: `tilt` é o ângulo acima do chão, em radianos. */
export type CameraFrame = {
  target: Vec3;
  distance: number;
  tilt: number;
  /** vertical, em graus */
  fov: number;
};

export function cameraPosition(frame: CameraFrame): Vec3 {
  const off: Vec3 = [0, Math.sin(frame.tilt), Math.cos(frame.tilt)];
  return vadd(frame.target, vscale(off, frame.distance));
}

/**
 * Projeta um ponto do mundo em coordenadas normalizadas (x e y em [-1, 1], como o clip space) para
 * a câmera do frame olhando para `target` com o eixo y para cima. `depth` negativo = atrás.
 */
export function projectPoint(
  frame: CameraFrame,
  aspect: number,
  point: Vec3,
): { x: number; y: number; depth: number } {
  const eye = cameraPosition(frame);
  const forward = vnorm(vsub(frame.target, eye));
  const right = vnorm(vcross(forward, [0, 1, 0]));
  const up = vcross(right, forward);
  const rel = vsub(point, eye);
  const depth = vdot(rel, forward);
  const f = 1 / Math.tan(((frame.fov / 2) * Math.PI) / 180);
  const safe = Math.max(1e-6, depth);
  return {
    x: (vdot(rel, right) * f) / aspect / safe,
    y: (vdot(rel, up) * f) / safe,
    depth,
  };
}

/**
 * Onde o raio que sai da câmera por um ponto da tela (x e y em [-1, 1]) toca o plano `y = h`.
 * `null` quando o raio não desce até o plano (olhando para o horizonte ou acima).
 */
export function groundHit(
  frame: CameraFrame,
  aspect: number,
  sx: number,
  sy: number,
  h = 0,
): Vec3 | null {
  const eye = cameraPosition(frame);
  const forward = vnorm(vsub(frame.target, eye));
  const right = vnorm(vcross(forward, [0, 1, 0]));
  const up = vcross(right, forward);
  const t = Math.tan(((frame.fov / 2) * Math.PI) / 180);
  const dir = vnorm(vadd(forward, vadd(vscale(right, sx * t * aspect), vscale(up, sy * t))));
  if (dir[1] >= -1e-6) return null;
  const k = (h - eye[1]) / dir[1];
  return vadd(eye, vscale(dir, k));
}
