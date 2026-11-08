/**
 * O gesto do disco da garagem, puro. Num showroom quem gira é o carro: arrastar na horizontal gira
 * o disco (e o carro em cima dele) sob as luzes paradas, e o reflexo corre pela lataria; ao soltar,
 * a inércia leva a velocidade de volta ao giro lento sozinho (ou a zero). Arrastar na vertical
 * inclina a câmera numa faixa curta; pinçar aproxima dentro de limites relativos à distância que
 * enquadra o carro no palco. O giro sozinho começa ao entrar e depois de cada troca, e para depois de
 * 20 s sem toque, com a aba escondida e sob reduzir movimento (sem inércia também). Parado e
 * assentado, `stepDisc` diz que não precisa de quadros.
 */
export const DISC = {
  /** rad/s do giro sozinho: uma volta a cada 18 s */
  autoSpeed: 0.35,
  idleMs: 20_000,
  /** um arrasto da largura do palco gira 225° */
  yawPerWidth: 1.25 * Math.PI,
  /** constante de tempo da inércia (s) */
  inertiaTau: 0.6,
  maxVel: 6,
  tiltMin: (6 * Math.PI) / 180,
  tiltMax: (30 * Math.PI) / 180,
  tiltStart: (14 * Math.PI) / 180,
  /** um arrasto da altura do palco percorre a faixa inteira de inclinação */
  tiltPerHeight: (24 * Math.PI) / 180,
  /** zoom relativo à distância que enquadra o carro */
  zoomMin: 0.68,
  zoomMax: 1.35,
  /** suavização da câmera (s) */
  smoothTau: 0.12,
  axisLockPx: 10,
  sampleMs: 100,
} as const;

export type Disc = {
  yaw: number;
  vel: number;
  tilt: number;
  tiltGoal: number;
  /** fator de zoom: 1 enquadra o carro */
  zoom: number;
  zoomGoal: number;
  auto: boolean;
  lastTouch: number;
  dragging: boolean;
};

export type DiscEnv = {
  reduced: boolean;
  hidden: boolean;
  /** quanto tempo o giro sozinho dura sem toque; o padrão é o do showroom (20 s), o cartão de conquista usa menos (fase 13) */
  idleMs?: number;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function startDisc(now: number, env: DiscEnv): Disc {
  const auto = !env.reduced && !env.hidden;
  return {
    yaw: 0,
    vel: auto ? DISC.autoSpeed : 0,
    tilt: DISC.tiltStart,
    tiltGoal: DISC.tiltStart,
    zoom: 1,
    zoomGoal: 1,
    auto,
    lastTouch: now,
    dragging: false,
  };
}

/** O dedo encostou: o disco para de girar sozinho enquanto ele arrasta. */
export function grab(d: Disc, now: number): Disc {
  return { ...d, dragging: true, vel: 0, lastTouch: now };
}

export function dragYaw(d: Disc, dxPx: number, widthPx: number): Disc {
  return { ...d, yaw: d.yaw + (dxPx / Math.max(1, widthPx)) * DISC.yawPerWidth };
}

/** Arrastar para baixo sobe a câmera (olha mais de cima), dentro da faixa. */
export function dragTilt(d: Disc, dyPx: number, heightPx: number): Disc {
  const tiltGoal = clamp(
    d.tiltGoal + (dyPx / Math.max(1, heightPx)) * DISC.tiltPerHeight,
    DISC.tiltMin,
    DISC.tiltMax,
  );
  return { ...d, tiltGoal };
}

/** Pinçar: `spread0` e `spread` em px; afastar os dedos aproxima. */
export function pinch(d: Disc, zoomAtStart: number, spread0: number, spread: number): Disc {
  const zoomGoal = clamp(
    zoomAtStart * (Math.max(1, spread0) / Math.max(1, spread)),
    DISC.zoomMin,
    DISC.zoomMax,
  );
  return { ...d, zoomGoal };
}

export function wheel(d: Disc, deltaY: number): Disc {
  const zoomGoal = clamp(d.zoomGoal * (1 + Math.sign(deltaY) * 0.08), DISC.zoomMin, DISC.zoomMax);
  return { ...d, zoomGoal };
}

/** A velocidade do arrasto nos últimos 100 ms: de onde a inércia parte. */
export function releaseVelocity(samples: readonly (readonly [t: number, yaw: number])[]): number {
  const last = samples[samples.length - 1];
  if (!last) return 0;
  const recent = samples.filter(([t]) => last[0] - t <= DISC.sampleMs);
  const first = recent[0];
  if (!first || last[0] - first[0] < 8) return 0;
  const v = ((last[1] - first[1]) / (last[0] - first[0])) * 1000;
  return clamp(v, -DISC.maxVel, DISC.maxVel);
}

/** O dedo saiu: a inércia começa; sob reduzir movimento, o disco fica onde o dedo deixou. */
export function release(d: Disc, vel: number, now: number, env: DiscEnv): Disc {
  return {
    ...d,
    dragging: false,
    vel: env.reduced ? 0 : vel,
    auto: !env.reduced && !env.hidden,
    lastTouch: now,
  };
}

/** Depois de uma troca: o giro lento recomeça e a janela de 20 s volta a contar. */
export function resume(d: Disc, now: number, env: DiscEnv): Disc {
  return { ...d, auto: !env.reduced && !env.hidden, lastTouch: now };
}

/** Avança um quadro. `busy` diz se a cena ainda se move. */
export function stepDisc(
  d: Disc,
  dt: number,
  now: number,
  env: DiscEnv,
): { disc: Disc; busy: boolean } {
  let auto =
    d.auto && !env.reduced && !env.hidden && now - d.lastTouch < (env.idleMs ?? DISC.idleMs);
  if (d.dragging) auto = false;
  let { vel, yaw } = d;
  if (!d.dragging) {
    const target = auto ? DISC.autoSpeed : 0;
    if (env.reduced) vel = 0;
    else vel += (target - vel) * (1 - Math.exp(-dt / DISC.inertiaTau));
    if (Math.abs(vel - target) < 0.004) vel = target;
    yaw += vel * dt;
  }
  const k = env.reduced ? 1 : 1 - Math.exp(-dt / DISC.smoothTau);
  let tilt = d.tilt + (d.tiltGoal - d.tilt) * k;
  let zoom = d.zoom + (d.zoomGoal - d.zoom) * k;
  if (Math.abs(tilt - d.tiltGoal) < 1e-4) tilt = d.tiltGoal;
  if (Math.abs(zoom - d.zoomGoal) < 1e-4) zoom = d.zoomGoal;
  const settled = tilt === d.tiltGoal && zoom === d.zoomGoal;
  const busy = (!d.dragging && vel !== 0) || !settled;
  return { disc: { ...d, auto, vel, yaw, tilt, zoom }, busy };
}

/**
 * A distância da câmera que enquadra um círculo de raio `radius` (o carro girando) no palco, pelo
 * campo de visão vertical e a proporção do palco: no retrato, quem limita é a largura.
 */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const vHalf = (fovDeg * Math.PI) / 360;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.2, aspect));
  return radius / Math.sin(Math.min(vHalf, hHalf));
}

/** Para onde o dedo está indo nos primeiros 10 px: girar ou inclinar, travado até soltar. */
export function lockAxis(dx: number, dy: number): 'yaw' | 'tilt' | null {
  if (Math.hypot(dx, dy) < DISC.axisLockPx) return null;
  return Math.abs(dx) >= Math.abs(dy) ? 'yaw' : 'tilt';
}
