import type { StopKind } from '@shared/constants.ts';
import { MINIATURE_BOX, MINIATURE_ROAD_GAP } from '@/art/stops/types.ts';
import type { CameraFrame, Vec3 } from './math.ts';
import { projectPoint } from './math.ts';
import { clamp } from './noise.ts';
import { PILL_LIFT, PILL_SAFE } from './project.ts';

/**
 * A câmera da maquete, pura (fase 22). O quadro de repouso é **o dia inteiro**, inclinado como uma
 * maquete de mesa (52°, FOV 26, a referência dos esboços): a caixa da maquete e as âncoras de todas
 * as pílulas cabem entre a faixa de cima do palco e o que está sobre o pé dele (a altura medida, não
 * um número). O carro anda sobre a maquete com a câmera parada e é desenhado maior que a escala para
 * continuar sendo o que o olho acha primeiro. Um toque no carro liga o **modo de perto** (a câmera da
 * fase 14: alta e atrás do carro, olhando a próxima parada; parado perto, em movimento recuando até
 * um teto), que volta sozinho ao repouso depois de alguns segundos ou com um toque fora. As
 * curiosidades mergulham a partir do repouso e voltam. O `CameraRig` só suaviza o enquadramento
 * atual para o desejado (e corta, sem deslizar, com reduzir movimento).
 */
export const REST_TILT = (52 * Math.PI) / 180;
export const REST_FOV = 26;
/** a câmera do repouso fica antes do começo do dia, olhando para o fim: a estrada sobe na tela */
export const REST_YAW = Math.PI;
/** a folga da caixa da maquete na área útil, em px */
export const REST_SAFE = { side: 24, top: 8, bottom: 8 } as const;

export const FOLLOW_TILT = (50 * Math.PI) / 180;
export const FOLLOW_FOV = 30;
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
/** o modo de perto volta sozinho ao repouso depois disto sem outro toque no carro */
export const CLOSE_MS = 6_000;

/** o hatch, em unidades da cena: a régua do tamanho do carro na tela */
export const CAR_LENGTH = 4.62;
/**
 * O carro ocupa pelo menos esta fração da altura do palco em comprimento, no alvo da câmera: no
 * repouso típico dá ~2,6× a escala (os esboços, 2,55×); de perto, a escala é a natural de perto
 */
export const CAR_FRACTION = 0.07;
export const CAR_SCALE = { near: 1.3, max: 3.2 } as const;

export type RestViewport = {
  width: number;
  height: number;
  /** a faixa de cima do palco (o clima, "Rever o dia"), em px */
  hudTop: number;
  /** a altura medida do que está sobre o pé do palco, em px */
  hudBottom: number;
};

type PathLike = {
  pathAt: (s: number) => { x: number; y: number; z: number; tx: number; tz: number };
};

type RestLayout = {
  bounds: { x0: number; x1: number; z0: number; z1: number };
  yRange: { y0: number; y1: number };
  roadHalfWidth: number;
  nodes: readonly { position: Vec3; side: -1 | 1; kind: StopKind }[];
  path: readonly { x: number; y: number; z: number }[];
};

/** o relevo em volta da estrada sobe no máximo isto acima dela (o mesmo `RELIEF_ROOM` do layout) */
const RELIEF_ROOM = 5;

/**
 * O que tem de caber na tela: o fundo da base nos quatro cantos, o relevo ao longo do dia (a altura
 * da estrada mais a folga do relevo, nas duas bordas da base), o alto de cada peça onde ela está, e
 * as âncoras das pílulas com a altura da pílula de folga. Pontos onde as coisas estão, não uma caixa
 * só: num dia de serra a caixa inteira na altura do pico afastaria a câmera à toa.
 */
function restPoints(layout: RestLayout, boxRect: Rect, pillRect: Rect): Point[] {
  const { bounds, yRange } = layout;
  const points: Point[] = [];
  for (const x of [bounds.x0, bounds.x1])
    for (const z of [bounds.z0, bounds.z1]) points.push({ p: [x, yRange.y0, z], rect: boxRect });
  const step = Math.max(1, Math.floor(layout.path.length / 48));
  for (let i = 0; i < layout.path.length; i += step) {
    const q = layout.path[i];
    if (!q) continue;
    points.push({ p: [bounds.x0, q.y + RELIEF_ROOM, q.z], rect: boxRect });
    points.push({ p: [bounds.x1, q.y + RELIEF_ROOM, q.z], rect: boxRect });
  }
  const last = layout.path.at(-1);
  if (last) {
    points.push({ p: [bounds.x0, last.y + RELIEF_ROOM, last.z], rect: boxRect });
    points.push({ p: [bounds.x1, last.y + RELIEF_ROOM, last.z], rect: boxRect });
  }
  for (const n of layout.nodes) {
    const box = MINIATURE_BOX[n.kind];
    const [x, y, z] = n.position;
    const far = x + n.side * (layout.roadHalfWidth + MINIATURE_ROAD_GAP + box.d);
    for (const px of [x, far]) {
      points.push({ p: [px, y + box.h, z - box.w / 2], rect: boxRect });
      points.push({ p: [px, y + box.h, z + box.w / 2], rect: boxRect });
    }
    points.push({ p: [x, y + PILL_LIFT, z], rect: pillRect });
  }
  return points;
}

