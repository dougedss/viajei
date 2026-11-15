import type { StopKind } from '@shared/constants.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
  type Texture,
} from 'three/webgpu';
import { Kit } from '../cars/kit.ts';
import { carMaterials, type CarMaterials } from '../cars/materials.ts';
import { canvasTexture } from '../textures.ts';
import { MINIATURE_BOX, type Box, type Miniature } from './types.ts';

/**
 * Os construtores das peças, um por tipo de parada (fase 22, na escala do dia inteiro): a casa com
 * o quintal (origem), o abrigo da estrada (deslocamento), o bosque com o mirante e a lagoa
 * (natureza), a cantina de pedra com os parreirais e os barris (vinícola), o hotel de dois andares
 * com a ala, o estacionamento e o letreiro, o restaurante com o toldo listrado e a varanda de mesas
 * (comida), o palco com a cobertura, as caixas de som e a plateia (evento), o quarteirão de cinco
 * torres com a praça e o chafariz (cidade), o posto com a cobertura, as bombas e a loja (fase 15) e a
 * placa da estrada (outro). Low-poly, com sombreamento chapado, a paleta própria e os materiais dos
 * carros (vidro, cromado, borracha, plástico escuro). Cada peça termina com as malhas de um mesmo
 * material fundidas numa só (uma dezena de chamadas de desenho por peça, não centenas). O `seed` só
 * varia o que não muda a caixa: cores e variantes simétricas.
 */
type Palette = {
  wall: MeshStandardMaterial;
  wall2: MeshStandardMaterial;
  wall3: MeshStandardMaterial;
  roof: MeshStandardMaterial;
  roof2: MeshStandardMaterial;
  slate: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  leaf: MeshStandardMaterial;
  leaf2: MeshStandardMaterial;
  leaf3: MeshStandardMaterial;
  trunk: MeshStandardMaterial;
  awning: MeshStandardMaterial;
  awning2: MeshStandardMaterial;
  stone: MeshStandardMaterial;
  stone2: MeshStandardMaterial;
  sign: MeshStandardMaterial;
  concrete: MeshStandardMaterial;
  concrete2: MeshStandardMaterial;
  asphalt: MeshStandardMaterial;
  sand: MeshStandardMaterial;
  stage: MeshStandardMaterial;
  barrel: MeshStandardMaterial;
  amber: MeshStandardMaterial;
  water: MeshStandardMaterial;
  flowerA: MeshStandardMaterial;
  flowerB: MeshStandardMaterial;
  flowerC: MeshStandardMaterial;
  skin: MeshStandardMaterial;
  shirts: MeshStandardMaterial[];
  paints: MeshStandardMaterial[];
  /** as janelas que acendem à noite */
  win: MeshStandardMaterial;
  /** as lâmpadas dos postes */
  lamp: MeshStandardMaterial;
  cars: CarMaterials;
};

const flat = (color: number, roughness = 0.9) =>
  new MeshStandardMaterial({ color, roughness, flatShading: true });

function palette(kit: Kit): Palette {
  const own = <T extends Material>(m: T): T => kit.own(m);
  return {
    wall: own(flat(0xf1ebe0)),
    wall2: own(flat(0xe8dcc7)),
    wall3: own(flat(0xf6efe0)),
    roof: own(flat(0x8f4a37)),
    roof2: own(flat(0x6e4636)),
    slate: own(flat(0x4b525d)),
    wood: own(flat(0x8a6a46)),
    leaf: own(flat(0x3f7a3a)),
    leaf2: own(flat(0x5f9e45)),
    leaf3: own(flat(0x2c5a34)),
    trunk: own(flat(0x6b4a2f)),
    awning: own(flat(0xe8653a, 0.8)),
    awning2: own(flat(0xf6f1e4, 0.8)),
    stone: own(flat(0x8d867a)),
    stone2: own(flat(0x6f6a62)),
    sign: own(flat(0x2f6f3e, 0.6)),
    concrete: own(flat(0xc9c6bd, 0.7)),
    concrete2: own(flat(0xaab3bf, 0.7)),
    asphalt: own(flat(0x3b4250, 0.95)),
    sand: own(flat(0xd9cba0, 0.95)),
    stage: own(flat(0x22252b, 0.8)),
    barrel: own(flat(0x7a5230, 0.85)),
    // o âmbar do Posto (`--color-stop-fuel`): a faixa da cobertura e as bombas
    amber: own(flat(0xc27c1a, 0.7)),
    water: own(new MeshStandardMaterial({ color: 0x4a9bb8, roughness: 0.12 })),
    flowerA: own(flat(0xd6453f, 0.8)),
    flowerB: own(flat(0xf2c14e, 0.8)),
    flowerC: own(flat(0x6f8fe0, 0.8)),
    skin: own(flat(0xe7c3a0, 0.8)),
    shirts: [0xd6453f, 0x3a6ea5, 0xf2c14e, 0x2fbf7f, 0xf1eee7, 0x8f7fe0].map((c) =>
      own(flat(c, 0.85)),
    ),
    paints: [0xe8653a, 0x3a6ea5, 0xd9dde3, 0x22252b, 0x8f2f2a].map((c) => own(flat(c, 0.4))),
    win: own(
      new MeshStandardMaterial({
        color: 0x35527c,
        emissive: 0xffd98a,
        emissiveIntensity: 0,
        roughness: 0.3,
      }),
    ),
    lamp: own(
      new MeshStandardMaterial({
        color: 0xfff3cf,
        emissive: 0xffd98a,
        emissiveIntensity: 0.2,
        roughness: 0.3,
      }),
    ),
    cars: carMaterials(),
  };
}

