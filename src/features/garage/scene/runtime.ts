import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
} from 'three/webgpu';
import type { CarModel } from '@shared/constants.ts';
import { buildCar, type CarRig, type CarSpec } from '@/art/cars/index.ts';
import { createContactShadowTexture } from '@/art/textures.ts';
import { dimensions } from '@/art/cars/profile.ts';
import { PROFILES } from '@/art/cars/profiles/index.ts';
import {
  DISC,
  dragTilt,
  dragYaw,
  fitDistance,
  grab,
  lockAxis,
  pinch,
  release,
  releaseVelocity,
  resume,
  startDisc,
  stepDisc,
  wheel,
  type Disc,
  type DiscEnv,
} from '../disc.ts';
import { sameCar } from '../rules.ts';
import { shortestTurn, SWAP, swapPose } from '../swap.ts';

/**
 * O estado do palco da garagem, mutável e fora do React: o disco (giro, inércia, inclinação e
 * zoom), a câmera, o carro em cena e a troca de modelo, mais o gesto do dedo. O laço único da cena
 * chama `step` e `applyCamera` a cada quadro e só pede o próximo enquanto algo se move. Toda escrita
 * passa por um método: o React Compiler trata props e valores de hooks como imutáveis, e esta é a
 * única caixa mutável da garagem. O carro 3D nasce em `attach` (a cena montou) e morre em `detach`
 * (a cena desmontou, inclusive na dupla montagem do StrictMode e na troca de motor); fora disso, a
 * classe só guarda o que mostrar.
 */
export const GARAGE_FOV = 34;
/** a câmera olha o carro a 45°, de três quartos, como no protótipo */
const AZIMUTH = Math.PI / 4;
const TARGET_Y = 0.82;
/** a altura do topo do disco, onde as rodas apoiam */
export const DISC_TOP = 0.12;
/** o raio que a câmera enquadra: o carro mais longo girando, com folga */
const FRAME_RADIUS = 3.15;
/** para onde os carros saem na troca: a direita da tela, vista do azimute da câmera */
const RIGHT = new Vector3(Math.cos(AZIMUTH), 0, -Math.sin(AZIMUTH));
/** a direção do nariz de quem anda para a direita da tela (rotation.y do grupo do carro) */
const EXIT_YAW = Math.atan2(RIGHT.x, RIGHT.z);

export type ShowOptions = {
  animate: boolean;
  /** o acessório pedido assentou: som de encaixe e vibração */
  onSeat?: () => void;
  /** uma troca de modelo começou: o ronco curto */
  onSwap?: () => void;
};

/**
 * A troca tem duas fases. `prepare`: o carro novo, montado pela primeira vez nesta visita, fica logo
 * abaixo do piso enquanto o renderer compila os shaders dele e desenha um quadro com ele, criando
 * os objetos de render dos três passes (principal, sombra e reflexo); o custo cai no instante do
 * toque. `run`: a animação, já sem nada para montar. Um
 * modelo que já passou pelo disco nesta visita volta do estacionamento e vai direto para `run`.
 */
type Swap = {
  phase: 'prepare' | 'run';
  /** 0 compilando; 1 pronto para o quadro de aquecimento; 2 aquecido */
  warm: 0 | 1 | 2;
  t0: number | null;
  leaving: { rig: CarRig; yaw0: number; travel: number } | null;
  entering: { rig: CarRig; offset: number };
  opts: ShowOptions;
};

/**
 * Onde o carro novo aquece: em tamanho real, logo abaixo do piso opaco, dentro das câmeras (a
 * principal, a da sombra e a do reflexo) mas escondido pela profundidade.
 */
const WARM_Y = -3.4;

export type Compile = (object: Object3D) => Promise<void>;

type Pointer = { x: number; y: number; x0: number; y0: number };

export class GarageRuntime {
  /** o palco no espaço do mundo: o disco que gira e quem está saindo ou entrando */
  readonly stage = new Group();
  /** gira com o disco: o carro em cena fica aqui */
  readonly turntable = new Group();
  private disc: Disc;
  private env: DiscEnv;
  private rig: CarRig | null = null;
  private shown: CarSpec;
  private swap: Swap | null = null;
  private fit = 10;
  private invalidateFn: () => void = () => undefined;
  private compileFn: Compile | null = null;
  /** os carros que já passaram pelo disco nesta visita, fora de cena, prontos para voltar */
  private readonly parked = new Map<CarModel, CarRig>();
  private readonly shadows = new Map<CarRig, Mesh>();
  private shadowTexture: Texture | null = null;
  private shadowGeometry: PlaneGeometry | null = null;
  // o gesto
  private readonly pointers = new Map<number, Pointer>();
  private axis: 'yaw' | 'tilt' | null = null;
  private samples: [number, number][] = [];
  private pinchStart: { spread: number; zoom: number } | null = null;
  private size = { width: 1, height: 1 };

