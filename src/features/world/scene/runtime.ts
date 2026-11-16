import type { OpeningPlan } from '../opening.ts';
import type { MotionController } from '../motion.ts';
import type { WorldLayout } from '../layout.ts';
import type { CarPlacement } from '../car-position.ts';
import { tapCar, type CameraMode, type CloseMode } from '../camera.ts';
import type { CameraFrame } from '../math.ts';
import { projectWorld } from '../project.ts';

/**
 * O estado compartilhado entre a cena e o HUD, mutável e fora do React: o que muda a cada quadro
 * (posição do carro, noite, abertura, mergulho, o modo de perto, o enquadramento) vive aqui e é lido
 * pelo laço da cena, que redesenha só enquanto algo se move. O React só recebe os eventos discretos
 * (deixas, fim de movimento, o modo da câmera). Toda escrita passa por um método: o React Compiler
 * trata props e valores de hooks como imutáveis, e esta é a única caixa mutável da maquete.
 */
export type Updater = (ctx: { now: number; dt: number }) => void;

export type Opening = { plan: OpeningPlan; startedAt: number };

/**
 * O que o palco diz da câmera por fora (`data-world-camera` e `data-world-camera-settled`): o modo
 * que o rig decidiu e se a imagem já chegou lá. Numa máquina que leva segundos por quadro, o modo
 * muda bem antes de o canvas mostrar o quadro novo (a captura de perto da produção na D223 saiu igual
 * ao repouso): quem fotografa espera os dois.
 */
export type CameraStatus = { mode: CameraMode; settled: boolean };

type Raf = (callback: () => void) => unknown;
const raf: Raf = (callback) =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(callback)
    : setTimeout(callback, 16);

export class WorldRuntime {
  layout: WorldLayout;
  readonly motion: MotionController;
  /** 0 = dia, 1 = noite; `target` é para onde a interpolação vai */
  readonly night: { t: number; target: number };
  opening: Opening | null = null;
  /** o carro está fora da rota: deslocamento perpendicular e a distância */
  offRoute: CarPlacement['offRoute'] = null;
  /** o quadro de repouso: o dia inteiro, pelo palco e pela altura medida (fase 22) */
  rest: CameraFrame;
  /** o modo de perto em curso, ligado pelo toque no carro */
  close: CloseMode = null;
  /** o modo visual da câmera, como o rig o decidiu no último quadro */
  cameraMode: CameraMode = 'repouso';
  /** o último quadro já é o do enquadramento desejado e o canvas já o apresentou */
  cameraSettled = false;
  /** o enquadramento atual, já suavizado: o HUD projeta por ele; o carro e os anéis escalam por ele */
  view: CameraFrame;
  /** o tamanho do palco em px, para projetar */
  viewport: { width: number; height: number } = { width: 1, height: 1 };
  /** algum objeto ainda está em transição e quer mais um quadro; o laço zera antes de cada quadro */
  needsFrame = false;
  private readonly updaters = new Set<Updater>();
  private readonly cameraListeners = new Set<(status: CameraStatus) => void>();
  /** muda a cada quadro em que a câmera anda: a espera dos dois quadros só vale se nada andou */
  private settleToken = 0;
  private settlePending = false;
  private invalidateFn: () => void = () => undefined;

  constructor(layout: WorldLayout, motion: MotionController, night: boolean, rest: CameraFrame) {
    this.layout = layout;
    this.motion = motion;
    this.night = { t: night ? 1 : 0, target: night ? 1 : 0 };
    this.rest = rest;
    this.view = { ...rest, target: [...rest.target] };
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
  }

  /** O palco ou a altura medida mudaram: o repouso é outro, sem refazer o layout. */
  setRest(rest: CameraFrame): void {
    this.rest = rest;
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

  /** O toque no carro: o modo de perto por alguns segundos (um toque de novo estende). */
  enterClose(now: number): void {
    this.close = tapCar(now);
    this.invalidate();
  }

  /** Um toque fora do carro, ou o tempo que acabou: volta ao repouso. */
  leaveClose(): void {
    if (this.close === null) return;
    this.close = null;
    this.invalidate();
  }

  /** O rig decidiu o modo deste quadro; quem ouve (o React) só é avisado quando muda. */
  setCameraMode(mode: CameraMode): void {
    if (mode === this.cameraMode) return;
    this.cameraMode = mode;
    // um modo novo é um enquadramento novo: a imagem ainda não chegou lá
    this.settleToken += 1;
    this.cameraSettled = false;
    this.emitCamera();
  }

  /**
   * O rig suavizou este quadro: `moving` enquanto ainda não chegou ao desejado. Parada, a câmera só
   * conta como assentada dois quadros de animação depois: o primeiro vem depois de o quadro final ser
   * desenhado, o segundo depois de o compositor o apresentar. Andou de novo no meio, a espera recomeça.
   */
  cameraMoved(moving: boolean): void {
    if (moving) {
      this.settleToken += 1;
      if (this.cameraSettled) {
        this.cameraSettled = false;
        this.emitCamera();
      }
      return;
    }
    if (this.cameraSettled || this.settlePending) return;
    this.settlePending = true;
    const token = this.settleToken;
    raf(() =>
      raf(() => {
        this.settlePending = false;
        if (token !== this.settleToken || this.cameraSettled) return;
        this.cameraSettled = true;
        this.emitCamera();
      }),
    );
  }

  onCamera(listener: (status: CameraStatus) => void): () => void {
    this.cameraListeners.add(listener);
    return () => {
      this.cameraListeners.delete(listener);
    };
  }

  private emitCamera(): void {
    const status: CameraStatus = { mode: this.cameraMode, settled: this.cameraSettled };
    for (const l of this.cameraListeners) l(status);
  }

  /** A câmera gravou o enquadramento deste quadro. */
  setView(view: CameraFrame): void {
    this.view = view;
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
    // o modo de perto conta o tempo pelo laço: enquanto dura, a cena fica viva
    if (this.close !== null && now < this.close.until + 100) return true;
    return this.opening !== null && now - this.opening.startedAt < this.opening.plan.total_ms + 100;
  }

  /** Quanto tempo passou da abertura; infinito quando não há abertura em curso. */
  openingElapsed(now: number): number {
    if (!this.opening) return Number.POSITIVE_INFINITY;
    return now - this.opening.startedAt;
  }
}