/** Um gerador determinístico pequeno (o mesmo do mundo), só para cores e variantes. */
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

function pick<T>(arr: readonly T[], r: number): T | undefined {
  return arr[Math.floor(r * arr.length) % arr.length];
}

function mesh(ctx: Ctx, geo: BufferGeometry, mat: Material, x: number, y: number, z: number): Mesh {
  const m = new Mesh(ctx.kit.own(geo), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  ctx.group.add(m);
  return m;
}

/** Uma caixa com a base em `y` (não no centro), com um giro opcional em torno de y. */
function block(
  ctx: Ctx,
  w: number,
  h: number,
  d: number,
  mat: Material,
  x = 0,
  y = 0,
  z = 0,
  ry = 0,
): Mesh {
  const m = mesh(ctx, new BoxGeometry(w, h, d), mat, x, y + h / 2, z);
  m.rotation.y = ry;
  return m;
}

/** Um telhado de quatro águas (cone de 4 lados) com a base em `y`. */
function hip(
  ctx: Ctx,
  w: number,
  d: number,
  h: number,
  mat: Material,
  x: number,
  y: number,
  z: number,
): Mesh {
  const g = new ConeGeometry(Math.hypot(w, d) / 2 + 0.05, h, 4);
  g.rotateY(Math.PI / 4);
  g.scale(w / Math.hypot(w, d) / 0.7071, 1, d / Math.hypot(w, d) / 0.7071);
  return mesh(ctx, g, mat, x, y + h / 2, z);
}

/** Um telhado de duas águas: o prisma triangular com a cumeeira ao longo de x, a base em `y`. */
function gableGeometry(w: number, h: number, d: number): BufferGeometry {
  const hw = w / 2;
  const hd = d / 2;
  // os vértices repetidos por face, para o sombreamento chapado sair limpo
  const v = (x: number, y: number, z: number) => [x, y, z];
  const tri = (a: number[], b: number[], c: number[]) => [...a, ...b, ...c];
  const A = v(-hw, 0, hd);
  const B = v(hw, 0, hd);
  const C = v(hw, 0, -hd);
  const D = v(-hw, 0, -hd);
  const E = v(-hw, h, 0);
  const F = v(hw, h, 0);
  const pos = [
    // a água da frente (+z) e a de trás (−z)
    ...tri(A, B, F),
    ...tri(A, F, E),
    ...tri(C, D, E),
    ...tri(C, E, F),
    // as empenas
    ...tri(D, A, E),
    ...tri(B, C, F),
    // o fundo
    ...tri(A, D, C),
    ...tri(A, C, B),
  ];
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(new Array<number>((pos.length / 3) * 2).fill(0), 2),
  );
  geo.computeVertexNormals();
  return geo;
}

function gable(
  ctx: Ctx,
  w: number,
  h: number,
  d: number,
  mat: Material,
  x: number,
  y: number,
  z: number,
  ry = 0,
): Mesh {
  const m = mesh(ctx, gableGeometry(w, h, d), mat, x, y, z);
  m.rotation.y = ry;
  return m;
}

function tree(ctx: Ctx, x: number, z: number, scale: number, round: boolean, mat?: Material): void {
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
    mesh(
      ctx,
      new IcosahedronGeometry(0.75 * scale, 1),
      mat ?? ctx.p.leaf2,
      x,
      trunkH + 0.6 * scale,
      z,
    );
  } else {
    const h = 1.9 * scale;
    mesh(ctx, new ConeGeometry(0.7 * scale, h, 7), mat ?? ctx.p.leaf, x, trunkH - 0.1 + h / 2, z);
  }
}

/** Uma janela na frente (+z local): um retângulo que acende à noite. */
function win(ctx: Ctx, w: number, h: number, x: number, y: number, z: number, ry = 0): void {
  block(ctx, w, h, 0.08, ctx.p.win, x, y, z, ry);
}

/** Um poste com a lâmpada que acende à noite. */
function lamp(ctx: Ctx, x: number, z: number, h = 2.4): void {
  mesh(ctx, new CylinderGeometry(0.05, 0.07, h, 6), ctx.p.cars.trim, x, h / 2, z);
  mesh(ctx, new SphereGeometry(0.2, 10, 8), ctx.p.lamp, x, h + 0.16, z);
}

/** Um carro de brinquedo estacionado (bem menor que o carro de quem olha). */
function miniCar(ctx: Ctx, x: number, z: number, ry: number, paint: Material): void {
  block(ctx, 1.1, 0.4, 2.2, paint, x, 0.3, z, ry);
  block(ctx, 0.95, 0.38, 1.15, ctx.p.cars.glass, x, 0.7, z, ry);
  for (const [dx, dz] of [
    [-0.55, -0.7],
    [0.55, -0.7],
    [-0.55, 0.7],
    [0.55, 0.7],
  ] as const) {
    const w = mesh(ctx, new CylinderGeometry(0.26, 0.26, 0.22, 10), ctx.p.cars.rubber, 0, 0, 0);
    w.rotation.z = Math.PI / 2;
    w.position.set(
      x + dx * Math.cos(ry) + dz * Math.sin(ry),
      0.28,
      z - dx * Math.sin(ry) + dz * Math.cos(ry),
    );
    w.rotation.y = ry;
  }
}

