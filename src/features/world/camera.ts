import type { CameraFrame, Vec3 } from './math.ts';
import { clamp } from './noise.ts';

/**
 * A câmera da maquete, pura (fase 14): alta e atrás do carro, em retrato, olhando para a próxima
 * parada (o carro aparece a três quartos pela própria curva da estrada, e a pessoa vê para onde
 * vai). Parada, o carro ocupa cerca de um quinto da altura da tela; em movimento entre paradas
 * distantes, a câmera recua para a estrada caber, até um teto; a estrada serpenteia à frente,
 * subindo na tela. A abertura do dia começa larga (`fitCamera`, o dia inteiro) e termina aqui. O
 * `CameraRig` só suaviza o enquadramento atual para o desejado (e corta, sem deslizar, com reduzir
 * movimento).
 */
export const FOLLOW_TILT = (50 * Math.PI) / 180;
/** parado: o carro na escala da cena ocupa ~1/5 da altura */
export const FOLLOW_NEAR = 55;
/** o teto do recuo */
export const FOLLOW_FAR = 150;
/**
 * Em movimento, recua até esta fração da distância (em `s`) ao próximo nó: com a inclinação e o campo
 * de visão daqui, a câmera vê o chão até ~0,58 da distância à frente do carro, e o caminho entre
 * dois nós é pouco maior que a reta entre eles
 */
export const FOLLOW_GAP_K = 1.9;
/** a menos disto do próximo nó, a direção é a da estrada, não a do nó (a reta ficaria instável) */
export const HEADING_MIN_GAP = 3;
/** onde o carro cai na tela: no terço de baixo (normalizado, −1 é a borda de baixo) */
export const CAR_SCREEN_Y = -0.4;
/** a curiosidade: mais perto e mais baixa, 2 a 3 s, e volta */
export const DIVE = { distance: 40, tilt: (38 * Math.PI) / 180 } as const;
/** a escala do carro na cena: fixa de perto, um pouco maior quando a câmera recua */
export const CAR_SCALE = { near: 1.3, far: 2.2 } as const;

type PathLike = {
  pathAt: (s: number) => { x: number; y: number; z: number; tx: number; tz: number };
  camera: Pick<CameraFrame, 'fov'>;
};

/** O `yaw` que põe a câmera atrás de quem anda na direção `dir` (horizontal), olhando por ela. */
export function headingYaw(dir: { x: number; z: number }): number {
  return Math.atan2(dir.x, dir.z) + Math.PI;
}

/** Para onde o carro vai: a reta até o próximo nó; sem ele (ou colado nele), a tangente da estrada. */
export function headingAt(
  layout: PathLike,
  s: number,
  nextS: number | null,
): { x: number; z: number } {
  const p = layout.pathAt(s);
  if (nextS !== null && nextS - s >= HEADING_MIN_GAP) {
    const n = layout.pathAt(nextS);
    const dx = n.x - p.x;
    const dz = n.z - p.z;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) return { x: dx / l, z: dz / l };
  }
  const l = Math.hypot(p.tx, p.tz) || 1;
  return { x: p.tx / l, z: p.tz / l };
}

/** A distância: perto parado; em movimento, pela distância ao próximo nó, entre o perto e o teto. */
export function followDistance(gapS: number | null, parked: boolean): number {
  if (parked || gapS === null) return FOLLOW_NEAR;
  return clamp(FOLLOW_GAP_K * gapS, FOLLOW_NEAR, FOLLOW_FAR);
}

/**
 * Quanto o alvo fica à frente do carro para o carro cair em `screenY`: a câmera a `distance` do
 * alvo, inclinada `tilt`, vê o chão a um ângulo; o ponto que aparece em `screenY` está a
 * `distance · (cos tilt − sin tilt / tan a)` do alvo, com `a` o ângulo de depressão daquele raio.
 */
