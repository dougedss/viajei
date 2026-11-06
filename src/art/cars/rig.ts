import type { CarAccessoryKey, CarColor } from '@shared/constants.ts';
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SpotLight,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Texture,
} from 'three/webgpu';
import { createPlateTexture, plateText } from '../textures.ts';
import { StaticBatch } from './batch.ts';
import { Kit } from './kit.ts';
import {
  carMaterials,
  clonePaint,
  createPaint,
  lerpPaint,
  paintState,
  type CarMaterials,
  type Paint,
  type PaintState,
} from './materials.ts';
import { dropPose, outPose, paintProgress, popPose, type Pose } from './motion.ts';
import {
  anchorObjects,
  buildAntenna,
  buildFogLights,
  buildHubcaps,
  buildRack,
  buildRoofItem,
  buildSticker,
  placeLane,
  placeSticker,
  restOf,
  type Part,
} from './parts.ts';
import {
  isLaneItem,
  isStickerKey,
  knownKeys,
  placeAccessories,
  type Placement,
} from './placement.ts';
import { archOf, archRadius, outline, type CarProfile, type PathCmd, type Pt } from './profile.ts';
import type { AttachOptions, BuildOptions, CarRig, CarSpec, RigAnchors } from './types.ts';

function shapeOf(cmds: readonly PathCmd[]): Shape {
  const s = new Shape();
  for (const c of cmds) {
    if (c.op === 'M') s.moveTo(c.to[0], c.to[1]);
    else if (c.op === 'L') s.lineTo(c.to[0], c.to[1]);
    else if (c.op === 'Q') s.quadraticCurveTo(c.c[0], c.c[1], c.to[0], c.to[1]);
    else s.absarc(c.center[0], c.center[1], c.r, c.from, c.to, false);
  }
  return s;
}