/** Uma pessoa pequena: o corpo e a cabeça. */
function person(ctx: Ctx, x: number, z: number, shirt: Material): void {
  mesh(ctx, new CylinderGeometry(0.16, 0.2, 0.75, 6), shirt, x, 0.375, z);
  mesh(ctx, new SphereGeometry(0.17, 8, 6), ctx.p.skin, x, 0.95, z);
}

/** Uma cerca baixa ao longo de x, centrada em (x, z). */
function fence(ctx: Ctx, length: number, x: number, z: number): void {
  const n = Math.max(2, Math.round(length / 1.2));
  for (let i = 0; i <= n; i++) {
    block(ctx, 0.12, 0.7, 0.12, ctx.p.wood, x - length / 2 + (i * length) / n, 0, z);
  }
  block(ctx, length, 0.08, 0.06, ctx.p.wood, x, 0.55, z);
  block(ctx, length, 0.08, 0.06, ctx.p.wood, x, 0.3, z);
}

// ------------------------------------------------------------------ os tipos
function house(ctx: Ctx): void {
  const { p, r } = ctx;
  const roofMat = r() < 0.5 ? p.roof : p.roof2;
  // a casa com o telhado de duas águas e a chaminé
  block(ctx, 6.6, 3.4, 5.2, p.wall, -1.4, 0, -1);
  gable(ctx, 7.4, 2.2, 6, roofMat, -1.4, 3.4, -1);
  block(ctx, 0.6, 1.6, 0.6, p.stone, -3.6, 4.2, -2);
  // a porta, as janelas da frente e das laterais
  block(ctx, 0.9, 1.6, 0.1, p.cars.dark, -0.2, 0, 1.62);
  win(ctx, 1.0, 0.9, -3.2, 1.2, 1.62);
  win(ctx, 1.0, 0.9, 1.0, 1.2, 1.62);
  win(ctx, 1.0, 0.9, -3.2, 1.2, -3.62);
  win(ctx, 0.9, 0.9, -4.72, 1.2, -1, Math.PI / 2);
  // a garagem anexa, com o portão
  block(ctx, 3.2, 2.5, 4, p.wall2, 3.6, 0, -0.4);
  block(ctx, 3.5, 0.3, 4.3, roofMat, 3.6, 2.5, -0.4);
  block(ctx, 2.2, 1.9, 0.1, p.cars.trim, 3.6, 0, 1.62);
  // o caminho até a porta, a entrada da garagem e o carro na frente dela
  block(ctx, 1.2, 0.08, 3.2, p.sand, -0.2, 0, 3.3);
  block(ctx, 2.6, 0.08, 3.2, p.asphalt, 3.6, 0, 3.3);
  miniCar(ctx, 3.6, 3.4, 0, pick(p.paints, r()) ?? p.paints[0] ?? p.wall);
  // a cerca da frente, com a abertura do caminho e da garagem
  fence(ctx, 3.4, -4.1, 4.7);
  // as árvores do quintal e os canteiros
  tree(ctx, -4.9, -3.6, 1.15, true);
  tree(ctx, 4.9, -3.6, 1.0, true, p.leaf);
  for (const [x, z, m] of [
    [-2.4, 2.4, p.flowerA],
    [-3.4, 2.4, p.flowerB],
    [1.3, 2.4, p.flowerC],
  ] as const) {
    mesh(ctx, new IcosahedronGeometry(0.32, 1), m, x, 0.34, z);
  }
  lamp(ctx, 1.4, 4.4, 1.8);
}

function shelter(ctx: Ctx): void {
  const { p } = ctx;
  // o abrigo da estrada: três paredes baixas, o banco e a cobertura
  block(ctx, 2.8, 0.12, 1.6, p.concrete, -0.8, 0, 0);
  block(ctx, 2.8, 2.1, 0.12, p.wall2, -0.8, 0, -0.74);
  block(ctx, 0.12, 2.1, 1.6, p.wall2, -2.14, 0, 0);
  block(ctx, 0.12, 2.1, 1.6, p.wall2, 0.54, 0, 0);
  block(ctx, 3.1, 0.18, 1.9, p.slate, -0.8, 2.1, 0);
  block(ctx, 2.2, 0.1, 0.5, p.wood, -0.8, 0.55, -0.35);
  block(ctx, 0.1, 0.45, 0.4, p.wood, -1.7, 0.1, -0.35);
  block(ctx, 0.1, 0.45, 0.4, p.wood, 0.1, 0.1, -0.35);
  // a placa do ponto e o marco quilométrico
  mesh(ctx, new CylinderGeometry(0.05, 0.05, 2.6, 6), p.cars.trim, 1.6, 1.3, 0.5);
  block(ctx, 0.9, 0.55, 0.08, p.sign, 1.6, 2.3, 0.5);
  block(ctx, 0.5, 0.75, 0.3, p.concrete, 2.4, 0, -0.5);
  block(ctx, 0.5, 0.22, 0.31, p.cars.trim, 2.4, 0.45, -0.5);
  // um arbusto
  mesh(ctx, new IcosahedronGeometry(0.5, 1), p.leaf2, -2.5, 0.52, 0.9);
}

