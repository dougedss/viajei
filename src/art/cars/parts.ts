import {
  BoxGeometry,
  CapsuleGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStickerTexture } from '../textures.ts';
import { mergedMesh } from './batch.ts';
import type { Kit } from './kit.ts';
import type { CarMaterials } from './materials.ts';
import type { LaneItem, StickerKey } from './placement.ts';
import type { CarProfile, Pt } from './profile.ts';
import {
  ANTENNA,
  BIKE,
  BIKE_TUBES,
  BOARD,
  BOX,
  boxLength,
  FOG_LIGHT,
  laneWidth,
  RACK,
} from './shapes.ts';
import { STICKER_ART, STICKER_RING, STICKER_STROKE } from './stickers.ts';

/**
 * As peças de cada acessório, montadas nas âncoras do perfil e com as medidas de `shapes.ts` (as
 * mesmas da vista lateral). Cada peça diz como entra: `drop` (cai no teto e assenta), `pop`
 * (cresce do centro) ou `grow` (cresce da base, a antena). Os objetos animam em volta da própria
 * origem, que fica no ponto de apoio. As coordenadas são as do perfil: x para o nariz, y para cima,
 * z para o lado.
 */
export type PartKind = 'drop' | 'pop' | 'grow';

export type Part = {
  kind: PartKind;
  objects: Object3D[];
  /** peças que não somem, só mudam (a placa troca o texto) */
  apply?: (on: boolean) => void;
};

/** Guarda a posição e a escala de repouso, de onde as animações partem. */
export function setRest(o: Object3D): void {
  o.userData.rest = { position: o.position.clone(), scale: o.scale.clone() };
}

export function restOf(o: Object3D): { position: Vector3; scale: Vector3 } {
  const rest = o.userData.rest as { position: Vector3; scale: Vector3 } | undefined;
  return rest ?? { position: o.position.clone(), scale: o.scale.clone() };
}

function cast<T extends Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Um tubo entre dois pontos (o quadro da bicicleta). */
function tube(kit: Kit, a: Vector3, b: Vector3, r: number, mat: Material): Mesh {
  const d = new Vector3().subVectors(b, a);
  const l = d.length();
  const m = new Mesh(kit.own(new CylinderGeometry(r, r, l, 6)), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return m;
}

export function roofCenter(p: CarProfile): number {
  return (p.anchors.roof.x0 + p.anchors.roof.x1) / 2;
}

export function buildRack(p: CarProfile, kit: Kit, mats: CarMaterials): Part {
  const { roof } = p.anchors;
  const len = roof.x1 - roof.x0;
  const root = new Group();
  root.position.set(roofCenter(p), roof.y, 0);
  const side = p.width / 2 - 0.2;
  const rail = kit.geometry(`rack-rail-${len}`, () => new BoxGeometry(len, RACK.rail, RACK.rail));
  const bar = kit.geometry(
    `rack-bar-${p.width}`,
    () => new BoxGeometry(RACK.bar.w, RACK.bar.h, p.width - 0.3),
  );
  const footH = RACK.deck - RACK.bar.h;
  const foot = kit.geometry('rack-foot', () => new BoxGeometry(0.1, footH, 0.08));
  const pieces: [BoxGeometry, Object3D][] = [];
  const at = (x: number, y: number, z: number) => {
    const o = new Object3D();
    o.position.set(x, y, z);
    return o;
  };
  for (const z of [side, -side]) pieces.push([rail, at(0, RACK.rail / 2, z)]);
  for (const x of [-len / 2 + len * RACK.inset, len / 2 - len * RACK.inset]) {
    pieces.push([bar, at(x, RACK.deck - RACK.bar.h / 2, 0)]);
    for (const z of [side, -side]) pieces.push([foot, at(x, footH / 2, z)]);
  }
  root.add(mergedMesh(kit, mats.trim, pieces));
  setRest(root);
  return { kind: 'drop', objects: [root] };
}

/** Mala, prancha ou bicicleta numa faixa do trilho: origem no convés do rack, no centro da faixa. */
export function buildRoofItem(item: LaneItem, p: CarProfile, kit: Kit, mats: CarMaterials): Part {
  const { roof } = p.anchors;
  const root = new Group();
  root.position.set(roofCenter(p), roof.y + RACK.deck, roof.lanes[0] ?? 0);
  const lane = laneWidth(roof.lanes, p.width);
  if (item === 'box') {
    const len = boxLength(roof.x1 - roof.x0);
    const w = Math.min(BOX.width, lane - 0.06);
    const mat = kit.material(
      'box',
      () => new MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.25, clearcoat: 1 }),
    );
    const geo = kit.geometry(
      `box-${len}-${w}`,
      () => new RoundedBoxGeometry(len, BOX.height, w, 3, BOX.radius),
    );
    const box = cast(new Mesh(geo, mat));
    box.position.y = BOX.height / 2;
    root.add(box);
  } else if (item === 'board') {
    const w = Math.min(BOARD.width, lane - 0.04);
    const mat = kit.material(
      'board',
      () => new MeshPhysicalMaterial({ color: 0xdaf0ec, roughness: 0.3, clearcoat: 0.8 }),
    );
    const stripe = kit.material(
      'board-stripe',
      () => new MeshStandardMaterial({ color: 0xe8653a, roughness: 0.4 }),
    );
    const board = cast(
      new Mesh(
        kit.geometry(`board-${w}`, () => new CapsuleGeometry(w / 2, BOARD.length - w, 4, 12)),
        mat,
      ),
    );
    board.rotation.z = Math.PI / 2;
    board.scale.set(BOARD.thickness / w, 1, 1);
    board.position.y = BOARD.thickness / 2;
    root.add(board);
    const line = new Mesh(
      kit.geometry('board-line', () => new BoxGeometry(BOARD.length * 0.78, 0.006, 0.035)),
      stripe,
    );
    line.position.y = BOARD.thickness + 0.002;
    root.add(line);
  } else {
    const frame = kit.material(
      'bike',
      () => new MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.5, metalness: 0.3 }),
    );
    const at = ([x, y]: Pt) => new Vector3(x, y, 0);
    const wheel = kit.geometry('bike-wheel', () => new TorusGeometry(BIKE.wheelR, 0.03, 8, 24));
    const place = (x: number, y: number, z = 0) => {
      const o = new Object3D();
      o.position.set(x, y, z);
      return o;
    };
    root.add(
      mergedMesh(kit, mats.rubber, [
        [wheel, place(...BIKE.rear)],
        [wheel, place(...BIKE.front)],
      ]),
    );
    const tubes = [...BIKE_TUBES.map(([a, b]) => tube(kit, at(a), at(b), BIKE.tube, frame))];
    root.add(
      mergedMesh(
        kit,
        frame,
        tubes.map((t) => [t.geometry, t] as const),
      ),
    );
    const [hx, hy] = BIKE.head;
    const bar = tube(
      kit,
      new Vector3(hx, hy + 0.03, -0.22),
      new Vector3(hx, hy + 0.03, 0.22),
      0.018,
      mats.dark,
    );
    const seat = kit.geometry('bike-seat', () => new BoxGeometry(0.16, 0.035, 0.07));
    root.add(
      mergedMesh(kit, mats.dark, [
        [bar.geometry, bar],
        [seat, place(BIKE.seat[0] - 0.01, BIKE.seat[1] + 0.03)],
      ]),
    );
    for (const child of root.children) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  }
  setRest(root);
  return { kind: 'drop', objects: [root] };
}

