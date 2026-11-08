import type { StopKind } from '@shared/constants.ts';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import { Kit } from '../cars/kit.ts';
import { carMaterials, type CarMaterials } from '../cars/materials.ts';
import { MINIATURE_BOX, type Box, type Miniature } from './types.ts';

/**
 * Os construtores das miniaturas, um por tipo de parada: casa (origem), um marco baixo
 * (deslocamento), um grupo de árvores (natureza), a parreira com o barril (vinícola), o hotel de
 * dois andares, o restaurante com toldo e mesa, o palco (evento), um quarteirão (cidade), o posto
 * com a cobertura e as bombas (fase 15) e a placa (outro). Low-poly, com sombreamento chapado e os materiais dos carros (vidro, cromado, borracha,
 * plástico escuro). O `seed` só varia o que não muda a caixa: cores e pequenos giros.
 */
type Palette = {
  wall: MeshStandardMaterial;
  wall2: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  leaf2: MeshStandardMaterial;
  trunk: MeshStandardMaterial;
  awning: MeshStandardMaterial;
  awning2: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  sign: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  concrete2: MeshStandardMaterial;
  stage: MeshStandardMaterial;
  barrel: MeshStandardMaterial;
  amber: MeshStandardMaterial;
  cars: CarMaterials;
};

const flat = (color: number, roughness = 0.9) =>
  new MeshStandardMaterial({ color, roughness, flatShading: true });

function palette(kit: Kit): Palette {
  const own = <T extends Material>(m: T): T => kit.own(m);
  return {
    wall: own(flat(0xf1ebe0)),
    wall2: own(flat(0xe8dcc7)),
    roof: own(flat(0x8f4a37)),
    wood: own(flat(0x8a6a46)),
    leaf: own(flat(0x3f7a3a)),
    leaf2: own(flat(0x5f9e45)),
    trunk: own(flat(0x6b4a2f)),
    awning: own(flat(0xe8653a, 0.8)),
    awning2: own(flat(0xf6f1e4, 0.8)),
    stone: own(flat(0x7b7065)),
    sign: own(flat(0x2f6f3e, 0.6)),
    concrete: own(flat(0xc9c6bd, 0.7)),
    concrete2: own(flat(0xaab3bf, 0.7)),
    stage: own(flat(0x22252b, 0.8)),
    barrel: own(flat(0x7a5230, 0.85)),
    // o âmbar do Posto (`--color-stop-fuel`): a faixa da cobertura e as bombas
    amber: own(flat(0xc27c1a, 0.7)),
    cars: carMaterials(),
  };
}

/** Um gerador determinístico pequeno (o mesmo do mundo), só para cores e giros. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = { kit: Kit; p: Palette; r: () => number; group: Group };

function mesh(ctx: Ctx, geo: BufferGeometry, mat: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(ctx.kit.own(geo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.group.add(m);
  return m;
}

/** Uma caixa com a base em `y` (não no centro). */
function block(
  ctx: Ctx,
  w: number,
  h: number,
  d: number,
  mat: Material,
  x = 0,
  y = 0,
  z = 0,
): Mesh {
  return mesh(ctx, new BoxGeometry(w, h, d), mat, x, y + h / 2, z);
}

/** Um telhado de quatro águas (cone de 4 lados) com a base em `y`. */
function roof(ctx: Ctx, w: number, d: number, h: number, mat: Material, y: number): Mesh {
  const g = new ConeGeometry(Math.hypot(w, d) / 2 + 0.05, h, 4);
  g.rotateY(Math.PI / 4);
  g.scale(w / Math.hypot(w, d) / 0.7071, 1, d / Math.hypot(w, d) / 0.7071);
  return mesh(ctx, g, mat, 0, y + h / 2, 0);
}

function tree(ctx: Ctx, x: number, z: number, scale: number, round: boolean): void {
  const trunkH = 0.7 * scale;
  mesh(
    ctx,
    new CylinderGeometry(0.1 * scale, 0.14 * scale, trunkH, 6),
    ctx.p.trunk,
    x,
    trunkH / 2,
    z,
  );
  if (round) {
    mesh(ctx, new IcosahedronGeometry(0.75 * scale, 1), ctx.p.leaf2, x, trunkH + 0.6 * scale, z);
  } else {
    const h = 1.9 * scale;
    mesh(ctx, new ConeGeometry(0.7 * scale, h, 7), ctx.p.leaf, x, trunkH - 0.1 + h / 2, z);
  }
}