function grove(ctx: Ctx): void {
  const { p, r } = ctx;
  // a lagoa na frente, com a borda de areia
  mesh(ctx, new CylinderGeometry(3.0, 3.2, 0.2, 24), p.sand, -4.2, 0.1, 3.6);
  const pond = mesh(ctx, new CircleGeometry(2.6, 24), p.water, -4.2, 0.23, 3.6);
  pond.rotation.x = -Math.PI / 2;
  // o paredão de pedra atrás, em três blocos, com a queda d'água
  block(ctx, 4.2, 5.2, 2.6, p.stone, -3.4, 0, -5.4);
  block(ctx, 3.6, 6.4, 2.4, p.stone2, 0.2, 0, -5.6);
  block(ctx, 3.0, 4.4, 2.2, p.stone, 3.4, 0, -5.4);
  block(ctx, 0.7, 5.9, 0.12, p.water, 0.0, 0.3, -4.34);
  block(ctx, 1.6, 0.14, 3.2, p.water, 0.0, 0.08, -2.6);
  // o mirante de madeira: o estrado sobre postes, a guarda e a escada
  for (const [x, z] of [
    [2.6, 1.0],
    [6.2, 1.0],
    [2.6, 3.8],
    [6.2, 3.8],
  ] as const) {
    block(ctx, 0.18, 1.3, 0.18, p.wood, x, 0, z);
  }
  block(ctx, 4.2, 0.18, 3.2, p.wood, 4.4, 1.3, 2.4);
  for (const [x, z, w, d] of [
    [4.4, 0.85, 4.2, 0.08],
    [2.35, 2.4, 0.08, 3.2],
    [6.45, 2.4, 0.08, 3.2],
  ] as const) {
    block(ctx, w, 0.75, d, p.wood, x, 1.48, z);
  }
  block(ctx, 1.4, 0.12, 1.2, p.wood, 4.4, 0.9, 4.5);
  block(ctx, 1.4, 0.12, 1.2, p.wood, 4.4, 0.45, 5.3);
  for (const [x, z] of [
    [3.6, 2.2],
    [5.0, 2.6],
  ] as const) {
    person(ctx, x, z, pick(p.shirts, r()) ?? p.wall);
    ctx.group.children.at(-1)?.position.setY(1.48 + 0.95);
    ctx.group.children.at(-2)?.position.setY(1.48 + 0.375);
  }
  // as árvores: pinheiros altos atrás e redondas na frente, com dois gigantes
  const trees: readonly [number, number, number, boolean][] = [
    [-7.0, -2.2, 2.6, false],
    [-6.0, 0.6, 2.3, true],
    [-7.2, 5.0, 1.8, true],
    [-1.6, -1.4, 3.1, false],
    [1.4, -0.4, 2.4, true],
    [6.8, -2.4, 2.6, false],
    [7.1, 5.2, 1.9, true],
    [-0.4, 5.4, 1.9, true],
    [6.4, -0.2, 2.0, false],
  ];
  for (const [x, z, s, round] of trees) {
    tree(ctx, x, z, s, round, round ? (r() < 0.5 ? p.leaf2 : p.leaf) : p.leaf3);
  }
  // as pedras soltas
  for (const [x, z, s] of [
    [-6.6, 6.4, 0.7],
    [1.9, 5.0, 0.5],
    [-2.4, 2.0, 0.6],
  ] as const) {
    mesh(ctx, new IcosahedronGeometry(s, 0), p.stone2, x, s, z);
  }
}

