import type { CarColor } from '@shared/constants.ts';
import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SpotLight,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import { createPlateTexture } from '../textures.ts';
import { applyPaint, carMaterials, paintMaterial } from './materials.ts';
import { CAR_ACCESSORY_KEYS, type CarAccessoryKey, type CarRig } from './types.ts';

/**
 * O hatch, portado do protótipo: carroceria extrudada de um perfil lateral com chanfro, vidros,
 * faróis e lanternas emissivos, placa, rodas com pneu, aro cromado e cubo, e os acessórios (rack,
 * prancha, mala de teto e bicicleta), escondidos até a conquista que os libera. O modelo olha para
 * +z do grupo; `group.lookAt(frente)` o orienta na estrada.
 */
function tube(a: Vector3, b: Vector3, r: number, mat: Material): Mesh {
  const d = new Vector3().subVectors(b, a);
  const l = d.length();
  const m = new Mesh(new CylinderGeometry(r, r, l, 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  return m;
}

export function buildHatch(color: CarColor, accessories: readonly string[] = []): CarRig {
  const group = new Group();
  const inner = new Group();
  inner.rotation.y = -Math.PI / 2;
  group.add(inner);
  const geometries: BufferGeometry[] = [];
  const own = (g: BufferGeometry): BufferGeometry => {
    geometries.push(g);
    return g;
  };

  const paint = paintMaterial(color);
  const mats = carMaterials();

  // carroceria: perfil lateral extrudado, com os arcos das rodas
  const s = new Shape();
  s.moveTo(-2.15, 0.38);
  s.lineTo(-2.2, 0.62);
  s.lineTo(-2.15, 1.02);
  s.lineTo(-1.85, 1.38);
  s.lineTo(-1.3, 1.46);
  s.lineTo(0.1, 1.44);
  s.lineTo(0.95, 0.92);
  s.lineTo(2.1, 0.8);
  s.lineTo(2.25, 0.62);
  s.lineTo(2.2, 0.38);
  s.lineTo(1.95, 0.38);
  s.absarc(1.4, 0.38, 0.55, 0, Math.PI, false);
  s.lineTo(-0.85, 0.38);
  s.absarc(-1.4, 0.38, 0.55, 0, Math.PI, false);
  s.lineTo(-2.15, 0.38);
  const bodyGeo = own(
    new ExtrudeGeometry(s, {
      depth: 1.72,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.08,
      bevelSegments: 3,
      curveSegments: 10,
    }),
  );
  bodyGeo.translate(0, 0, -0.86);
  const body = new Mesh(bodyGeo, paint);
  body.castShadow = true;
  body.receiveShadow = true;
  inner.add(body);

  // vidros laterais, para-brisa e vigia
  const win = new Shape();
  win.moveTo(0.78, 0.97);
  win.lineTo(0.14, 1.35);
  win.lineTo(-1.28, 1.37);
  win.lineTo(-1.7, 1.07);
  win.lineTo(-1.7, 0.97);
  win.closePath();
  const winGeo = own(new ShapeGeometry(win));
  for (const sg of [1, -1]) {
    const m = new Mesh(winGeo, mats.glass);
    m.position.z = sg * 0.97;
    inner.add(m);
  }
  const slopePlane = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.hypot(dx, dy);
    let nx = -dy / l;
    let ny = dx / l;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const m = new Mesh(own(new PlaneGeometry(1.5, l - 0.06)), mats.glass);
    m.position.set((x1 + x2) / 2 + nx * 0.02, (y1 + y2) / 2 + ny * 0.02, 0);
    m.rotation.set(0, -Math.PI / 2, Math.atan2(dy, dx) - Math.PI / 2, 'ZYX');
    inner.add(m);
  };
  slopePlane(0.95, 0.92, 0.1, 1.44);
  slopePlane(-1.85, 1.38, -2.15, 1.02);

  const box = (w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
    const m = new Mesh(own(new BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    inner.add(m);
    return m;
  };
  box(0.04, 0.2, 0.9, mats.dark, 2.26, 0.5, 0);
  box(0.06, 0.16, 0.36, mats.head, 2.25, 0.72, 0.58);
  box(0.06, 0.16, 0.36, mats.head, 2.25, 0.72, -0.58);
  box(0.05, 0.12, 0.34, mats.tail, -2.22, 0.92, 0.6);
  box(0.05, 0.12, 0.34, mats.tail, -2.22, 0.92, -0.6);
  box(0.12, 0.1, 0.18, paint, 0.55, 1.02, 1.03);
  box(0.12, 0.1, 0.18, paint, 0.55, 1.02, -1.03);

  const plateTex = createPlateTexture();
  const plateMat = new MeshStandardMaterial({ map: plateTex, roughness: 0.6 });
  const plate = new Mesh(own(new PlaneGeometry(0.5, 0.14)), plateMat);
  plate.position.set(-2.235, 0.62, 0);
  plate.rotation.y = -Math.PI / 2;
  inner.add(plate);

  // rodas
  const wheels: Group[] = [];
  const tireGeo = own(new CylinderGeometry(0.42, 0.42, 0.3, 24));
  const rimGeo = own(new CylinderGeometry(0.27, 0.27, 0.31, 12));
  const hubGeo = own(new CylinderGeometry(0.09, 0.09, 0.33, 8));
  for (const [x, z] of [
    [1.4, 0.86],
    [1.4, -0.86],
    [-1.4, 0.86],
    [-1.4, -0.86],
  ]) {
    const w = new Group();
    w.position.set(x ?? 0, 0.42, z ?? 0);
    w.rotation.x = Math.PI / 2;
    const tire = new Mesh(tireGeo, mats.rubber);
    tire.castShadow = true;
    w.add(tire, new Mesh(rimGeo, mats.chrome), new Mesh(hubGeo, mats.dark));
    inner.add(w);
    wheels.push(w);
  }

  // acessórios: geometria pronta, visibilidade pela conquista
  const rack = new Group();
  for (const x of [-0.3, -1.1]) {
    const b = new Mesh(own(new BoxGeometry(0.08, 0.07, 1.5)), mats.dark);
    b.position.set(x, 1.53, 0);
    rack.add(b);
    for (const z of [-0.7, 0.7]) {
      const f = new Mesh(own(new BoxGeometry(0.1, 0.1, 0.08)), mats.dark);
      f.position.set(x, 1.47, z);
      rack.add(f);
    }
  }
  inner.add(rack);
  const boardMat = new MeshPhysicalMaterial({ color: 0xdaf0ec, roughness: 0.3, clearcoat: 0.8 });
  const board = new Mesh(own(new CapsuleGeometry(0.28, 2.1, 4, 10)), boardMat);
  board.rotation.z = Math.PI / 2;
  board.scale.set(1, 1, 0.22);
  board.rotation.x = Math.PI / 2;
  board.position.set(-0.7, 1.66, 0.3);
  board.castShadow = true;
  inner.add(board);
  const roofBoxMat = new MeshPhysicalMaterial({ color: 0x15181d, roughness: 0.25, clearcoat: 1 });
  const roofBox = new Mesh(own(new BoxGeometry(2.0, 0.34, 0.78)), roofBoxMat);
  roofBox.position.set(-0.7, 1.75, -0.28);
  roofBox.castShadow = true;
  inner.add(roofBox);
  const bike = new Group();
  const bikeMat = new MeshStandardMaterial({ color: 0x8a2b2b, roughness: 0.5, metalness: 0.3 });
  const RH = new Vector3(-1.15, 1.86, 0.1);
  const FH = new Vector3(-0.25, 1.86, 0.1);
  const BB = new Vector3(-0.72, 1.78, 0.1);
  const ST = new Vector3(-0.95, 2.3, 0.1);
  const HD = new Vector3(-0.42, 2.27, 0.1);
  const bikeWheelGeo = own(new TorusGeometry(0.3, 0.035, 8, 20));
  for (const h of [RH, FH]) {
    const t = new Mesh(bikeWheelGeo, mats.rubber);
    t.position.copy(h);
    bike.add(t);
  }
  for (const [a, b] of [
    [RH, ST],
    [ST, HD],
    [HD, FH],
    [RH, BB],
    [BB, HD],
    [ST, BB],
  ] as const) {
    const t = tube(a, b, 0.025, bikeMat);
    own(t.geometry);
    bike.add(t);
  }
  const bar = tube(new Vector3(-0.42, 2.3, -0.12), new Vector3(-0.42, 2.3, 0.32), 0.02, mats.dark);
  own(bar.geometry);
  bike.add(bar);
  inner.add(bike);
  const accessoryParts: Record<CarAccessoryKey, Group | Mesh> = { rack, board, box: roofBox, bike };

  // faróis: feixes que só a noite acende
  const spots: SpotLight[] = [];
  for (const z of [0.55, -0.55]) {
    const sp = new SpotLight(0xfff3d6, 0, 30, 0.42, 0.5, 1.2);
    sp.position.set(2.1, 0.75, z);
    sp.target.position.set(14, -0.5, z);
    inner.add(sp, sp.target);
    spots.push(sp);
  }

  const setAccessories = (keys: readonly string[]) => {
    const on = new Set(keys);
    const hasRack = on.has('rack') || on.has('board') || on.has('box') || on.has('bike');
    rack.visible = hasRack;
    board.visible = hasRack && on.has('board');
    roofBox.visible = hasRack && on.has('box');
    bike.visible = hasRack && on.has('bike');
  };
  setAccessories(
    accessories.filter((k): k is CarAccessoryKey =>
      (CAR_ACCESSORY_KEYS as readonly string[]).includes(k),
    ),
  );

  const smooth = (a: number, b: number, v: number) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  return {
    model: 'hatch',
    group,
    paint,
    wheels,
    headMat: mats.head,
    tailMat: mats.tail,
    spots,
    accessories: accessoryParts,
    setColor: (c) => applyPaint(paint, c),
    setAccessories,
    setNight: (t) => {
      mats.head.emissiveIntensity = 3 * smooth(0.3, 0.8, t);
      mats.tail.emissiveIntensity = 2.2 * smooth(0.3, 0.8, t);
      for (const sp of spots) sp.intensity = 60 * smooth(0.4, 0.9, t);
    },
    roll: (distance) => {
      for (const w of wheels) w.rotation.y += distance / 0.42;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      paint.dispose();
      mats.dispose();
      plateTex.dispose();
      plateMat.dispose();
      boardMat.dispose();
      roofBoxMat.dispose();
      bikeMat.dispose();
    },
  };
}
