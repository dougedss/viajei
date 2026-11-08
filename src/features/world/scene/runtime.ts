import type { OpeningPlan } from '../opening.ts';
import type { MotionController } from '../motion.ts';
import type { WorldLayout } from '../layout.ts';
import type { CarPlacement } from '../car-position.ts';
import type { CameraFrame } from '../math.ts';
import { projectWorld } from '../project.ts';

/**
 * O estado compartilhado entre a cena e o HUD, mutável e fora do React: o que muda a cada quadro
 * (posição do carro, noite, abertura, mergulho) vive aqui e é lido pelo laço da cena, que redesenha
 * só enquanto algo se move. O React só recebe os eventos discretos (deixas, fim de movimento).
 * Toda escrita passa por um método: o React Compiler trata props e valores de hooks como imutáveis,
 * e esta é a única caixa mutável da maquete.
 */
export type Updater = (ctx: { now: number; dt: number }) => void;

export type Opening = { plan: OpeningPlan; startedAt: number };

export class WorldRuntime {
  layout: WorldLayout;
  readonly motion: MotionController;
  /** 0 = dia, 1 = noite; `target` é para onde a interpolação vai */
  readonly night: { t: number; target: number };
  opening: Opening | null = null;
  /** o carro está fora da rota: deslocamento perpendicular e a distância */
  offRoute: CarPlacement['offRoute'] = null;
  /** distância atual da câmera ao alvo */
  cameraDistance: number;
  /** o enquadramento atual, já suavizado (a câmera segue o carro, fase 14): o HUD projeta por ele */
  view: CameraFrame;
  /** o tamanho do palco em px, para projetar */
  viewport: { width: number; height: number } = { width: 1, height: 1 };
  /** algum objeto ainda está em transição e quer mais um quadro; o laço zera antes de cada quadro */
  needsFrame = false;
  private readonly updaters = new Set<Updater>();
  private invalidateFn: () => void = () => undefined;

  constructor(layout: WorldLayout, motion: MotionController, night: boolean) {
    this.layout = layout;
    this.motion = motion;
    this.night = { t: night ? 1 : 0, target: night ? 1 : 0 };
    this.cameraDistance = layout.camera.distance;
    this.view = { ...layout.camera, target: [...layout.camera.target] };
  }

  /** O R3F entrega o `invalidate` quando o Canvas nasce. */
  bindInvalidate(fn: () => void): void {
    this.invalidateFn = fn;
  }

  /** Pede um quadro ao R3F. */
  invalidate(): void {
    this.invalidateFn();
  }

  setLayout(layout: WorldLayout): void {
    this.layout = layout;
    this.cameraDistance = layout.camera.distance;
  }

  setNight(night: boolean): void {
    this.night.target = night ? 1 : 0;
  }

  /** Avança a interpolação dia/noite e devolve o valor atual (0 a 1). */
  stepNight(k: number, instant: boolean): number {
    const n = this.night;
    n.t = instant ? n.target : n.t + (n.target - n.t) * k;
    if (Math.abs(n.t - n.target) <= 0.002) n.t = n.target;
    return n.t;
  }

  setOpening(opening: Opening | null): void {
    this.opening = opening;
  }

  setOffRoute(offRoute: CarPlacement['offRoute']): void {
    this.offRoute = offRoute;
  }

  setCameraDistance(distance: number): void {
    this.cameraDistance = distance;
  }

  /** A câmera gravou o enquadramento deste quadro. */
  setView(view: CameraFrame): void {
    this.view = view;
    this.cameraDistance = view.distance;
  }

  setViewport(viewport: { width: number; height: number }): void {
    this.viewport = viewport;
  }

  /** Um ponto do mundo em px do palco, pelo enquadramento atual. */
  project(point: [number, number, number]): ReturnType<typeof projectWorld> {
    return projectWorld(this.view, this.viewport, point);
  }

  /** Um objeto da cena pede mais um quadro (transição em curso). */
  requestFrame(): void {
    this.needsFrame = true;
  }

  /** O laço começa um quadro: ninguém pediu o próximo ainda. */
  beginFrame(): void {
    this.needsFrame = false;
  }

  /** Registra um atualizador por quadro; devolve a função que o remove. */
  register(updater: Updater): () => void {
    this.updaters.add(updater);
    return () => {
      this.updaters.delete(updater);
    };
  }

  runUpdaters(ctx: { now: number; dt: number }): void {
    for (const u of this.updaters) u(ctx);
  }

  /** A cena está em movimento: algo precisa de mais um quadro. */
  busy(now: number): boolean {
    if (this.motion.busy || this.needsFrame) return true;
    if (Math.abs(this.night.t - this.night.target) > 0.002) return true;
    return this.opening !== null && now - this.opening.startedAt < this.opening.plan.total_ms + 100;
  }

  /** Quanto tempo passou da abertura; infinito quando não há abertura em curso. */
  openingElapsed(now: number): number {
    if (!this.opening) return Number.POSITIVE_INFINITY;
    return now - this.opening.startedAt;
  }
}