function winery(ctx: Ctx): void {
  const { p, r } = ctx;
  // a cantina de pedra com o telhado escuro e a porta em arco
  block(ctx, 6.2, 3.2, 4.6, p.stone, -5.2, 0, -3.2);
  gable(ctx, 7.0, 2.0, 5.4, p.roof2, -5.2, 3.2, -3.2);
  block(ctx, 0.6, 1.2, 0.6, p.stone2, -7.2, 4.2, -3.8);
  block(ctx, 1.1, 1.8, 0.1, p.cars.dark, -5.2, 0, -0.84);
  win(ctx, 0.8, 0.8, -7.0, 1.4, -0.84);
  win(ctx, 0.8, 0.8, -3.4, 1.4, -0.84);
  // os barris na frente da cantina, deitados, apoiados pelos aros
  for (const [x, y, z] of [
    [-6.4, 0.44, 1.0],
    [-5.2, 0.44, 1.0],
    [-5.8, 1.2, 1.0],
  ] as const) {
    const barrel = mesh(ctx, new CylinderGeometry(0.42, 0.42, 1.0, 12), p.barrel, x, y, z);
    barrel.rotation.z = Math.PI / 2;
    for (const dx of [-0.32, 0.32]) {
      const h = mesh(ctx, new CylinderGeometry(0.44, 0.44, 0.06, 12), p.cars.chrome, x + dx, y, z);
      h.rotation.z = Math.PI / 2;
    }
  }
  // os parreirais: cinco fileiras de postes e videira, com os caminhos de terra entre elas
  for (const row of [-5, -2.5, 0, 2.5, 5]) {
    const len = 9;
    const x0 = 3.6;
    for (let k = -2; k <= 2; k++) block(ctx, 0.1, 1.1, 0.1, p.wood, x0 + (k * len) / 4, 0, row);
    block(ctx, len, 0.55, 0.32, r() < 0.5 ? p.leaf : p.leaf2, x0, 0.5, row);
    block(ctx, len, 0.04, 0.04, p.cars.chrome, x0, 1.08, row);
    block(ctx, len + 0.6, 0.06, 1.0, p.sand, x0, 0, row + 1.25);
  }
  // a placa da vinícola e um trator de brinquedo
  mesh(ctx, new CylinderGeometry(0.06, 0.06, 1.8, 6), p.wood, -1.6, 0.9, 4.6);
  block(ctx, 2.0, 0.7, 0.1, p.wood, -1.6, 1.6, 4.6);
  block(ctx, 1.2, 0.5, 1.9, p.flowerA, -8.0, 0.4, 3.6);
  block(ctx, 0.9, 0.6, 0.9, p.cars.glass, -8.0, 0.9, 3.2);
  for (const [dx, dz, rad] of [
    [-0.7, -0.6, 0.45],
    [0.7, -0.6, 0.45],
    [-0.7, 0.75, 0.3],
    [0.7, 0.75, 0.3],
  ] as const) {
    const w = mesh(
      ctx,
      new CylinderGeometry(rad, rad, 0.3, 10),
      p.cars.rubber,
      -8.0 + dx,
      rad,
      3.6 + dz,
    );
    w.rotation.z = Math.PI / 2;
  }
  tree(ctx, -2.4, -5.2, 1.6, true, p.leaf3);
}

function hotel(ctx: Ctx): void {
  const { p, r } = ctx;
  const wall = r() < 0.5 ? p.wall : p.wall3;
  // o bloco principal de dois andares com o sótão, e a ala à direita
  block(ctx, 9.6, 6.2, 5.8, wall, -1.6, 0, -2.2);
  gable(ctx, 10.4, 2.4, 6.6, p.roof, -1.6, 6.2, -2.2);
  block(ctx, 4.0, 3.6, 4.4, p.wall2, 5.4, 0, -2.6);
  gable(ctx, 4.6, 1.6, 5.0, p.roof, 5.4, 3.6, -2.6);
  // duas fileiras de janelas na frente, as do sótão e as da ala
  for (const y of [1.2, 3.9]) {
    for (const x of [-5.4, -3.9, -2.4, 0.6, 2.1]) win(ctx, 0.9, 1.2, x, y, 0.72);
  }
  win(ctx, 0.8, 0.8, -3.4, 7.0, 0.1);
  win(ctx, 0.8, 0.8, 0.2, 7.0, 0.1);
  for (const x of [4.4, 6.4]) win(ctx, 0.9, 1.1, x, 1.3, 0.32 - 0.4);
  // a entrada: a escada, as colunas e a marquise
  block(ctx, 2.6, 2.3, 0.1, p.cars.glass, -0.9, 0, 0.72);
  block(ctx, 3.4, 0.3, 1.6, p.concrete, -0.9, 0, 1.5);
  for (const x of [-2.2, 0.4])
    mesh(ctx, new CylinderGeometry(0.14, 0.14, 2.6, 8), p.wall3, x, 1.6, 2.0);
  block(ctx, 3.8, 0.25, 2.0, p.roof2, -0.9, 2.9, 1.6);
  // o letreiro no telhado
  block(ctx, 3.6, 0.9, 0.2, p.sign, -1.6, 8.4, -0.6);
  for (const x of [-3.2, 0.0]) block(ctx, 0.1, 0.6, 0.1, p.cars.chrome, x, 7.8, -0.6);
  // o estacionamento com os carros, os postes e as sebes
  block(ctx, 13.6, 0.08, 4.2, p.asphalt, 0.0, 0, 3.8);
  for (const [x, i] of [
    [-5.2, 0],
    [-3.0, 1],
    [2.6, 2],
    [5.0, 3],
  ] as const) {
    miniCar(ctx, x, 4.2, 0, pick(p.paints, (r() + i * 0.37) % 1) ?? p.wall);
  }
  lamp(ctx, -7.2, 2.4, 2.6);
  lamp(ctx, 7.2, 2.4, 2.6);
  block(ctx, 3.0, 0.7, 0.6, p.leaf, -5.6, 0, 1.6);
  block(ctx, 3.0, 0.7, 0.6, p.leaf, 2.8, 0, 1.6);
  tree(ctx, -6.6, -4.4, 1.2, true);
}