export function buildFogLights(p: CarProfile, kit: Kit, mats: CarMaterials): Part {
  const { at, spread } = p.anchors.frontBumper;
  const lens = kit.geometry(
    'fog-lens',
    () => new CylinderGeometry(FOG_LIGHT.radius, FOG_LIGHT.radius, 0.05, 18),
  );
  const housing = kit.geometry(
    'fog-housing',
    () => new CylinderGeometry(FOG_LIGHT.radius + 0.018, FOG_LIGHT.radius + 0.022, 0.05, 18),
  );
  const objects = [spread, -spread].map((z) => {
    const g = new Group();
    g.position.set(at[0] + p.bevel + 0.01, at[1], z);
    const h = new Mesh(housing, mats.chrome);
    h.rotation.z = Math.PI / 2;
    const l = new Mesh(lens, mats.fog);
    l.rotation.z = Math.PI / 2;
    l.position.x = 0.012;
    g.add(h, l);
    setRest(g);
    return g;
  });
  return { kind: 'pop', objects };
}

/** As calotas cromadas, uma por roda, do lado de fora (dentro do grupo da roda: giram junto). */
export function buildHubcaps(
  p: CarProfile,
  wheels: readonly Group[],
  kit: Kit,
  mats: CarMaterials,
): Part {
  const r = p.wheels.radius;
  const cap = kit.geometry('hubcap', () => new CylinderGeometry(r * 0.68, r * 0.72, 0.04, 24));
  const boss = kit.geometry('hubcap-boss', () => new CylinderGeometry(r * 0.16, r * 0.2, 0.05, 12));
  const objects = wheels.map((w) => {
    const out = Math.sign(w.position.z) || 1;
    const g = new Group();
    // no grupo da roda, girado em x, o eixo local y é o eixo da roda e aponta para +z do carro
    g.position.y = out * (p.wheels.tire / 2 + 0.012);
    const bossAt = new Object3D();
    bossAt.position.y = out * 0.02;
    g.add(
      mergedMesh(kit, mats.chrome, [
        [cap, new Object3D()],
        [boss, bossAt],
      ]),
    );
    w.add(g);
    setRest(g);
    return g;
  });
  return { kind: 'pop', objects };
}