// ------------------------------------------------------------------ os tipos
function house(ctx: Ctx): void {
  const { p } = ctx;
  block(ctx, 2.6, 1.5, 2.1, p.wall);
  roof(ctx, 2.9, 2.4, 0.85, p.roof, 1.5);
  // porta e janelas na frente (+z), chaminé atrás
  block(ctx, 0.5, 0.9, 0.06, p.cars.dark, 0.5, 0, 1.06);
  block(ctx, 0.5, 0.45, 0.06, p.cars.glass, -0.6, 0.7, 1.06);
  block(ctx, 0.5, 0.45, 0.06, p.cars.glass, -0.6, 0.7, -1.06);
  block(ctx, 0.3, 0.6, 0.3, p.stone, -0.8, 1.7, -0.5);
}

function marker(ctx: Ctx): void {
  // um marco quilométrico baixo
  block(ctx, 0.5, 0.75, 0.3, ctx.p.concrete);
  block(ctx, 0.5, 0.22, 0.31, ctx.p.cars.trim, 0, 0.45, 0);
}

function grove(ctx: Ctx): void {
  tree(ctx, -1.1, 0.4, 1.0, false);
  tree(ctx, 0.9, -0.6, 1.15, true);
  tree(ctx, 0.2, 1.1, 0.85, false);
  tree(ctx, -0.6, -1.2, 0.9, true);
}

function winery(ctx: Ctx): void {
  const { p } = ctx;
  // duas fileiras de parreira (postes e a videira) e o barril deitado na frente
  for (const z of [-0.7, 0.3]) {
    for (const x of [-1.5, -0.5, 0.5, 1.5]) {
      block(ctx, 0.08, 1.1, 0.08, p.wood, x, 0, z);
    }
    block(ctx, 3.1, 0.5, 0.26, p.leaf, 0, 0.5, z);
    block(ctx, 3.1, 0.04, 0.04, p.cars.chrome, 0, 1.05, z);
  }
  // o barril deitado, apoiado pelos aros (raio 0,44: o chão é o aro, não a madeira)
  const barrel = mesh(ctx, new CylinderGeometry(0.42, 0.42, 1.0, 12), p.barrel, 0.9, 0.44, 1.0);
  barrel.rotation.z = Math.PI / 2;
  const hoop = new CylinderGeometry(0.44, 0.44, 0.06, 12);
  for (const dx of [-0.32, 0.32]) {
    const h = mesh(ctx, hoop, p.cars.chrome, 0.9 + dx, 0.44, 1.0);
    h.rotation.z = Math.PI / 2;
  }
}

function hotel(ctx: Ctx): void {
  const { p } = ctx;
  block(ctx, 3.0, 2.2, 2.0, p.wall2);
  roof(ctx, 3.3, 2.3, 0.7, p.roof, 2.2);
  // duas fileiras de janelas na frente, a porta no meio, o letreiro no telhado
  for (const y of [0.55, 1.45]) {
    for (const x of [-1.0, -0.35, 0.35, 1.0]) {
      if (y < 1 && Math.abs(x) < 0.5) continue;
      block(ctx, 0.4, 0.4, 0.06, p.cars.glass, x, y, 1.01);
    }
  }
  block(ctx, 0.7, 1.0, 0.08, p.cars.dark, 0, 0, 1.01);
  block(ctx, 1.4, 0.3, 0.1, p.sign, 0, 2.85, 0.4);
}

function restaurant(ctx: Ctx): void {
  const { p } = ctx;
  block(ctx, 2.6, 1.4, 1.8, p.wall, 0, 0, -0.4);
  block(ctx, 2.8, 0.22, 2.0, p.roof, 0, 1.4, -0.4);
  // o toldo listrado inclinado sobre a frente, e a mesa com o guarda-sol na calçada
  for (let i = 0; i < 6; i++) {
    const m = block(
      ctx,
      0.45,
      0.08,
      1.0,
      i % 2 ? p.awning2 : p.awning,
      -1.125 + i * 0.45,
      1.3,
      0.75,
    );
    m.rotation.x = 0.35;
  }
  block(ctx, 0.9, 0.5, 0.06, p.cars.glass, -0.5, 0.5, 0.51);
  block(ctx, 0.5, 0.9, 0.06, p.cars.dark, 0.6, 0, 0.51);
  const tableX = 1.1;
  const tableZ = 0.9;
  mesh(ctx, new CylinderGeometry(0.03, 0.03, 0.5, 6), p.cars.trim, tableX, 0.25, tableZ);
  mesh(ctx, new CylinderGeometry(0.35, 0.35, 0.05, 10), p.wood, tableX, 0.52, tableZ);
  mesh(ctx, new CylinderGeometry(0.02, 0.02, 1.0, 5), p.cars.trim, tableX, 1.0, tableZ);
  mesh(ctx, new ConeGeometry(0.6, 0.3, 8), p.awning, tableX, 1.55, tableZ);
}

