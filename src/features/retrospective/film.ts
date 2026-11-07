import type { CameraFrame } from '@/features/world/math.ts';
import { easeInOut, sAt, type FilmPlan } from './rules.ts';

/**
 * O relógio e a câmera do filme. O relógio é um só para a cena 3D e para o desenho por cima (os dois
 * leem o mesmo `t`); no app ele anda com o tempo real, na exportação ele é posto quadro a quadro
 * (t = n / 30 s), então o vídeo nunca engasga, mesmo num celular que desenha a maquete devagar.
 *
 * A câmera é a única que percorre o caminho no app (6.7): desce do quadro da viagem inteira até o
 * carro na abertura, segue o carro no sobrevoo e sobe um pouco no fim, com o carro estacionado na
 * metade de cima da tela, acima do card final. É função pura de `t`: o mesmo quadro sempre.
 */
export class FilmClock {
  readonly duration: number;
  private startedAt: number | null = null;
  private held = 0;

  constructor(duration: number) {
    this.duration = duration;
  }

  /** O instante do filme agora (ms): parado, o último instante mostrado. */
  t(now: number): number {
    if (this.startedAt === null) return this.held;
    return Math.min(this.duration, now - this.startedAt);
  }

  get playing(): boolean {
    return this.startedAt !== null;
  }

  play(now: number, from = 0): void {
    this.startedAt = now - from;
  }

  /** Para no instante `t` (o "Pular" para no card final; a exportação põe cada quadro). */
  hold(t: number): void {
    this.startedAt = null;
    this.held = Math.min(this.duration, Math.max(0, t));
  }

  /** Terminou de tocar: fica parado no último quadro. */
  settle(now: number): boolean {
    if (this.startedAt === null) return false;
    if (now - this.startedAt < this.duration) return false;
    this.hold(this.duration);
    return true;
  }
}

/** A distância e a inclinação de quem segue o carro: perto o bastante para ver o cenário passar. */
export const FOLLOW = { distance: 92, tilt: (54 * Math.PI) / 180 } as const;
/** No fim, a câmera sobe e o carro fica na metade de cima (o card ocupa a de baixo). */
export const PARKED = { distance: 128, tilt: (60 * Math.PI) / 180, lift: 34 } as const;

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function mix(a: CameraFrame, b: CameraFrame, k: number): CameraFrame {
  return {
    target: [
      lerp(a.target[0], b.target[0], k),
      lerp(a.target[1], b.target[1], k),
      lerp(a.target[2], b.target[2], k),
    ],
    distance: lerp(a.distance, b.distance, k),
    tilt: lerp(a.tilt, b.tilt, k),
    fov: lerp(a.fov, b.fov, k),
  };
}

type PathLike = {
  camera: CameraFrame;
  pathAt: (s: number) => { x: number; y: number; z: number };
};

/** O enquadramento do filme num instante: a viagem inteira, depois o carro, depois o carro parado. */
export function filmCamera(layout: PathLike, plan: FilmPlan, t: number): CameraFrame {
  const s = sAt(plan, t);
  const p = layout.pathAt(s);
  const follow: CameraFrame = {
    target: [p.x, p.y, p.z],
    distance: FOLLOW.distance,
    tilt: FOLLOW.tilt,
    fov: layout.camera.fov,
  };
  if (t < plan.opening.t1) {
    // a viagem inteira de cima, descendo até o carro no começo do caminho
    const k = easeInOut(t / plan.opening.t1);
    return mix(layout.camera, follow, k);
  }
  if (t > plan.final.t0) {
    // o carro estaciona e a câmera sobe, com o alvo puxado para perto: o carro sobe na tela
    const parked: CameraFrame = {
      target: [p.x, p.y, p.z + PARKED.lift],
      distance: PARKED.distance,
      tilt: PARKED.tilt,
      fov: layout.camera.fov,
    };
    return mix(follow, parked, easeInOut((t - plan.final.t0) / 900));
  }
  return follow;
}