  constructor(car: CarSpec, now: number, env: DiscEnv) {
    this.env = env;
    this.disc = startDisc(now, env);
    this.shown = car;
    this.stage.add(this.turntable);
  }

  /** A cena montou: o palco entra nela e o carro de agora é montado no disco. */
  attach(parent: Object3D): void {
    if (this.rig) return;
    this.shadowTexture = createContactShadowTexture();
    this.shadowGeometry = new PlaneGeometry(1, 1);
    this.rig = this.makeRig(this.shown);
    this.mount(this.rig, 0);
    parent.add(this.stage);
    this.disc = resume(this.disc, performance.now(), this.env);
    this.invalidate();
  }

  /** A cena desmontou: descarta tudo o que é da GPU; o estado do disco e o carro ficam. */
  detach(): void {
    this.finishSwap();
    if (this.rig) this.dropRig(this.rig);
    this.rig = null;
    for (const rig of this.parked.values()) this.dropRig(rig);
    this.parked.clear();
    this.shadowTexture?.dispose();
    this.shadowGeometry?.dispose();
    this.shadowTexture = null;
    this.shadowGeometry = null;
    this.stage.removeFromParent();
  }

  bindInvalidate(fn: () => void): void {
    this.invalidateFn = fn;
  }

  /** O renderer compila um objeto antes de ele aparecer (`compileAsync`). */
  bindCompile(fn: Compile | null): void {
    this.compileFn = fn;
  }

  invalidate(): void {
    this.invalidateFn();
  }

  /** O carro de agora, para o diagnóstico e os testes. */
  get current(): CarSpec {
    return this.shown;
  }

  get state(): Disc {
    return this.disc;
  }

  get swapping(): boolean {
    return this.swap !== null;
  }