function stage(ctx: Ctx): void {
  const { p } = ctx;
  block(ctx, 3.8, 0.5, 2.6, p.stage);
  // a parede de fundo e a cobertura apoiada em duas colunas
  block(ctx, 3.8, 1.9, 0.2, p.cars.dark, 0, 0.5, -1.2);
  for (const x of [-1.8, 1.8]) block(ctx, 0.12, 1.9, 0.12, p.cars.chrome, x, 0.5, 1.15);
  block(ctx, 4.0, 0.15, 2.8, p.cars.trim, 0, 2.4, 0);
  // duas caixas de som na frente
  for (const x of [-1.5, 1.5]) block(ctx, 0.5, 0.8, 0.45, p.stage, x, 0.5, 0.95);
}

function cityBlock(ctx: Ctx): void {
  const { p, r } = ctx;
  // três torres de alturas diferentes num quarteirão, com janelas de vidro na frente
  const towers: [number, number, number, number, number][] = [
    [-1.3, 0.3, 1.6, 3.9, 1.6],
    [0.5, -0.9, 1.9, 2.6, 1.7],
    [1.2, 1.1, 1.3, 1.9, 1.4],
  ];
  for (const [x, z, w, h, d] of towers) {
    block(ctx, w, h, d, r() < 0.5 ? p.concrete : p.concrete2, x, 0, z);
    for (let y = 0.5; y < h - 0.5; y += 0.6) {
      block(ctx, w * 0.7, 0.3, 0.05, p.cars.glass, x, y, z + d / 2 + 0.01);
    }
  }
  block(ctx, 4.2, 0.1, 4.2, p.cars.trim);
}

function fuelStation(ctx: Ctx): void {
  const { p } = ctx;
  // a ilha de concreto com duas bombas, cada uma com o visor e a mangueira
  block(ctx, 2.6, 0.12, 1.1, p.concrete, -0.1, 0, 0);
  for (const x of [-0.8, 0.6]) {
    block(ctx, 0.42, 0.95, 0.34, p.amber, x, 0.12, 0);
    block(ctx, 0.3, 0.22, 0.04, p.cars.glass, x, 0.72, 0.18);
    block(ctx, 0.06, 0.5, 0.06, p.cars.rubber, x + 0.25, 0.3, 0.1);
  }
  // a cobertura sobre duas colunas, com a faixa âmbar na borda
  for (const x of [-1.4, 1.2]) block(ctx, 0.16, 1.85, 0.16, p.cars.chrome, x, 0.12, 0);
  block(ctx, 3.3, 0.24, 2.3, p.wall, -0.1, 1.97, 0);
  block(ctx, 3.32, 0.1, 2.32, p.amber, -0.1, 2.04, 0);
  // o totem dos preços na frente, à direita
  block(ctx, 0.1, 1.3, 0.1, p.cars.trim, 1.5, 0, 0.95);
  block(ctx, 0.5, 0.75, 0.1, p.wall, 1.5, 1.3, 0.95);
  block(ctx, 0.52, 0.16, 0.11, p.amber, 1.5, 1.85, 0.95);
}

function signpost(ctx: Ctx): void {
  const { p } = ctx;
  mesh(ctx, new CylinderGeometry(0.05, 0.05, 1.5, 6), p.cars.trim, 0, 0.75, 0);
  block(ctx, 0.95, 0.65, 0.08, p.sign, 0, 1.45, 0);
  block(ctx, 0.75, 0.12, 0.09, p.cars.chrome, 0, 1.7, 0);
}

const BUILDERS: Record<StopKind, (ctx: Ctx) => void> = {
  origin: house,
  transit: marker,
  nature: grove,
  winery,
  hotel,
  food: restaurant,
  event: stage,
  city: cityBlock,
  fuel: fuelStation,
  other: signpost,
};

export function buildMiniature(kind: StopKind, seed = 1): Miniature {
  const kit = new Kit();
  const p = palette(kit);
  const group = new Group();
  group.name = `stop:${kind}`;
  const ctx: Ctx = { kit, p, r: rng(seed), group };
  BUILDERS[kind](ctx);
  const box: Box = MINIATURE_BOX[kind];
  let disposed = false;
  return {
    kind,
    group,
    box,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      p.cars.dispose();
      kit.dispose();
    },
  };
}