function restaurant(ctx: Ctx): void {
  const { p, r } = ctx;
  // o salão com o telhado baixo de quatro águas e a chaminé da cozinha
  block(ctx, 8.2, 3.4, 5.0, p.wall, -1.4, 0, -2.6);
  hip(ctx, 8.8, 5.6, 1.5, p.roof, -1.4, 3.4, -2.6);
  block(ctx, 0.5, 1.4, 0.5, p.stone, -4.6, 3.9, -3.6);
  // a vitrine, a porta e as janelas
  block(ctx, 3.0, 1.6, 0.1, p.cars.glass, -2.6, 0.9, -0.08);
  block(ctx, 1.0, 2.2, 0.1, p.cars.dark, 0.4, 0, -0.08);
  win(ctx, 1.0, 0.9, 1.9, 1.3, -0.08);
  win(ctx, 1.0, 0.9, -5.56, 1.3, -2.6, Math.PI / 2);
  // o toldo listrado inclinado sobre a frente inteira
  for (let i = 0; i < 12; i++) {
    const m = block(ctx, 0.7, 0.08, 1.9, i % 2 ? p.awning2 : p.awning, -5.35 + i * 0.72, 2.9, 0.75);
    m.rotation.x = 0.32;
  }
  // a varanda: o piso, as mesas com guarda-sol e as cadeiras
  block(ctx, 10.0, 0.1, 5.2, p.sand, -0.4, 0, 2.6);
  for (const [x, z, i] of [
    [-4.0, 2.2, 0],
    [-1.2, 3.4, 1],
    [1.8, 2.0, 2],
    [4.0, 3.8, 3],
  ] as const) {
    mesh(ctx, new CylinderGeometry(0.04, 0.04, 0.75, 6), p.cars.trim, x, 0.47, z);
    mesh(ctx, new CylinderGeometry(0.55, 0.55, 0.06, 12), p.wood, x, 0.85, z);
    mesh(ctx, new CylinderGeometry(0.03, 0.03, 1.6, 5), p.cars.trim, x, 1.6, z);
    mesh(ctx, new ConeGeometry(1.0, 0.45, 8), i % 2 ? p.awning2 : p.awning, x, 2.4, z);
    for (const [dx, dz] of [
      [-0.75, 0],
      [0.75, 0],
      [0, -0.75],
      [0, 0.75],
    ] as const) {
      block(ctx, 0.4, 0.45, 0.4, p.wood, x + dx, 0.1, z + dz);
    }
    if (r() < 0.6) person(ctx, x + 0.95, z, pick(p.shirts, r()) ?? p.wall);
  }
  // a placa na calçada, os vasos e a árvore
  mesh(ctx, new CylinderGeometry(0.06, 0.06, 2.6, 6), p.cars.trim, 6.2, 1.3, 1.2);
  block(ctx, 1.8, 0.8, 0.1, p.awning, 6.2, 2.4, 1.2);
  for (const x of [-6.8, 6.4]) {
    mesh(ctx, new CylinderGeometry(0.4, 0.3, 0.6, 8), p.roof2, x, 0.3, 4.6);
    mesh(ctx, new IcosahedronGeometry(0.45, 1), p.leaf2, x, 0.95, 4.6);
  }
  tree(ctx, 6.4, -3.8, 1.4, true, p.leaf3);
}

function stage(ctx: Ctx): void {
  const { p, r } = ctx;
  // o estrado, a parede de fundo e a cobertura sobre quatro treliças
  block(ctx, 11.0, 1.0, 5.8, p.stage, 0, 0, -3.4);
  block(ctx, 11.0, 5.0, 0.3, p.cars.dark, 0, 1.0, -6.1);
  for (const [x, z] of [
    [-5.3, -0.7],
    [5.3, -0.7],
    [-5.3, -6.0],
    [5.3, -6.0],
  ] as const) {
    block(ctx, 0.22, 6.6, 0.22, p.cars.chrome, x, 0, z);
  }
  block(ctx, 12.0, 0.35, 7.0, p.cars.trim, 0, 6.6, -3.4);
  // as caixas de som empilhadas, os refletores e a banda
  for (const x of [-4.6, 4.6]) {
    block(ctx, 1.1, 1.3, 1.0, p.stage, x, 1.0, -1.2);
    block(ctx, 0.9, 1.1, 0.9, p.stage, x, 2.3, -1.2);
  }
  for (const x of [-3.6, -1.2, 1.2, 3.6])
    mesh(ctx, new SphereGeometry(0.22, 8, 6), p.lamp, x, 6.4, -1.0);
  for (const [x, z] of [
    [-1.6, -3.0],
    [0.0, -2.4],
    [1.6, -3.2],
  ] as const) {
    person(ctx, x, z, pick(p.shirts, r()) ?? p.wall);
    ctx.group.children.at(-1)?.position.setY(1.0 + 0.95);
    ctx.group.children.at(-2)?.position.setY(1.0 + 0.375);
  }
  // a plateia em fileiras, as bandeiras e o carrinho de comida
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 7 - row; i++) {
      const x = -4.2 + (row % 2) * 0.6 + i * 1.3;
      person(ctx, x, 1.2 + row * 1.3, pick(p.shirts, r()) ?? p.wall);
    }
  }
  for (const x of [-8.2, 8.2]) {
    mesh(ctx, new CylinderGeometry(0.06, 0.06, 7.6, 6), p.cars.chrome, x, 3.8, 2.0);
    block(ctx, 1.4, 0.9, 0.06, x < 0 ? p.awning : p.flowerC, x + 0.75, 6.4, 2.0);
  }
  block(ctx, 2.6, 2.0, 1.6, p.wall3, 7.0, 0, 5.4);
  block(ctx, 2.8, 0.15, 1.9, p.awning, 7.0, 2.0, 5.4);
  block(ctx, 1.6, 0.6, 0.06, p.cars.glass, 7.0, 1.0, 6.24);
  lamp(ctx, -7.6, 5.8, 2.2);
}