  // ------------------------------------------------------------------ o carro
  private makeRig(car: CarSpec): CarRig {
    const rig = buildCar(car, { wake: () => this.invalidate(), beams: false });
    if (this.shadowGeometry && this.shadowTexture) {
      // a sombra de contato anda com o carro (inclusive na troca): um degradê radial sob ele
      const d = dimensions(PROFILES[car.model]);
      const shadow = new Mesh(
        this.shadowGeometry,
        new MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(PROFILES[car.model].width + 0.9, d.length + 0.8, 1);
      shadow.position.y = 0.004;
      shadow.renderOrder = -1;
      rig.group.add(shadow);
      this.shadows.set(rig, shadow);
    }
    return rig;
  }

  private dropRig(rig: CarRig): void {
    const shadow = this.shadows.get(rig);
    if (shadow) {
      (shadow.material as MeshBasicMaterial).dispose();
      this.shadows.delete(rig);
    }
    rig.dispose();
  }

  /** Põe o carro no disco, com a direção dada no espaço do disco. */
  private mount(rig: CarRig, localYaw: number): void {
    rig.group.position.set(0, DISC_TOP, 0);
    rig.group.rotation.set(0, localYaw, 0);
    this.turntable.add(rig.group);
  }

  /**
   * Mostra um carro: mesmo modelo, troca cor, acessórios e placa no carro montado (com animação);
   * outro modelo, o atual sai rodando e o novo entra.
   */
  show(car: CarSpec, opts: ShowOptions): void {
    const prev = this.shown;
    if (sameCar(prev, car)) return;
    this.shown = car;
    if (!this.rig) return;
    if (car.model !== prev.model || this.swap) {
      this.finishSwap();
      if (car.model !== this.rig.model) {
        this.startSwap(car, opts);
        return;
      }
    }
    const rig = this.rig;
    if (car.color !== prev.color) rig.setColor(car.color, { animate: opts.animate });
    rig.setPlate(car.plate);
    const removed = prev.accessories.filter((k) => !car.accessories.includes(k));
    const added = car.accessories.filter((k) => !prev.accessories.includes(k));
    for (const k of removed) void rig.detach(k, { animate: opts.animate });
    added.forEach((k, i) => {
      const last = i === added.length - 1;
      void rig.attach(k, {
        animate: opts.animate,
        ...(last && opts.onSeat ? { onSeat: opts.onSeat } : {}),
      });
    });
    this.disc = resume(this.disc, performance.now(), this.env);
    this.invalidate();
  }

  private startSwap(car: CarSpec, opts: ShowOptions): void {
    const old = this.rig;
    if (!old) return;
    const parked = this.parked.get(car.model);
    let next: CarRig;
    if (parked) {
      this.parked.delete(car.model);
      next = parked;
      next.setColor(car.color);
      next.setAccessories(car.accessories);
      next.setPlate(car.plate);
    } else {
      next = this.makeRig(car);
    }
    this.rig = next;
    if (!opts.animate) {
      this.park(old);
      this.mount(next, EXIT_YAW - this.turntable.rotation.y);
      this.disc = resume(this.disc, performance.now(), this.env);
      this.invalidate();
      return;
    }
    const swap: Swap = {
      phase: 'prepare',
      warm: 0,
      t0: null,
      leaving: { rig: old, yaw0: 0, travel: 0 },
      entering: { rig: next, offset: -SWAP.distance },
      opts,
    };
    this.swap = swap;
    const compile = this.compileFn;
    if (parked || !compile) {
      this.runSwap(swap);
      return;
    }
    next.group.position.set(0, WARM_Y, 0);
    next.group.rotation.set(0, 0, 0);
    this.stage.add(next.group);
    void compile(next.group)
      .catch(() => undefined)
      .then(() => {
        if (this.swap !== swap || swap.phase !== 'prepare') return;
        swap.warm = 1;
        this.invalidate();
      });
  }

  /** Tira um carro de cena sem descartar: volta na hora se o modelo for escolhido de novo. */
  private park(rig: CarRig): void {
    rig.group.removeFromParent();
    rig.group.visible = true;
    this.parked.set(rig.model, rig);
  }

  /** O carro novo está pronto: o atual sai do disco para o palco e a animação começa. */
  private runSwap(swap: Swap): void {
    const old = swap.leaving?.rig;
    if (old && swap.leaving) {
      const yaw0 = this.turntable.rotation.y + old.group.rotation.y;
      old.group.removeFromParent();
      old.group.position.set(0, DISC_TOP, 0);
      old.group.rotation.set(0, yaw0, 0);
      this.stage.add(old.group);
      swap.leaving.yaw0 = yaw0;
    }
    const next = swap.entering.rig;
    next.group.visible = false;
    next.group.position.copy(RIGHT).multiplyScalar(-SWAP.distance).setY(DISC_TOP);
    next.group.rotation.set(0, EXIT_YAW, 0);
    if (!next.group.parent) this.stage.add(next.group);
    swap.phase = 'run';
    swap.opts.onSwap?.();
    this.invalidate();
  }

  private finishSwap(): void {
    const s = this.swap;
    if (!s) return;
    if (s.leaving) this.park(s.leaving.rig);
    const rig = s.entering.rig;
    rig.group.visible = true;
    rig.group.removeFromParent();
    this.mount(rig, EXIT_YAW - this.turntable.rotation.y);
    this.swap = null;
    this.disc = resume(this.disc, performance.now(), this.env);
  }

  private stepSwap(now: number): boolean {
    const s = this.swap;
    if (!s) return false;
    if (s.phase === 'prepare') {
      // o quadro de aquecimento desenha o carro novo minúsculo; no seguinte, a troca anda
      if (s.warm === 1) s.warm = 2;
      else if (s.warm === 2) this.runSwap(s);
      return s.warm > 0;
    }
    s.t0 ??= now;
    const pose = swapPose(now - s.t0);
    if (pose.out && s.leaving) {
      const { rig, yaw0 } = s.leaving;
      const turn = shortestTurn(yaw0, EXIT_YAW);
      rig.group.position.copy(RIGHT).multiplyScalar(pose.out.travel).setY(DISC_TOP);
      rig.group.rotation.y = yaw0 + turn * pose.out.steer;
      rig.roll(pose.out.travel - s.leaving.travel);
      s.leaving.travel = pose.out.travel;
    } else if (s.leaving) {
      this.park(s.leaving.rig);
      s.leaving = null;
    }
    if (pose.in) {
      const { rig } = s.entering;
      rig.group.visible = true;
      rig.group.position.copy(RIGHT).multiplyScalar(pose.in.offset).setY(DISC_TOP);
      rig.roll(pose.in.offset - s.entering.offset);
      s.entering.offset = pose.in.offset;
    }
    if (pose.done) this.finishSwap();
    return !pose.done;
  }

  // ------------------------------------------------------------------ ambiente
  setEnv(env: DiscEnv): void {
    this.env = env;
    if (env.reduced || env.hidden) this.disc = { ...this.disc, auto: false };
    this.invalidate();
  }

  setViewport(width: number, height: number): void {
    this.size = { width: Math.max(1, width), height: Math.max(1, height) };
    this.fit = fitDistance(FRAME_RADIUS, GARAGE_FOV, this.size.width / this.size.height);
    this.invalidate();
  }

  // ------------------------------------------------------------------ o gesto
  pointerDown(id: number, x: number, y: number, now: number): void {
    this.pointers.set(id, { x, y, x0: x, y0: y });
    if (this.pointers.size === 1) {
      this.axis = null;
      this.samples = [[now, this.disc.yaw]];
      this.disc = grab(this.disc, now);
    } else if (this.pointers.size === 2) {
      this.axis = null;
      this.pinchStart = { spread: this.spread(), zoom: this.disc.zoomGoal };
    }
    this.invalidate();
  }

  pointerMove(id: number, x: number, y: number, now: number): void {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (this.pointers.size >= 2 && this.pinchStart) {
      this.disc = pinch(this.disc, this.pinchStart.zoom, this.pinchStart.spread, this.spread());
    } else if (this.pointers.size === 1) {
      this.axis ??= lockAxis(x - p.x0, y - p.y0);
      if (this.axis === 'yaw') {
        this.disc = dragYaw(this.disc, dx, this.size.width);
        this.samples.push([now, this.disc.yaw]);
        if (this.samples.length > 12) this.samples.shift();
      } else if (this.axis === 'tilt') {
        this.disc = dragTilt(this.disc, dy, this.size.height);
      }
    }
    this.invalidate();
  }

  pointerUp(id: number, now: number): void {
    if (!this.pointers.delete(id)) return;
    if (this.pointers.size === 0) {
      const vel = this.axis === 'yaw' ? releaseVelocity(this.samples) : 0;
      this.disc = release(this.disc, vel, now, this.env);
      this.pinchStart = null;
      this.axis = null;
    } else if (this.pointers.size === 1) {
      // saiu um dos dedos do pinçar: o que ficou não vira arrasto no meio do caminho
      this.pinchStart = null;
      this.axis = 'tilt';
      for (const p of this.pointers.values()) {
        p.x0 = p.x;
        p.y0 = p.y;
      }
    }
    this.invalidate();
  }

  wheel(deltaY: number, now: number): void {
    this.disc = { ...wheel(this.disc, deltaY), lastTouch: now };
    this.invalidate();
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
  }

  // ------------------------------------------------------------------ o quadro
  /** Avança o disco, a troca e as animações do carro; `true` enquanto algo se move. */
  step(now: number, dt: number): boolean {
    const { disc, busy } = stepDisc(this.disc, dt, now, this.env);
    this.disc = disc;
    this.turntable.rotation.y = disc.yaw;
    const swapping = this.stepSwap(now);
    const carBusy = this.rig?.update(now) ?? false;
    const leavingBusy = this.swap?.leaving?.rig.update(now) ?? false;
    return busy || swapping || carBusy || leavingBusy;
  }

  applyCamera(camera: PerspectiveCamera): void {
    const d = this.fit * this.disc.zoom;
    const { tilt } = this.disc;
    camera.position.set(
      Math.sin(AZIMUTH) * Math.cos(tilt) * d,
      TARGET_Y + Math.sin(tilt) * d,
      Math.cos(AZIMUTH) * Math.cos(tilt) * d,
    );
    camera.lookAt(0, TARGET_Y, 0);
    if (camera.fov !== GARAGE_FOV || camera.far < 140) {
      camera.fov = GARAGE_FOV;
      camera.near = 0.1;
      camera.far = 140;
      camera.updateProjectionMatrix();
    }
  }

  /** A distância máxima da câmera, para o cenário cobrir o fundo em qualquer zoom. */
  get maxDistance(): number {
    return this.fit * DISC.zoomMax;
  }
}