export function buildAntenna(p: CarProfile, kit: Kit, mats: CarMaterials): Part {
  const [x, y, z] = p.anchors.antenna;
  const root = new Group();
  root.position.set(x, y, z);
  const mast = new Mesh(
    kit.geometry('antenna-mast', () => new CylinderGeometry(0.011, 0.016, ANTENNA.height, 6)),
    mats.dark,
  );
  mast.position.y = ANTENNA.height / 2;
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-ANTENNA.flag.w, -ANTENNA.flag.h / 2);
  shape.lineTo(0, -ANTENNA.flag.h);
  shape.closePath();
  const flag = new Mesh(
    kit.geometry('antenna-flag', () => new ShapeGeometry(shape)),
    kit.material(
      'antenna-flag',
      () => new MeshStandardMaterial({ color: 0xe8653a, roughness: 0.6, side: DoubleSide }),
    ),
  );
  flag.position.set(0.01, ANTENNA.height, 0);
  root.add(mast, flag);
  setRest(root);
  return { kind: 'grow', objects: [root] };
}

/** Um adesivo nos dois lados, no espaço dado; quem muda de espaço é reposicionado por `placeSticker`. */
export function buildSticker(key: StickerKey, p: CarProfile, kit: Kit): Part {
  const art = STICKER_ART[key];
  const mat = kit.material(`sticker-${key}`, () => {
    const map = kit.own(
      createStickerTexture({ ...art, stroke: STICKER_STROKE, ringWidth: STICKER_RING }),
    );
    return new MeshStandardMaterial({ map, roughness: 0.45, metalness: 0 });
  });
  const disc = kit.geometry('sticker-disc', () => new CircleGeometry(0.5, 32));
  const near = new Mesh(disc, mat);
  const far = new Mesh(disc, mat);
  far.rotation.y = Math.PI;
  const half = p.width / 2 + 0.006;
  near.position.z = half;
  far.position.z = -half;
  return { kind: 'pop', objects: [near, far] };
}

/**
 * Põe um adesivo no espaço dado. Mexe no repouso e na posição, nunca no que uma animação em curso
 * está fazendo com a escala (o próximo quadro aplica a pose sobre o repouso novo).
 */
export function placeSticker(part: Part, p: CarProfile, spot: number): void {
  const s = p.anchors.stickers[spot];
  if (!s) return;
  for (const o of part.objects) {
    const rest = restOf(o);
    rest.position.x = s.at[0];
    rest.position.y = s.at[1];
    rest.scale.setScalar(s.size);
    o.userData.rest = rest;
    o.position.x = s.at[0];
    o.position.y = s.at[1];
    o.scale.copy(rest.scale);
  }
}

/** Põe um item de teto numa faixa: só o lado (z); a altura é da animação de encaixe. */
export function placeLane(part: Part, p: CarProfile, lane: number): void {
  const z = p.anchors.roof.lanes[lane];
  if (z === undefined) return;
  for (const o of part.objects) {
    const rest = restOf(o);
    rest.position.z = z;
    o.userData.rest = rest;
    o.position.z = z;
  }
}

/** As âncoras como objetos vazios, para quem precisa saber onde cada coisa encaixa. */
export function anchorObjects(
  p: CarProfile,
  wheels: readonly Group[],
): {
  roof: Object3D;
  lanes: Object3D[];
  frontBumper: Object3D;
  rearPlate: Object3D;
  hubs: Object3D[];
  antenna: Object3D;
  stickers: { near: Object3D; far: Object3D }[];
} {
  const mark = (x: number, y: number, z: number) => {
    const o = new Object3D();
    o.position.set(x, y, z);
    return o;
  };
  const { roof, frontBumper, rearPlate, antenna, stickers } = p.anchors;
  const cx = roofCenter(p);
  return {
    roof: mark(cx, roof.y, 0),
    lanes: roof.lanes.map((z) => mark(cx, roof.y + RACK.deck, z)),
    frontBumper: mark(frontBumper.at[0] + p.bevel, frontBumper.at[1], 0),
    rearPlate: mark(rearPlate[0] - p.bevel, rearPlate[1], 0),
    hubs: wheels.map((w) => mark(w.position.x, w.position.y, w.position.z)),
    antenna: mark(antenna[0], antenna[1], antenna[2]),
    stickers: stickers.map((s) => ({
      near: mark(s.at[0], s.at[1], p.width / 2),
      far: mark(s.at[0], s.at[1], -p.width / 2),
    })),
  };
}