function cityBlock(ctx: Ctx): void {
  const { p, r } = ctx;
  // a praça de asfalto e as cinco torres de alturas diferentes, com as janelas na frente e nas laterais
  block(ctx, 17.4, 0.12, 15.4, p.asphalt, 0, 0, 0);
  const towers: readonly [number, number, number, number, number][] = [
    [-6.0, -4.0, 4.0, 14.0, 4.0],
    [-1.0, -5.0, 3.6, 16.9, 3.6],
    [4.8, -4.4, 4.4, 11.0, 4.4],
    [-5.8, 2.6, 3.4, 8.0, 3.4],
    [5.2, 3.2, 3.8, 9.5, 3.8],
  ];
  towers.forEach(([x, z, w, h, d], i) => {
    const wall = i % 2 === 0 ? (r() < 0.5 ? p.concrete : p.concrete2) : p.wall2;
    block(ctx, w, h, d, wall, x, 0.12, z);
    block(ctx, w * 0.5, 0.5, d * 0.5, p.cars.trim, x, h + 0.12, z);
    for (let y = 1.0; y < h - 0.8; y += 1.4) {
      win(ctx, w * 0.74, 0.55, x, y, z + d / 2 + 0.01);
      win(ctx, d * 0.74, 0.55, x + w / 2 + 0.01, y, z, Math.PI / 2);
    }
  });
  // o chafariz no meio da praça, os canteiros, as árvores e os postes
  mesh(ctx, new CylinderGeometry(1.6, 1.7, 0.4, 16), p.stone, 0, 0.32, 1.6);
  const pool = mesh(ctx, new CircleGeometry(1.4, 16), p.water, 0, 0.54, 1.6);
  pool.rotation.x = -Math.PI / 2;
  mesh(ctx, new CylinderGeometry(0.12, 0.2, 1.2, 8), p.stone2, 0, 1.0, 1.6);
  mesh(ctx, new SphereGeometry(0.3, 8, 6), p.water, 0, 1.7, 1.6);
  for (const [x, z, m] of [
    [-2.6, 4.6, p.flowerA],
    [2.6, 4.6, p.flowerB],
    [-2.6, -1.4, p.flowerC],
    [2.6, -1.4, p.flowerA],
  ] as const) {
    block(ctx, 1.6, 0.3, 1.6, p.stone, x, 0.12, z);
    mesh(ctx, new IcosahedronGeometry(0.5, 1), m, x, 0.75, z);
  }
  for (const [x, z] of [
    [-3.0, 6.6],
    [3.0, 6.6],
    [0.0, -1.8],
  ] as const) {
    tree(ctx, x, z, 1.4, true, p.leaf2);
  }
  lamp(ctx, -1.8, 6.8, 2.8);
  lamp(ctx, 1.8, 6.8, 2.8);
  miniCar(ctx, -7.6, 6.4, Math.PI / 2, pick(p.paints, r()) ?? p.wall);
  miniCar(ctx, 7.6, 6.4, Math.PI / 2, pick(p.paints, r()) ?? p.wall);
}

function fuelStation(ctx: Ctx): void {
  const { p, r } = ctx;
  // o pátio, a cobertura sobre quatro colunas com a faixa âmbar, e as duas ilhas de bombas
  block(ctx, 15.4, 0.1, 11.4, p.asphalt, 0, 0, 0);
  for (const [x, z] of [
    [-4.6, -1.6],
    [4.6, -1.6],
    [-4.6, 3.0],
    [4.6, 3.0],
  ] as const) {
    block(ctx, 0.26, 5.0, 0.26, p.cars.chrome, x, 0.1, z);
  }
  block(ctx, 12.0, 0.5, 7.0, p.wall, 0, 5.1, 0.7);
  block(ctx, 12.04, 0.22, 7.04, p.amber, 0, 5.3, 0.7);
  for (const x of [-2.6, 2.6]) {
    block(ctx, 3.6, 0.18, 1.3, p.concrete, x, 0.1, 0.7);
    for (const dx of [-1.0, 1.0]) {
      block(ctx, 0.6, 1.5, 0.5, p.amber, x + dx, 0.28, 0.7);
      block(ctx, 0.4, 0.3, 0.05, p.cars.glass, x + dx, 1.2, 0.98);
      block(ctx, 0.08, 0.8, 0.08, p.cars.rubber, x + dx + 0.34, 0.5, 0.9);
    }
  }
  // a loja atrás, com a vitrine e a porta, e o totem de preços na frente
  block(ctx, 5.4, 3.4, 4.2, p.wall2, -4.4, 0.1, -3.4);
  block(ctx, 5.8, 0.3, 4.6, p.cars.trim, -4.4, 3.5, -3.4);
  block(ctx, 2.6, 1.6, 0.1, p.cars.glass, -5.2, 1.0, -1.28);
  block(ctx, 1.0, 2.2, 0.1, p.cars.dark, -2.6, 0.1, -1.28);
  win(ctx, 1.2, 0.9, -7.12, 1.5, -3.4, Math.PI / 2);
  block(ctx, 0.22, 5.0, 0.22, p.cars.trim, 6.6, 0.1, 4.6);
  block(ctx, 1.6, 2.0, 0.24, p.wall, 6.6, 4.4, 4.6);
  block(ctx, 1.64, 0.4, 0.26, p.amber, 6.6, 6.0, 4.6);
  // um carro abastecendo e outro saindo
  miniCar(ctx, -2.6, 2.4, 0, pick(p.paints, r()) ?? p.wall);
  miniCar(ctx, 4.6, -3.6, Math.PI / 2, pick(p.paints, r()) ?? p.wall);
  tree(ctx, 6.8, -4.4, 1.2, true);
}