type Rect = { l: number; r: number; t: number; b: number };
type Point = { p: Vec3; rect: Rect };

/** px → coordenadas normalizadas da projeção (x à direita, y para cima, ambos em [−1, 1]). */
function rectOf(viewport: RestViewport, l: number, r: number, t: number, b: number): Rect {
  const w = Math.max(1, viewport.width);
  const h = Math.max(1, viewport.height);
  return { l: (l / w) * 2 - 1, r: (r / w) * 2 - 1, t: 1 - (t / h) * 2, b: 1 - (b / h) * 2 };
}

/**
 * O quadro de repouso: a menor distância em que a caixa da maquete (os 8 cantos) e as âncoras das
 * pílulas (um pouco acima de cada nó, com a altura da pílula de folga) cabem na área útil, com o
 * centro da caixa no centro dessa área. Puro e determinístico: o palco e a altura medida entram, o
 * layout não é refeito.
 */
export function restCamera(layout: RestLayout, viewport: RestViewport): CameraFrame {
  const { bounds, yRange } = layout;
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const aspect = width / height;
  const boxRect = rectOf(
    viewport,
    REST_SAFE.side,
    width - REST_SAFE.side,
    viewport.hudTop + REST_SAFE.top,
    height - viewport.hudBottom - REST_SAFE.bottom,
  );
  const pillRect = rectOf(
    viewport,
    PILL_SAFE.side,
    width - PILL_SAFE.side,
    viewport.hudTop + PILL_SAFE.height,
    height - Math.max(PILL_SAFE.bottomMin, viewport.hudBottom + PILL_SAFE.bottomGap),
  );
  const points = restPoints(layout, boxRect, pillRect);
  // os cantos para centrar: o fundo da base e o alto do que há nas pontas
  const corners = points.filter((pt) => pt.rect === boxRect);
  const yc = (yRange.y0 + yRange.y1) / 2;
  const frameAt = (distance: number, zc: number): CameraFrame => ({
    target: [0, yc, zc],
    distance,
    tilt: REST_TILT,
    yaw: REST_YAW,
    fov: REST_FOV,
  });
  // o centro vertical da caixa na tela, para um alvo em `zc`
  const boxCenterY = (distance: number, zc: number): number => {
    const frame = frameAt(distance, zc);
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (const c of corners) {
      const q = projectPoint(frame, aspect, c.p);
      lo = Math.min(lo, q.y);
      hi = Math.max(hi, q.y);
    }
    return (lo + hi) / 2;
  };
  const wantY = (boxRect.t + boxRect.b) / 2;
  const span = bounds.z1 - bounds.z0;
  const centerZ = (distance: number): number => {
    let lo = bounds.z0 - span;
    let hi = bounds.z1 + span;
    // mover o alvo para a frente desce a caixa na tela (a câmera olha para +z)
    for (let i = 0; i < 36; i++) {
      const mid = (lo + hi) / 2;
      if (boxCenterY(distance, mid) > wantY) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const fits = (distance: number, zc: number): boolean => {
    const frame = frameAt(distance, zc);
    for (const pt of points) {
      const q = projectPoint(frame, aspect, pt.p);
      if (q.depth <= 0) return false;
      if (q.x < pt.rect.l || q.x > pt.rect.r || q.y < pt.rect.b || q.y > pt.rect.t) return false;
    }
    return true;
  };
  let lo = 20;
  let hi = 4000;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (fits(d, centerZ(d))) hi = d;
    else lo = d;
  }
  return frameAt(hi, centerZ(hi));
}

/** A escala do carro para um enquadramento: `CAR_FRACTION` da altura do palco no alvo da câmera, entre o perto e o teto. */
export function carScaleFor(frame: Pick<CameraFrame, 'distance' | 'fov'>): number {
  const visible = 2 * frame.distance * Math.tan(((frame.fov / 2) * Math.PI) / 180);
  return clamp((CAR_FRACTION * visible) / CAR_LENGTH, CAR_SCALE.near, CAR_SCALE.max);
}

/** Quanto a câmera está longe, de 0 (perto, a escala natural) a 1 (o teto da escala): os anéis crescem com isto. */
export function farness(frame: Pick<CameraFrame, 'distance' | 'fov'>): number {
  const t = (carScaleFor(frame) - CAR_SCALE.near) / (CAR_SCALE.max - CAR_SCALE.near);
  return t * t * (3 - 2 * t);
}

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

/** O modo de perto (a câmera da fase 14): atrás e acima do carro, olhando para a próxima parada. */
export function followCamera({ layout, s, nextS, parked }: FollowInput): CameraFrame {
  const p = layout.pathAt(s);
  const gap = nextS === null ? null : Math.max(0, nextS - s);
  const distance = followDistance(gap, parked);
  const ahead = aheadOf(distance, FOLLOW_TILT, FOLLOW_FOV);
  const dir = headingAt(layout, s, nextS);
  // o alvo à frente do carro, na direção em que a câmera olha o chão
  const target: Vec3 = [p.x + dir.x * ahead, p.y, p.z + dir.z * ahead];
  return { target, distance, tilt: FOLLOW_TILT, yaw: headingYaw(dir), fov: FOLLOW_FOV };
}

/** A curiosidade: atrás do carro, mais perto e mais baixa, olhando o carro. */
export function diveCamera(layout: PathLike, s: number, nextS: number | null): CameraFrame {
  const p = layout.pathAt(s);
  return {
    target: [p.x, p.y, p.z],
    distance: DIVE.distance,
    tilt: DIVE.tilt,
    yaw: headingYaw(headingAt(layout, s, nextS)),
    fov: FOLLOW_FOV,
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

// ------------------------------------------------------------------ o modo de perto
/** O modo de perto em curso: até quando vale sem outro toque no carro. */
export type CloseMode = { until: number } | null;

/** Um toque no carro: liga (ou estende) o modo de perto por `CLOSE_MS`. */
export function tapCar(now: number): CloseMode {
  return { until: now + CLOSE_MS };
}

export function closeActive(close: CloseMode, now: number): boolean {
  return close !== null && now < close.until;
}

export type CameraMode = 'repouso' | 'perto' | 'mergulho';

export type WantedInput = {
  rest: CameraFrame;
  layout: PathLike;
  s: number;
  nextS: number | null;
  parked: boolean;
  /** uma curiosidade em curso */
  diving: boolean;
  close: CloseMode;
  now: number;
  reducedMotion: boolean;
};

/**
 * O enquadramento desejado num instante, e o modo que ele é: o mergulho da curiosidade (não com
 * reduzir movimento), o modo de perto enquanto dura, senão o repouso. A abertura do dia acontece no
 * repouso: a maquete se constrói no quadro em que vai ficar.
 */
export function wantedFrame(input: WantedInput): { frame: CameraFrame; mode: CameraMode } {
  const { layout, s, nextS } = input;
  if (input.diving && !input.reducedMotion) {
    return { frame: diveCamera(layout, s, nextS), mode: 'mergulho' };
  }
  if (closeActive(input.close, input.now)) {
    return { frame: followCamera({ layout, s, nextS, parked: input.parked }), mode: 'perto' };
  }
  return { frame: input.rest, mode: 'repouso' };
}

// ------------------------------------------------------------------ a suavização
/** A diferença entre dois ângulos pelo arco menor, em (−π, π]. */
function arc(from: number, to: number): number {
  const d = (to - from) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d <= -Math.PI ? d + 2 * Math.PI : d;
}

/**
 * Aproxima o enquadramento atual do desejado por `k` (0 a 1; 1 é cortar), o `yaw` pelo arco menor.
 * Devolve o novo enquadramento e se ainda está a caminho.
 */
export function approachFrame(
  view: CameraFrame,
  want: CameraFrame,
  k: number,
): { view: CameraFrame; moving: boolean } {
  const step = (a: number, b: number) => a + (b - a) * k;
  const yaw0 = view.yaw ?? 0;
  const yaw1 = want.yaw ?? 0;
  const next: CameraFrame = {
    target: [
      step(view.target[0], want.target[0]),
      step(view.target[1], want.target[1]),
      step(view.target[2], want.target[2]),
    ],
    distance: step(view.distance, want.distance),
    tilt: step(view.tilt, want.tilt),
    yaw: yaw0 + arc(yaw0, yaw1) * k,
    fov: step(view.fov, want.fov),
  };
  const far = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  const moving =
    far(next.target[0], want.target[0], 0.05) ||
    far(next.target[1], want.target[1], 0.05) ||
    far(next.target[2], want.target[2], 0.05) ||
    far(next.distance, want.distance, 0.05) ||
    far(next.tilt, want.tilt, 0.001) ||
    Math.abs(arc(next.yaw ?? 0, yaw1)) > 0.001 ||
    far(next.fov, want.fov, 0.01);
  return moving ? { view: next, moving } : { view: want, moving: false };
}