export function aheadOf(
  distance: number,
  tilt: number,
  fovDeg: number,
  screenY = CAR_SCREEN_Y,
): number {
  const half = Math.tan((fovDeg / 2) * (Math.PI / 180));
  const a = tilt + Math.atan(-screenY * half);
  return distance * (Math.cos(tilt) - Math.sin(tilt) / Math.tan(a));
}

export type FollowInput = {
  layout: PathLike;
  /** a posição do carro no caminho */
  s: number;
  /** o `s` do próximo nó, se há */
  nextS: number | null;
  /** parado num nó, sem nada em movimento */
  parked: boolean;
};

export function followCamera({ layout, s, nextS, parked }: FollowInput): CameraFrame {
  const p = layout.pathAt(s);
  const gap = nextS === null ? null : Math.max(0, nextS - s);
  const distance = followDistance(gap, parked);
  const fov = layout.camera.fov;
  const ahead = aheadOf(distance, FOLLOW_TILT, fov);
  const dir = headingAt(layout, s, nextS);
  // o alvo à frente do carro, na direção em que a câmera olha o chão
  const target: Vec3 = [p.x + dir.x * ahead, p.y, p.z + dir.z * ahead];
  return { target, distance, tilt: FOLLOW_TILT, yaw: headingYaw(dir), fov };
}

/** A curiosidade: a mesma direção, mais perto e mais baixa, olhando o carro. */
export function diveCamera(layout: PathLike, s: number, nextS: number | null): CameraFrame {
  const p = layout.pathAt(s);
  return {
    target: [p.x, p.y, p.z],
    distance: DIVE.distance,
    tilt: DIVE.tilt,
    yaw: headingYaw(headingAt(layout, s, nextS)),
    fov: layout.camera.fov,
  };
}

/** O `s` do próximo nó depois de `s`, se há. */
export function nextNodeS(nodes: readonly { s: number }[], s: number, eps = 0.5): number | null {
  for (const n of nodes) if (n.s > s + eps) return n.s;
  return null;
}

/** O carro está num nó (a menos de `eps`). */
export function atNode(nodes: readonly { s: number }[], s: number, eps = 0.5): boolean {
  return nodes.some((n) => Math.abs(n.s - s) <= eps);
}

/**
 * Aproxima o enquadramento atual do desejado por `k` (0 a 1; 1 é cortar). Devolve o novo
 * enquadramento e se ainda está a caminho.
 */
export function approachFrame(
  view: CameraFrame,
  want: CameraFrame,
  k: number,
): { view: CameraFrame; moving: boolean } {
  const step = (a: number, b: number) => a + (b - a) * k;
  const next: CameraFrame = {
    target: [
      step(view.target[0], want.target[0]),
      step(view.target[1], want.target[1]),
      step(view.target[2], want.target[2]),
    ],
    distance: step(view.distance, want.distance),
    tilt: step(view.tilt, want.tilt),
    yaw: step(view.yaw ?? 0, want.yaw ?? 0),
    fov: want.fov,
  };
  const far = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  const moving =
    far(next.target[0], want.target[0], 0.05) ||
    far(next.target[1], want.target[1], 0.05) ||
    far(next.target[2], want.target[2], 0.05) ||
    far(next.distance, want.distance, 0.05) ||
    far(next.tilt, want.tilt, 0.001) ||
    far(next.yaw ?? 0, want.yaw ?? 0, 0.001);
  return moving ? { view: next, moving } : { view: want, moving: false };
}

/** Quanto a câmera recuou, de 0 (perto) a 1 (no teto e além): o carro e os anéis crescem com isto. */
export function farness(distance: number): number {
  const t = clamp((distance - FOLLOW_NEAR) / (FOLLOW_FAR * 2 - FOLLOW_NEAR), 0, 1);
  return t * t * (3 - 2 * t);
}

export function carScale(distance: number): number {
  return CAR_SCALE.near + (CAR_SCALE.far - CAR_SCALE.near) * farness(distance);
}