function smooth(a: number, b: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

type Anim = {
  key: CarAccessoryKey;
  dir: 'in' | 'out';
  t0: number | null;
  seated: boolean;
  onSeat: (() => void) | undefined;
  resolve: () => void;
};

/**
 * Um carro montado a partir do perfil. Estado mutável da cena numa classe com métodos (o React
 * Compiler trata o resto como imutável): a tinta, as peças dos acessórios (montadas na primeira
 * vez que aparecem), o encaixe atual com memória das faixas e as animações em curso.
 */
class ProfileRig implements CarRig {
  readonly model: CarRig['model'];
  readonly group = new Group();
  readonly wheels: Group[] = [];
  readonly anchors: RigAnchors;
  readonly headMat: MeshStandardMaterial;
  readonly tailMat: MeshStandardMaterial;
  private readonly inner = new Group();
  private readonly kit = new Kit();
  private readonly batch = new StaticBatch();
  private readonly mats: CarMaterials;
  private readonly paintKit: Paint;
  private readonly spots: SpotLight[] = [];
  private readonly parts = new Map<CarAccessoryKey, Part>();
  private readonly anims = new Map<CarAccessoryKey, Anim>();
  private readonly plateMat: MeshStandardMaterial;
  private readonly plateMesh: Mesh;
  private readonly defaultPlate: Texture;
  private tripPlate: Texture | null = null;
  private plateLabel: string | null;
  private plateOn = false;
  private selected: CarAccessoryKey[] = [];
  private placement: Placement;
  private tween: { from: PaintState; to: PaintState; t0: number | null; now: PaintState } | null =
    null;
  private disposed = false;
  private readonly wake: () => void;

  private readonly profile: CarProfile;

  constructor(profile: CarProfile, spec: CarSpec, opts: BuildOptions) {
    this.profile = profile;
    this.model = profile.model;
    this.group.name = `car:${profile.model}`;
    this.wake = opts.wake ?? (() => undefined);
    this.plateLabel = spec.plate;
    // o perfil olha para +x; o grupo, para +z, como a maquete espera (`lookAt` na estrada)
    this.inner.rotation.y = -Math.PI / 2;
    this.group.add(this.inner);
    this.mats = carMaterials();
    this.headMat = this.mats.head;
    this.tailMat = this.mats.tail;
    this.paintKit = createPaint(profile, spec.color);

    this.buildBody();
    this.buildGlass();
    this.buildDetails();
    const quiet = new Set<Material>([
      this.mats.glass,
      this.mats.head,
      this.mats.tail,
      this.mats.liner,
    ]);
    for (const mesh of this.batch.bake(this.kit, quiet)) this.inner.add(mesh);
    this.buildWheels();
    if (opts.beams ?? true) this.buildNightLights();

    this.defaultPlate = this.kit.own(createPlateTexture());
    this.plateMat = this.kit.own(
      new MeshStandardMaterial({ map: this.defaultPlate, roughness: 0.6 }),
    );
    const plate = new Mesh(this.kit.own(new PlaneGeometry(0.5, 0.14)), this.plateMat);
    const [px, py] = profile.anchors.rearPlate;
    plate.position.set(px - profile.bevel - 0.006, py, 0);
    plate.rotation.y = -Math.PI / 2;
    this.inner.add(plate);
    this.plateMesh = plate;

    const marks = anchorObjects(profile, this.wheels);
    this.anchors = marks;
    this.inner.add(
      marks.roof,
      ...marks.lanes,
      marks.frontBumper,
      marks.rearPlate,
      ...marks.hubs,
      marks.antenna,
      ...marks.stickers.flatMap((s) => [s.near, s.far]),
    );

    this.placement = placeAccessories(profile, []);
    this.setAccessories(spec.accessories);
  }

  get paint() {
    return this.paintKit.body;
  }

  // ------------------------------------------------------------------ montagem
  private geo<T extends BufferGeometry>(g: T): T {
    return this.kit.own(g);
  }

  /** Uma peça parada: entra no lote, que vira uma malha por material no fim da montagem. */
  private add(mesh: Mesh): Mesh {
    this.batch.addMesh(mesh);
    return mesh;
  }

  private box(size: [number, number, number], mat: Material, at: [number, number, number]): Mesh {
    const m = new Mesh(
      this.kit.geometry(`box-${size.join('x')}`, () => new BoxGeometry(...size)),
      mat,
    );
    m.position.set(...at);
    return this.add(m);
  }

  private buildBody(): void {
    const p = this.profile;
    const depth = p.width - 2 * p.bevel;
    const body = this.geo(
      new ExtrudeGeometry(shapeOf(outline(p)), {
        depth,
        bevelEnabled: true,
        bevelThickness: p.bevel,
        bevelSize: p.bevel,
        bevelSegments: 3,
        curveSegments: 12,
      }),
    );
    body.translate(0, 0, -depth / 2);
    this.add(new Mesh(body, this.paintKit.body));

    if (p.bed) {
      const { x0, x1, floor, top, wall } = p.bed;
      const len = x1 - (x0 - p.bevel);
      const h = top - floor;
      const cx = (x1 + x0 - p.bevel) / 2;
      for (const z of [p.width / 2 - wall / 2, -(p.width / 2 - wall / 2)]) {
        this.box([len, h, wall], this.paintKit.body, [cx, floor + h / 2, z]);
      }
      this.box([wall, h, p.width - 2 * wall], this.paintKit.body, [
        x0 - p.bevel + wall / 2,
        floor + h / 2,
        0,
      ]);
      const liner = new Mesh(
        this.geo(new PlaneGeometry(len - wall, p.width - 2 * wall)),
        this.mats.liner,
      );
      liner.rotation.x = -Math.PI / 2;
      liner.position.set(cx + wall / 2, floor + p.bevel + 0.003, 0);
      this.add(liner);
    }

    if (p.wheels.flare > 0) {
      const R = archRadius(p);
      for (const cx of [p.wheels.front, p.wheels.rear]) {
        const arc = archOf(p, cx);
        const s = new Shape();
        s.absarc(cx, arc.center[1], R + p.wheels.flare, arc.from, arc.to, false);
        s.absarc(cx, arc.center[1], R - 0.02, arc.to, arc.from, true);
        s.closePath();
        const d = p.width + 0.05;
        const g = this.geo(
          new ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 20 }),
        );
        g.translate(0, 0, -d / 2);
        this.add(new Mesh(g, this.mats.trim));
      }
    }

    if (p.spare) {
      const r = p.wheels.radius * 0.82;
      const [sx, sy] = p.spare;
      const tire = new Mesh(
        this.kit.geometry('spare', () => new CylinderGeometry(r, r, 0.26, 24)),
        this.mats.rubber,
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sx - p.bevel - 0.13, sy, 0);
      this.add(tire);
      const cover = new Mesh(
        this.kit.geometry('spare-cover', () => new CylinderGeometry(r * 0.62, r * 0.62, 0.27, 20)),
        this.mats.trim,
      );
      cover.rotation.z = Math.PI / 2;
      cover.position.copy(tire.position);
      this.add(cover);
    }
  }

  /** Um vidro inclinado ao longo de um trecho do contorno, fora do chanfro. */
  private slopeGlass(from: Pt, to: Pt, width: number, z = 0): void {
    const p = this.profile;
    const [x1, y1] = from;
    const [x2, y2] = to;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.hypot(dx, dy);
    let nx = -dy / l;
    let ny = dx / l;
    if (ny < 0 || (ny === 0 && nx * (x1 + x2) < 0)) {
      nx = -nx;
      ny = -ny;
    }
    const off = p.bevel + 0.012;
    const m = new Mesh(this.geo(new PlaneGeometry(width, l - 0.08)), this.mats.glass);
    m.position.set((x1 + x2) / 2 + nx * off, (y1 + y2) / 2 + ny * off, z);
    m.rotation.set(0, -Math.PI / 2, Math.atan2(dy, dx) - Math.PI / 2, 'ZYX');
    this.add(m);
  }

  private buildGlass(): void {
    const p = this.profile;
    const side = p.width / 2 + 0.005;
    for (const win of p.glass.side) {
      const s = new Shape();
      win.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
      s.closePath();
      const g = this.geo(new ShapeGeometry(s));
      for (const z of [side, -side]) {
        const m = new Mesh(g, this.mats.glass);
        m.position.z = z;
        this.add(m);
      }
    }
    const w = p.width * 0.78;
    const ws = p.glass.windshield;
    if (ws.split) {
      const half = w / 2 - 0.05;
      this.slopeGlass(ws.from, ws.to, half, half / 2 + 0.05);
      this.slopeGlass(ws.from, ws.to, half, -(half / 2 + 0.05));
    } else {
      this.slopeGlass(ws.from, ws.to, w);
    }
    if (p.glass.rear) this.slopeGlass(p.glass.rear.from, p.glass.rear.to, w * 0.92);
  }

  private buildDetails(): void {
    const p = this.profile;
    const { lights, bevel } = p;
    const [hx, hy] = lights.head;
    const [tx, ty] = lights.tail;
    for (const z of [lights.headSpread, -lights.headSpread]) {
      if (lights.headRound) {
        const m = new Mesh(
          this.kit.geometry(
            'head-round',
            () => new CylinderGeometry(lights.headSize[0] / 2, lights.headSize[0] / 2, 0.06, 22),
          ),
          this.mats.head,
        );
        m.rotation.z = Math.PI / 2;
        m.position.set(hx + bevel, hy, z);
        this.add(m);
      } else {
        this.box([0.06, lights.headSize[0], lights.headSize[1]], this.mats.head, [
          hx + bevel,
          hy,
          z,
        ]);
      }
    }
    for (const z of [lights.tailSpread, -lights.tailSpread]) {
      this.box([0.05, lights.tailSize[0], lights.tailSize[1]], this.mats.tail, [tx - bevel, ty, z]);
    }
    if (p.grille) {
      const [gx, gy] = p.grille.at;
      this.box([0.04, p.grille.size[0], p.grille.size[1]], this.mats.dark, [gx + bevel, gy, 0]);
    }
    // no lote, o retrovisor da kombi cai na blusa pela altura, como a carroceria
    for (const z of [p.width / 2 + 0.06, -(p.width / 2 + 0.06)]) {
      this.box([0.12, 0.1, 0.18], this.paintKit.body, [p.mirror[0], p.mirror[1], z]);
      for (const [x, y] of p.handles) {
        this.box([0.16, 0.035, 0.02], this.mats.trim, [x, y, Math.sign(z) * (p.width / 2 + 0.008)]);
      }
    }
  }

  private buildWheels(): void {
    const p = this.profile;
    const { radius: r, tire: t } = p.wheels;
    const tireGeo = this.kit.geometry('tire', () => new CylinderGeometry(r, r, t, 28));
    const rimGeo = this.kit.geometry(
      'rim',
      () => new CylinderGeometry(r * 0.64, r * 0.64, t + 0.01, 14),
    );
    const hubGeo = this.kit.geometry(
      'hub',
      () => new CylinderGeometry(r * 0.2, r * 0.2, t + 0.03, 8),
    );
    const z = p.wheels.track / 2;
    for (const [x, wz] of [
      [p.wheels.front, z],
      [p.wheels.front, -z],
      [p.wheels.rear, z],
      [p.wheels.rear, -z],
    ] as const) {
      const w = new Group();
      w.position.set(x, r, wz);
      w.rotation.x = Math.PI / 2;
      const tire = new Mesh(tireGeo, this.mats.rubber);
      tire.castShadow = true;
      w.add(tire, new Mesh(rimGeo, this.mats.rim), new Mesh(hubGeo, this.mats.dark));
      this.inner.add(w);
      this.wheels.push(w);
    }
  }

  private buildNightLights(): void {
    const [hx, hy] = this.profile.lights.head;
    const spread = this.profile.lights.headSpread * 0.95;
    for (const z of [spread, -spread]) {
      const sp = new SpotLight(0xfff3d6, 0, 30, 0.42, 0.5, 1.2);
      sp.position.set(hx + this.profile.bevel, hy, z);
      sp.target.position.set(hx + 14, -0.5, z);
      this.inner.add(sp, sp.target);
      this.spots.push(sp);
    }
  }

  // ------------------------------------------------------------------ acessórios
  private part(key: CarAccessoryKey): Part {
    const hit = this.parts.get(key);
    if (hit) return hit;
    const p = this.profile;
    let part: Part;
    if (key === 'rack') part = buildRack(p, this.kit, this.mats);
    else if (isLaneItem(key)) part = buildRoofItem(key, p, this.kit, this.mats);
    else if (isStickerKey(key)) part = buildSticker(key, p, this.kit);
    else if (key === 'fog_lights') part = buildFogLights(p, this.kit, this.mats);
    else if (key === 'hubcaps') part = buildHubcaps(p, this.wheels, this.kit, this.mats);
    else if (key === 'antenna') part = buildAntenna(p, this.kit, this.mats);
    else {
      part = {
        kind: 'pop',
        objects: [this.plateMesh],
        apply: (on) => {
          this.plateOn = on;
          this.refreshPlate();
        },
      };
      this.plateMesh.userData.rest = {
        position: this.plateMesh.position.clone(),
        scale: this.plateMesh.scale.clone(),
      };
    }
    for (const o of part.objects) {
      if (!part.apply) {
        o.visible = false;
        if (key !== 'hubcaps') this.inner.add(o);
      }
    }
    this.parts.set(key, part);
    return part;
  }

  /** O que aparece com um encaixe: as chaves visíveis. */
  private visibleOf(pl: Placement): Set<CarAccessoryKey> {
    const on = new Set<CarAccessoryKey>();
    if (pl.rack) on.add('rack');
    for (const l of pl.lanes) if (l) on.add(l);
    for (const s of pl.stickers) if (s) on.add(s);
    if (pl.fogLights) on.add('fog_lights');
    if (pl.hubcaps) on.add('hubcaps');
    if (pl.antenna) on.add('antenna');
    if (pl.plate) on.add('plate');
    return on;
  }

  /** Põe cada peça na faixa e no espaço do encaixe. */
  private position(pl: Placement): void {
    pl.lanes.forEach((item, i) => {
      if (item) placeLane(this.part(item), this.profile, i);
    });
    pl.stickers.forEach((key, i) => {
      if (key) placeSticker(this.part(key), this.profile, i);
    });
  }

  private show(key: CarAccessoryKey, on: boolean): void {
    const part = this.part(key);
    if (part.apply) part.apply(on);
    else for (const o of part.objects) o.visible = on;
  }

  private resetPose(part: Part): void {
    for (const o of part.objects) {
      const rest = restOf(o);
      o.position.copy(rest.position);
      o.scale.copy(rest.scale);
    }
  }

  private finish(anim: Anim): void {
    const part = this.part(anim.key);
    this.resetPose(part);
    if (anim.dir === 'out' && !part.apply) for (const o of part.objects) o.visible = false;
    if (!anim.seated) anim.onSeat?.();
    this.anims.delete(anim.key);
    anim.resolve();
  }

  private settleAll(): void {
    for (const a of [...this.anims.values()]) this.finish(a);
  }

  setAccessories(keys: readonly string[]): void {
    if (this.disposed) return;
    this.settleAll();
    const next = placeAccessories(this.profile, keys, this.placement);
    const on = this.visibleOf(next);
    this.position(next);
    const all = new Set<CarAccessoryKey>([...this.parts.keys(), ...on]);
    for (const key of all) this.show(key, on.has(key));
    this.placement = next;
    this.selected = knownKeys(keys);
  }

  private transition(
    nextKeys: CarAccessoryKey[],
    animate: boolean,
    focus: CarAccessoryKey,
    onSeat?: () => void,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const before = this.visibleOf(this.placement);
    const next = placeAccessories(this.profile, nextKeys, this.placement);
    const after = this.visibleOf(next);
    this.position(next);
    this.placement = next;
    this.selected = nextKeys;
    const promises: Promise<void>[] = [];
    let focusPromise: Promise<void> | null = null;
    for (const key of new Set([...before, ...after])) {
      const was = before.has(key);
      const is = after.has(key);
      if (was === is) continue;
      const running = this.anims.get(key);
      if (running) this.finish(running);
      if (!animate) {
        this.show(key, is);
        if (key === focus) onSeat?.();
        continue;
      }
      const part = this.part(key);
      if (is || part.apply) this.show(key, is);
      const promise = new Promise<void>((resolve) => {
        this.anims.set(key, {
          key,
          dir: is || part.apply ? 'in' : 'out',
          t0: null,
          seated: false,
          onSeat: key === focus ? onSeat : undefined,
          resolve,
        });
      });
      if (key === focus) focusPromise = promise;
      promises.push(promise);
      this.applyPose(key, is || part.apply ? this.inPose(part, 0) : outPose(0));
    }
    if (promises.length > 0) this.wake();
    return focusPromise ?? Promise.all(promises).then(() => undefined);
  }

  attach(key: CarAccessoryKey, opts: AttachOptions): Promise<void> {
    if (this.selected.includes(key)) {
      opts.onSeat?.();
      return Promise.resolve();
    }
    return this.transition([...this.selected, key], opts.animate, key, opts.onSeat);
  }

  detach(key: CarAccessoryKey, opts: { animate: boolean }): Promise<void> {
    const drop = (k: CarAccessoryKey) => k === key || (key === 'rack' && isLaneItem(k));
    return this.transition(
      this.selected.filter((k) => !drop(k)),
      opts.animate,
      key,
    );
  }

  private inPose(part: Part, t: number): Pose {
    return part.kind === 'drop' ? dropPose(t) : popPose(t);
  }

  private applyPose(key: CarAccessoryKey, pose: Pose): void {
    const part = this.part(key);
    for (const o of part.objects) {
      const rest = restOf(o);
      o.position.copy(rest.position);
      o.position.y += pose.dy;
      if (part.kind === 'grow' && pose.scale !== 1) {
        o.scale.set(rest.scale.x, rest.scale.y * Math.max(0.001, pose.scale), rest.scale.z);
      } else {
        const s = Math.max(0.001, pose.scale);
        o.scale.set(rest.scale.x * s, rest.scale.y * s * pose.squash, rest.scale.z * s);
      }
    }
  }

  // ------------------------------------------------------------------ cor, placa, noite, rodas
  setColor(color: CarColor, opts?: { animate?: boolean }): void {
    if (this.disposed) return;
    const target = paintState(color, this.profile.twoTone !== null);
    if (!opts?.animate) {
      this.tween = null;
      this.paintKit.apply(target);
      return;
    }
    const from = clonePaint(this.paintKit.state);
    this.tween = { from, to: target, t0: null, now: clonePaint(from) };
    this.wake();
  }

  setPlate(text: string | null): void {
    if (this.disposed || text === this.plateLabel) return;
    this.plateLabel = text;
    this.tripPlate?.dispose();
    this.tripPlate = null;
    this.refreshPlate();
  }

  private refreshPlate(): void {
    if (this.plateOn && plateText(this.plateLabel) !== 'VIAJEI') {
      this.tripPlate ??= createPlateTexture(this.plateLabel);
      this.plateMat.map = this.tripPlate;
    } else {
      this.plateMat.map = this.defaultPlate;
    }
    this.plateMat.needsUpdate = true;
  }

  setNight(t: number): void {
    this.mats.head.emissiveIntensity = 3 * smooth(0.3, 0.8, t);
    this.mats.tail.emissiveIntensity = 2.2 * smooth(0.3, 0.8, t);
    this.mats.fog.emissiveIntensity = 0.15 + 2.4 * smooth(0.3, 0.8, t);
    for (const sp of this.spots) sp.intensity = 60 * smooth(0.4, 0.9, t);
  }

  roll(distance: number): void {
    for (const w of this.wheels) w.rotation.y += distance / this.profile.wheels.radius;
  }

  update(now: number): boolean {
    if (this.disposed) return false;
    let busy = false;
    const tw = this.tween;
    if (tw) {
      tw.t0 ??= now;
      const k = paintProgress(now - tw.t0);
      lerpPaint(tw.from, tw.to, k, tw.now);
      this.paintKit.apply(tw.now);
      if (k >= 1) this.tween = null;
      else busy = true;
    }
    for (const anim of [...this.anims.values()]) {
      anim.t0 ??= now;
      const part = this.part(anim.key);
      const t = now - anim.t0;
      const pose = anim.dir === 'in' ? this.inPose(part, t) : outPose(t);
      this.applyPose(anim.key, pose);
      if (pose.seated && !anim.seated) {
        anim.seated = true;
        anim.onSeat?.();
      }
      if (pose.done) this.finish(anim);
      else busy = true;
    }
    return busy;
  }

  dispose(): void {
    if (this.disposed) return;
    this.settleAll();
    this.disposed = true;
    this.tripPlate?.dispose();
    for (const sp of this.spots) sp.dispose();
    this.paintKit.dispose();
    this.mats.dispose();
    this.kit.dispose();
    this.group.removeFromParent();
  }

  /** Para os testes: recursos guardados, peças montadas e visíveis, o encaixe e a cor da saia. */
  get debug(): RigDebug {
    const visible = [...this.parts.entries()]
      .filter(([k, part]) =>
        part.apply ? k === 'plate' && this.plateOn : part.objects.some((o: Object3D) => o.visible),
      )
      .map(([k]) => k);
    return {
      resources: this.kit.size,
      parts: [...this.parts.keys()],
      visible,
      placement: this.placement,
      color: `#${this.paintKit.state.lower.getHexString()}`,
      plate: this.plateMat.map === this.defaultPlate ? 'VIAJEI' : plateText(this.plateLabel),
    };
  }
}

export function buildFromProfile(
  profile: CarProfile,
  spec: CarSpec,
  opts: BuildOptions = {},
): CarRig {
  return new ProfileRig(profile, spec, opts);
}

export type RigDebug = {
  resources: number;
  parts: CarAccessoryKey[];
  visible: CarAccessoryKey[];
  placement: Placement;
  color: string;
  plate: string;
};

export type DebugRig = CarRig & { debug: RigDebug };