function signpost(ctx: Ctx): void {
  const { p } = ctx;
  // a placa grande da estrada, em dois postes, com a borda cromada
  for (const x of [-1.9, 1.9])
    mesh(ctx, new CylinderGeometry(0.1, 0.1, 5.4, 8), p.cars.trim, x, 2.7, 0);
  block(ctx, 5.2, 2.4, 0.16, p.sign, 0, 4.4, 0.05);
  block(ctx, 5.4, 0.16, 0.18, p.cars.chrome, 0, 6.8, 0.05);
  block(ctx, 5.4, 0.16, 0.18, p.cars.chrome, 0, 4.3, 0.05);
  block(ctx, 3.6, 0.36, 0.06, p.wall, 0, 5.5, 0.18);
  block(ctx, 2.6, 0.26, 0.06, p.wall, 0, 4.8, 0.18);
  // os arbustos na base
  mesh(ctx, new IcosahedronGeometry(0.55, 1), p.leaf2, -1.6, 0.56, 0.9);
  mesh(ctx, new IcosahedronGeometry(0.45, 1), p.leaf, 1.4, 0.46, 0.9);
}

const BUILDERS: Record<StopKind, (ctx: Ctx) => void> = {
  origin: house,
  transit: shelter,
  nature: grove,
  winery,
  hotel,
  food: restaurant,
  event: stage,
  city: cityBlock,
  fuel: fuelStation,
  other: signpost,
};

// ------------------------------------------------------------------ a fusão e a noite
/**
 * Funde as malhas de um mesmo material numa só (as geometrias já no lugar): uma peça de dezenas de
 * caixas vira uma dezena de chamadas de desenho. As geometrias de origem são descartadas na hora.
 */
function compact(ctx: Ctx): void {
  const { group, kit } = ctx;
  group.updateMatrixWorld(true);
  type Piece = Mesh<BufferGeometry, Material>;
  const byMaterial = new Map<Material, { geos: BufferGeometry[]; meshes: Piece[] }>();
  const inverse = new Matrix4().copy(group.matrixWorld).invert();
  for (const child of [...group.children]) {
    if (!(child instanceof Mesh)) continue;
    const piece = child as Piece;
    const entry = byMaterial.get(piece.material) ?? { geos: [], meshes: [] };
    const local = new Matrix4().multiplyMatrices(inverse, piece.matrixWorld);
    const geo = piece.geometry.clone().applyMatrix4(local);
    entry.geos.push(geo.index ? geo.toNonIndexed() : geo);
    entry.meshes.push(piece);
    byMaterial.set(piece.material, entry);
  }
  for (const [material, { geos, meshes }] of byMaterial) {
    const merged = geos.length > 1 ? mergeGeometries(geos) : (geos[0] ?? null);
    for (const g of geos) if (g !== merged) g.dispose();
    if (!merged) continue;
    for (const m of meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    const one = new Mesh(kit.own(merged), material);
    one.castShadow = true;
    one.receiveShadow = true;
    group.add(one);
  }
}

let poolTex: Texture | null = null;
/** A poça de luz quente: um disco com o brilho caindo do centro para a borda (uma textura para todas). */
function poolTexture(): Texture {
  poolTex ??= canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,190,110,1)');
    grad.addColorStop(0.45, 'rgba(255,170,90,0.55)');
    grad.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  return poolTex;
}

export function buildMiniature(kind: StopKind, seed = 1): Miniature {
  const kit = new Kit();
  const p = palette(kit);
  const group = new Group();
  group.name = `stop:${kind}`;
  const ctx: Ctx = { kit, p, r: rng(seed), group };
  BUILDERS[kind](ctx);
  compact(ctx);
  const box: Box = MINIATURE_BOX[kind];
  // a poça de luz no chão, do tamanho da peça, que só a noite acende
  const poolMat = kit.own(
    new MeshBasicMaterial({
      map: poolTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  const pool = new Mesh(kit.own(new CircleGeometry(Math.max(box.w, box.d) * 0.72, 32)), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  pool.visible = false;
  pool.renderOrder = 2;
  group.add(pool);
  let disposed = false;
  return {
    kind,
    group,
    box,
    setNight: (t) => {
      const k = Math.max(0, Math.min(1, (t - 0.3) / 0.6));
      const s = k * k * (3 - 2 * k);
      p.win.emissiveIntensity = 1.6 * s;
      p.lamp.emissiveIntensity = 0.2 + 2.3 * s;
      poolMat.opacity = 0.55 * s;
      pool.visible = s > 0.01;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      p.cars.dispose();
      kit.dispose();
    },
  };
}
