import type { StopKind } from '@shared/constants.ts';
import {
  copiesOf,
  type LandmarkMaterial,
  type LandmarkRecipe,
  type LandmarkShape,
} from '@shared/landmark-recipe.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  AdditiveBlending,
  Box3,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu';
import { Kit } from '../cars/kit.ts';
import { gableGeometry, palette, poolTexture, rng, type Palette } from '../stops/build.ts';
import { MINIATURE_BOX, type Box, type Miniature } from '../stops/types.ts';

/**
 * O construtor dos cartões-postais (fase 23): monta a receita (`@shared/landmark-recipe.ts`) com as
 * formas de um vocabulário fechado, na linguagem low-poly e com os mesmos materiais das peças por tipo,
 * e devolve uma `Miniature` com o mesmo contrato (o grupo olha para +z, assenta em y = 0, cabe na caixa,
 * acende à noite, descarta uma vez). Nada da receita é executado: ela só escolhe formas e números.
 *
 * - **Cada forma num `try`:** uma forma que não monta (um contorno degenerado, um número que não faz
 *   sentido) fica de fora e conta em `skipped`; a peça continua. Quem chama decide o que fazer com uma
 *   peça vazia (a miniatura do tipo).
 * - **A caixa manda:** as medidas da receita são em metros, na proporção do lugar; no fim a peça inteira
 *   ganha uma escala só para caber na caixa (a da parada, ou a da cidade para o cartão-postal de uma
 *   cidade de passagem), centrada e assentada no chão.
 * - **Fundida por material:** as malhas de um mesmo material viram uma só (uma chamada de desenho por
 *   material), como as peças por tipo.
 * - **Tetos:** as cópias (repetição e espelho), as flores e os vértices; passou, a peça não monta.
 */
export type LandmarkPiece = Miniature & {
  /** formas que não montaram (ficaram de fora) */
  skipped: number;
  /** vértices da peça montada (o orçamento do aparelho) */
  vertices: number;
};

export const LANDMARK_MAX_VERTICES = 120_000;
/** Flores de uma forma e da peça inteira (cada uma é um octaedro de 24 vértices). */
const FLOWERS_PER_SHAPE = 400;
const FLOWERS_TOTAL = 1_200;

type Extra = Record<
  'glass' | 'steel' | 'white' | 'grass' | 'soil' | 'paving' | 'brick' | 'violet' | 'gold',
  MeshStandardMaterial
>;

const flat = (color: number, roughness = 0.9) =>
  new MeshStandardMaterial({ color, roughness, flatShading: true });

function extraMaterials(kit: Kit): Extra {
  const own = <T extends Material>(m: T): T => kit.own(m);
  return {
    // o vidro das estufas e das cúpulas: claro, meio transparente, dos dois lados
    glass: own(
      new MeshStandardMaterial({
        color: 0xcfe9e6,
        roughness: 0.08,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        side: DoubleSide,
      }),
    ),
    steel: own(new MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.4, metalness: 0.5 })),
    white: own(flat(0xf4f5f2, 0.45)),
    grass: own(flat(0x6f9f4c, 0.95)),
    soil: own(flat(0x3a2e27, 0.95)),
    paving: own(flat(0xc9aca3, 0.9)),
    brick: own(flat(0xa8553a, 0.9)),
    violet: own(flat(0x7a5fc0, 0.8)),
    gold: own(new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.6 })),
  };
}

function materialOf(p: Palette, x: Extra, m: LandmarkMaterial): Material {
  switch (m) {
    case 'dark':
      return p.stage;
    case 'glass':
    case 'steel':
    case 'white':
    case 'grass':
    case 'soil':
    case 'paving':
    case 'brick':
    case 'violet':
    case 'gold':
      return x[m];
    default:
      return p[m];
  }
}

/** Uma forma montada no plano dela: as geometrias por material, já no lugar (antes do giro da forma). */
type Parts = { add: (geo: BufferGeometry, m: Material) => void };

const DEG = Math.PI / 180;
const UP = new Vector3(0, 1, 0);
const abs = Math.abs;
const segs = (p: number, fallback: number, min = 3, max = 48) =>
  Math.round(Math.min(max, Math.max(min, p > 0 ? p : fallback)));

/** Os pontos `[x0, z0, …]` como pares; vazio vira o retângulo w × d. */
function pairs(pts: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([pts[i] ?? 0, pts[i + 1] ?? 0]);
  return out;
}
function rect(w: number, d: number): [number, number][] {
  const hw = abs(w) / 2;
  const hd = abs(d) / 2;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
}
function polygonOf(s: LandmarkShape): [number, number][] {
  const poly = pairs(s.pts);
  return poly.length >= 3 ? poly : rect(s.w, s.d);
}
function area(poly: readonly [number, number][]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i] ?? [0, 0];
    const [x2, z2] = poly[(i + 1) % poly.length] ?? [0, 0];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}
function centroid(poly: readonly [number, number][]): [number, number] {
  const n = poly.length || 1;
  return [poly.reduce((a, p) => a + p[0], 0) / n, poly.reduce((a, p) => a + p[1], 0) / n];
}

/** Um polígono horizontal na altura `y` (a tampa de um contorno), com a face para cima. */
function cap(poly: readonly [number, number][], y: number): BufferGeometry {
  // o Shape fica no plano xy; girado -90° em x, (px, -pz) vai para (px, 0, pz) com a face para cima
  const shape = new Shape(poly.map(([px, pz]) => new Vector2(px, -pz)));
  const geo = new ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return geo;
}

/** Triângulos soltos (o sombreamento chapado sai limpo), cada um virado para `out(centro)`. */
function triangles(
  tris: [Vector3, Vector3, Vector3][],
  out: (c: Vector3) => Vector3,
): BufferGeometry {
  const pos: number[] = [];
  const ab = new Vector3();
  const ac = new Vector3();
  const n = new Vector3();
  const c = new Vector3();
  for (const [a, b, d] of tris) {
    ab.subVectors(b, a);
    ac.subVectors(d, a);
    n.crossVectors(ab, ac);
    c.copy(a)
      .add(b)
      .add(d)
      .multiplyScalar(1 / 3);
    const flip = n.dot(out(c)) < 0;
    for (const v of flip ? [a, d, b] : [a, b, d]) pos.push(v.x, v.y, v.z);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute(
    'uv',
    new Float32BufferAttribute(new Array<number>((pos.length / 3) * 2).fill(0), 2),
  );
  geo.computeVertexNormals();
  return geo;
}

/** Uma viga redonda entre dois pontos. */
function strut(a: Vector3, b: Vector3, r: number, sides = 5): BufferGeometry {
  const dir = new Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new CylinderGeometry(r, r, Math.max(len, 1e-3), sides, 1);
  geo.applyQuaternion(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  geo.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geo;
}

/** Uma caixa com a base em y, centrada em (x, z), girada em torno de y. */
function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const geo = new BoxGeometry(
    Math.max(abs(w), 1e-3),
    Math.max(abs(h), 1e-3),
    Math.max(abs(d), 1e-3),
  );
  geo.translate(0, abs(h) / 2, 0);
  if (ry) geo.rotateY(ry);
  geo.translate(x, y, z);
  return geo;
}

/** Um arco (meio toro) de raio `r` no plano xz da frente, centrado em (cx, cy), com o vão para baixo. */
function arcGeo(r: number, t: number, cx: number, cy: number, z = 0): BufferGeometry {
  const geo = new TorusGeometry(Math.max(r, 1e-3), Math.max(t, 1e-3), 4, 10, Math.PI);
  geo.translate(cx, cy, z);
  return geo;
}

/** O leque de um arco: os raios entre o arco de dentro e o de fora, como na estufa. */
function fanGeo(r: number, cx: number, cy: number, t: number): BufferGeometry[] {
  const out: BufferGeometry[] = [arcGeo(r * 0.45, t * 0.8, cx, cy)];
  for (const deg of [30, 60, 90, 120, 150]) {
    const c = Math.cos(deg * DEG);
    const s = Math.sin(deg * DEG);
    out.push(
      strut(
        new Vector3(cx + c * r * 0.45, cy + s * r * 0.45, 0),
        new Vector3(cx + c * r, cy + s * r, 0),
        t * 0.6,
        4,
      ),
    );
  }
  return out;
}

// ------------------------------------------------------------------ as formas
type Mats = { m: Material; m2: Material | null };
type Build = (s: LandmarkShape, mats: Mats, parts: Parts, ctx: Ctx) => void;
type Ctx = { p: Palette; x: Extra; r: () => number; flowers: { left: number } };

/** Uma arcada reta: `n` vãos ao longo de x, de `x0` a `x1` (no plano z = 0, a frente para +z). */
function bayRow(
  len: number,
  h: number,
  t: number,
  bays: number,
  mats: Mats,
  parts: Parts,
  at: (geo: BufferGeometry) => BufferGeometry,
): void {
  const bw = len / bays;
  const col = Math.max(0.06, Math.min(bw * 0.08, t));
  const sill = h * 0.12;
  const spring = h * 0.62;
  const r = Math.max(0.05, bw / 2 - col);
  for (let i = 0; i <= bays; i++) {
    parts.add(at(boxAt(col, h, col, -len / 2 + i * bw, 0, 0)), mats.m);
  }
  parts.add(at(boxAt(len + col, col, col, 0, h - col, 0)), mats.m);
  parts.add(at(boxAt(len, sill, col * 1.6, 0, 0, 0)), mats.m);
  for (let i = 0; i < bays; i++) {
    const cx = -len / 2 + (i + 0.5) * bw;
    parts.add(at(arcGeo(r, col * 0.5, cx, spring)), mats.m);
    for (const g of fanGeo(r, cx, spring, col * 0.5)) parts.add(at(g), mats.m);
    // o pano do vão (o vidro, a parede) por trás da armação
    if (mats.m2) parts.add(at(boxAt(bw, h - sill, 0.02, cx, sill, -col * 0.4)), mats.m2);
  }
}

const BUILDERS: Record<LandmarkShape['k'], Build> = {
  box: (s, { m }, parts) => parts.add(boxAt(s.w, s.h, s.d, 0, 0, 0), m),

  cylinder: (s, { m }, parts) => {
    const r = abs(s.w) / 2;
    const top = r * (1 - Math.min(s.q, 100) / 100);
    const geo = new CylinderGeometry(top, r, Math.max(abs(s.h), 1e-3), segs(s.p, 16));
    geo.translate(0, abs(s.h) / 2, 0);
    if (s.d) geo.scale(1, 1, abs(s.d) / Math.max(abs(s.w), 1e-3));
    parts.add(geo, m);
  },

  cone: (s, { m }, parts) => {
    const geo = new ConeGeometry(abs(s.w) / 2, Math.max(abs(s.h), 1e-3), segs(s.p, 12));
    geo.translate(0, abs(s.h) / 2, 0);
    if (s.d) geo.scale(1, 1, abs(s.d) / Math.max(abs(s.w), 1e-3));
    parts.add(geo, m);
  },

  sphere: (s, { m }, parts) => {
    const r = abs(s.w) / 2;
    const geo = new SphereGeometry(Math.max(r, 1e-3), segs(s.p, 12), 8);
    const h = s.h ? abs(s.h) : abs(s.w);
    geo.scale(1, h / Math.max(2 * r, 1e-3), s.d ? abs(s.d) / Math.max(2 * r, 1e-3) : 1);
    geo.translate(0, h / 2, 0);
    parts.add(geo, m);
  },

  // a cúpula com nervuras: a casca (o material) e a armação (o segundo), os meridianos (p) e os anéis
  // (q), com o arremate no alto
  dome: (s, { m, m2 }, parts) => {
    const rx = Math.max(abs(s.w) / 2, 1e-3);
    const rz = s.d ? abs(s.d) / 2 : rx;
    const h = s.h ? abs(s.h) : rx;
    const shell = new SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    shell.scale(rx, h, rz);
    parts.add(shell, m);
    const frame = m2 ?? m;
    const t = Math.max(0.03, rx * 0.025);
    const ribs = Math.min(48, Math.round(s.p));
    for (let i = 0; i < ribs; i++) {
      const a = (i / ribs) * Math.PI * 2;
      const pts: Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const f = (k / 6) * (Math.PI / 2) * 0.97;
        pts.push(
          new Vector3(
            Math.cos(a) * Math.cos(f) * rx,
            Math.sin(f) * h,
            Math.sin(a) * Math.cos(f) * rz,
          ),
        );
      }
      for (let k = 0; k < pts.length - 1; k++) {
        const a0 = pts[k];
        const a1 = pts[k + 1];
        if (a0 && a1) parts.add(strut(a0, a1, t, 4), frame);
      }
    }
    const rings = Math.min(8, Math.round(s.q));
    for (let j = 0; j <= rings; j++) {
      const f = (j / (rings + 1)) * (Math.PI / 2);
      const ring = new TorusGeometry(1, t / Math.max(rx, 1e-3), 3, 24);
      ring.rotateX(Math.PI / 2);
      ring.scale(rx * Math.cos(f), 1, rz * Math.cos(f));
      ring.translate(0, Math.sin(f) * h, 0);
      parts.add(ring, frame);
    }
    if (m2) {
      parts.add(boxAt(rx * 0.22, h * 0.06, rx * 0.22, 0, h * 0.97, 0), frame);
      const ball = new SphereGeometry(rx * 0.06, 8, 6);
      ball.translate(0, h * 1.08, 0);
      parts.add(ball, frame);
    }
  },

  // o tambor: um cilindro aberto (o vidro) com os montantes (p) e os anéis (q mais o de cima e o de baixo)
  drum: (s, { m, m2 }, parts) => {
    const r = Math.max(abs(s.w) / 2, 1e-3);
    const h = Math.max(abs(s.h), 1e-3);
    const shell = new CylinderGeometry(r, r, h, 24, 1, true);
    shell.translate(0, h / 2, 0);
    parts.add(shell, m);
    const frame = m2 ?? m;
    const t = Math.max(0.04, r * 0.03);
    const posts = Math.min(48, Math.round(s.p));
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      parts.add(boxAt(t * 2, h, t * 2, Math.cos(a) * r, 0, Math.sin(a) * r), frame);
    }
    const rings = Math.min(8, Math.round(s.q));
    for (let j = 0; j <= rings + 1; j++) {
      const ring = new TorusGeometry(r, t, 3, 24);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, (j / (rings + 1)) * h, 0);
      parts.add(ring, frame);
    }
  },

  // um arco de entrada: os dois pés e o arco, com a espessura d; p > 0 põe o leque
  arch: (s, { m }, parts) => {
    const w = Math.max(abs(s.w), 0.1);
    const t = Math.max(0.05, s.d ? abs(s.d) / 2 : w * 0.08);
    const r = w / 2 - t;
    const spring = Math.max(abs(s.h) - w / 2, 0);
    parts.add(boxAt(t * 2, spring, t * 2, -w / 2 + t, 0, 0), m);
    parts.add(boxAt(t * 2, spring, t * 2, w / 2 - t, 0, 0), m);
    parts.add(arcGeo(Math.max(r, 0.05), t, 0, spring), m);
    if (s.p > 0) for (const g of fanGeo(Math.max(r, 0.05), 0, spring, t * 0.5)) parts.add(g, m);
  },

  // a arcada: os vãos em arco com o leque, ao longo de x (w de comprimento, p vãos) ou de cada lado de
  // um contorno fechado (um vão por lado); a armação no material, o pano no segundo
  arcade: (s, mats, parts) => {
    const h = Math.max(abs(s.h), 0.1);
    const t = s.d ? abs(s.d) : 0.12;
    const poly = pairs(s.pts);
    if (poly.length >= 3) {
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i] ?? [0, 0];
        const [bx, bz] = poly[(i + 1) % poly.length] ?? [0, 0];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        // o vão de frente para fora do contorno: a normal do lado que aponta para longe do centro
        const [cx, cz] = centroid(poly);
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        let nx = bz - az;
        let nz = -(bx - ax);
        if (nx * (mx - cx) + nz * (mz - cz) < 0) {
          nx = -nx;
          nz = -nz;
        }
        // o giro que leva o +z local (a frente do vão) a essa normal
        const ang = Math.atan2(nx, nz);
        const at = (geo: BufferGeometry) => {
          geo.rotateY(ang);
          geo.translate(mx, 0, mz);
          return geo;
        };
        bayRow(len, h, t, 1, mats, parts, at);
      }
      return;
    }
    const len = Math.max(abs(s.w), 0.1);
    const bays = segs(s.p, Math.max(1, Math.round(len / 3)), 1, 64);
    bayRow(len, h, t, bays, mats, parts, (g) => g);
  },

  // a planta extrudada: o contorno (ou o retângulo w × d) erguido até h; q estreita o alto (o talude)
  extrude: (s, { m }, parts) => {
    const poly = polygonOf(s);
    const h = Math.max(abs(s.h), 1e-3);
    const [cx, cz] = centroid(poly);
    const k = 1 - Math.min(s.q, 90) / 100;
    const top = poly.map(([px, pz]): [number, number] => [cx + (px - cx) * k, cz + (pz - cz) * k]);
    const tris: [Vector3, Vector3, Vector3][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] ?? [0, 0];
      const b = poly[(i + 1) % poly.length] ?? [0, 0];
      const ta = top[i] ?? [0, 0];
      const tb = top[(i + 1) % top.length] ?? [0, 0];
      const A = new Vector3(a[0], 0, a[1]);
      const B = new Vector3(b[0], 0, b[1]);
      const C = new Vector3(tb[0], h, tb[1]);
      const D = new Vector3(ta[0], h, ta[1]);
      tris.push([A, B, C], [A, C, D]);
    }
    const out = (c: Vector3) => new Vector3(c.x - cx, 0, c.z - cz);
    parts.add(triangles(tris, out), m);
    parts.add(cap(top, h), m);
  },

  // a abóbada varrida: do alto da parede (o contorno) a cobertura sobe curvando para dentro, um quarto de
  // círculo de recuo w e subida h; as nervuras em cada vértice e a tampa no segundo material
  vault: (s, { m, m2 }, parts) => {
    const poly = polygonOf(s);
    const inset = Math.max(abs(s.w), 0.05);
    const rise = Math.max(abs(s.h), 0.05);
    const [cx, cz] = centroid(poly);
    const ccw = area(poly) > 0 ? 1 : -1;
    // a normal para fora de cada vértice: a média das normais dos dois lados
    const normals = poly.map((v, i) => {
      const prev = poly[(i - 1 + poly.length) % poly.length] ?? v;
      const next = poly[(i + 1) % poly.length] ?? v;
      const e1 = new Vector2(v[0] - prev[0], v[1] - prev[1]).normalize();
      const e2 = new Vector2(next[0] - v[0], next[1] - v[1]).normalize();
      const n1 = new Vector2(e1.y, -e1.x).multiplyScalar(ccw);
      const n2 = new Vector2(e2.y, -e2.x).multiplyScalar(ccw);
      const n = n1.add(n2).normalize();
      const out = new Vector2(v[0] - cx, v[1] - cz);
      return n.dot(out) < 0 ? n.multiplyScalar(-1) : n;
    });
    const K = 6;
    const ring = (k: number) =>
      poly.map((v, i) => {
        const a = (k / K) * (Math.PI / 2);
        const n = normals[i] ?? new Vector2();
        const back = inset * (1 - Math.cos(a));
        return new Vector3(v[0] - n.x * back, rise * Math.sin(a), v[1] - n.y * back);
      });
    const rows = Array.from({ length: K + 1 }, (_, k) => ring(k));
    const tris: [Vector3, Vector3, Vector3][] = [];
    for (let k = 0; k < K; k++) {
      const r0 = rows[k] ?? [];
      const r1 = rows[k + 1] ?? [];
      for (let i = 0; i < poly.length; i++) {
        const j = (i + 1) % poly.length;
        const a = r0[i];
        const b = r0[j];
        const c = r1[j];
        const d = r1[i];
        if (a && b && c && d) tris.push([a, b, c], [a, c, d]);
      }
    }
    parts.add(
      triangles(tris, (c) => new Vector3(c.x - cx, c.y + 1, c.z - cz)),
      m,
    );
    const frame = m2 ?? m;
    const t = Math.max(0.03, inset * 0.025);
    for (let i = 0; i < poly.length; i++) {
      for (let k = 0; k < K; k++) {
        const a = rows[k]?.[i];
        const b = rows[k + 1]?.[i];
        if (a && b) parts.add(strut(a, b, t, 4), frame);
      }
    }
    const last = rows[K] ?? [];
    parts.add(
      cap(
        last.map((v): [number, number] => [v.x, v.z]),
        rise,
      ),
      frame,
    );
  },

  // o torno: o perfil [r0, y0, r1, y1, …] girado em volta do eixo (p lados)
  lathe: (s, { m }, parts) => {
    const prof = pairs(s.pts).map(([r, y]) => new Vector2(Math.max(abs(r), 0), y));
    if (prof.length < 2) throw new Error('perfil curto');
    parts.add(new LatheGeometry(prof, segs(s.p, 16)), m);
  },

  gable: (s, { m }, parts) => {
    parts.add(
      gableGeometry(Math.max(abs(s.w), 1e-3), Math.max(abs(s.h), 1e-3), Math.max(abs(s.d), 1e-3)),
      m,
    );
  },

  hip: (s, { m }, parts) => {
    const w = Math.max(abs(s.w), 1e-3);
    const d = Math.max(abs(s.d), 1e-3);
    const g = new ConeGeometry(Math.hypot(w, d) / 2, Math.max(abs(s.h), 1e-3), 4);
    g.rotateY(Math.PI / 4);
    g.scale(w / Math.hypot(w, d) / 0.7071, 1, d / Math.hypot(w, d) / 0.7071);
    g.translate(0, abs(s.h) / 2, 0);
    parts.add(g, m);
  },

  // a escada: p degraus de largura w, subindo h ao longo do fundo d, da frente (+z) para trás
  stairs: (s, { m }, parts) => {
    const d = Math.max(abs(s.d), 0.1);
    const h = Math.max(abs(s.h), 0.05);
    const n = segs(s.p, Math.round(h / 0.18), 2, 40);
    for (let i = 0; i < n; i++) {
      parts.add(boxAt(s.w, (h * (i + 1)) / n, d / n, 0, 0, d / 2 - ((i + 0.5) * d) / n), m);
    }
  },

  // o muro (ou a sebe, com o material de folha): a polilinha, de espessura w e altura h; q = 1 fecha
  wall: (s, { m }, parts) => {
    const line = pairs(s.pts);
    const pts =
      line.length >= 2
        ? line
        : [[-abs(s.d) / 2, 0] as [number, number], [abs(s.d) / 2, 0] as [number, number]];
    const closed = s.q >= 1 && pts.length >= 3;
    const t = Math.max(abs(s.w), 0.05);
    const last = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < last; i++) {
      const [ax, az] = pts[i] ?? [0, 0];
      const [bx, bz] = pts[(i + 1) % pts.length] ?? [0, 0];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) continue;
      parts.add(
        boxAt(
          len + t * 0.9,
          s.h,
          t,
          (ax + bx) / 2,
          0,
          (az + bz) / 2,
          Math.atan2(-(bz - az), bx - ax),
        ),
        m,
      );
    }
  },

  // o guarda-corpo: os postes a cada ~1,2 m e os dois corrimãos, ao longo da polilinha (ou de w em x)
  railing: (s, { m }, parts) => {
    const line = pairs(s.pts);
    const pts =
      line.length >= 2
        ? line
        : [[-abs(s.w) / 2, 0] as [number, number], [abs(s.w) / 2, 0] as [number, number]];
    const h = Math.max(abs(s.h), 0.3);
    const t = 0.04;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i] ?? [0, 0];
      const [bx, bz] = pts[i + 1] ?? [0, 0];
      const a = new Vector3(ax, 0, az);
      const b = new Vector3(bx, 0, bz);
      const len = a.distanceTo(b);
      const posts = Math.max(1, Math.round(len / 1.2));
      for (let k = 0; k <= posts; k++) {
        const p = a.clone().lerp(b, k / posts);
        parts.add(strut(p, p.clone().setY(h), t, 4), m);
      }
      parts.add(strut(a.clone().setY(h), b.clone().setY(h), t, 4), m);
      parts.add(strut(a.clone().setY(h * 0.5), b.clone().setY(h * 0.5), t * 0.7, 4), m);
    }
  },

  // a fonte: a borda (o material) e a água (o segundo, ou a água), retangular (q = 0) ou redonda (q ≥ 1)
  basin: (s, { m, m2 }, parts, ctx) => {
    const water = m2 ?? ctx.p.water;
    const h = Math.max(abs(s.h), 0.05);
    if (s.q >= 1) {
      const r = Math.max(abs(s.w) / 2, 0.1);
      const rim = new TorusGeometry(r, Math.max(r * 0.08, 0.04), 4, 24);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, h, 0);
      parts.add(rim, m);
      const wall = new CylinderGeometry(r, r, h, 24, 1, true);
      wall.translate(0, h / 2, 0);
      parts.add(wall, m);
      const disc = new CircleGeometry(r, 24);
      disc.rotateX(-Math.PI / 2);
      disc.translate(0, h * 0.8, 0);
      parts.add(disc, water);
      return;
    }
    const w = Math.max(abs(s.w), 0.1);
    const d = Math.max(abs(s.d), 0.1);
    const t = Math.max(0.06, Math.min(w, d) * 0.08);
    parts.add(boxAt(w, h, t, 0, 0, d / 2 - t / 2), m);
    parts.add(boxAt(w, h, t, 0, 0, -d / 2 + t / 2), m);
    parts.add(boxAt(t, h, d, w / 2 - t / 2, 0, 0), m);
    parts.add(boxAt(t, h, d, -w / 2 + t / 2, 0, 0), m);
    parts.add(boxAt(w - 2 * t, h * 0.8, d - 2 * t, 0, 0, 0), water);
  },

  // o canteiro: o contorno (ou w × d) erguido h, na terra (o material), com a borda no segundo
  bed: (s, { m, m2 }, parts) => {
    const poly = polygonOf(s);
    const h = Math.max(abs(s.h), 0.02);
    parts.add(cap(poly, h), m);
    const [cx, cz] = centroid(poly);
    const tris: [Vector3, Vector3, Vector3][] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] ?? [0, 0];
      const b = poly[(i + 1) % poly.length] ?? [0, 0];
      tris.push(
        [new Vector3(a[0], 0, a[1]), new Vector3(b[0], 0, b[1]), new Vector3(b[0], h, b[1])],
        [new Vector3(a[0], 0, a[1]), new Vector3(b[0], h, b[1]), new Vector3(a[0], h, a[1])],
      );
    }
    parts.add(
      triangles(tris, (c) => new Vector3(c.x - cx, 0, c.z - cz)),
      m,
    );
    if (m2) {
      for (let i = 0; i < poly.length; i++) {
        const [ax, az] = poly[i] ?? [0, 0];
        const [bx, bz] = poly[(i + 1) % poly.length] ?? [0, 0];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        parts.add(
          boxAt(
            len + 0.25,
            h + 0.2,
            0.25,
            (ax + bx) / 2,
            0,
            (az + bz) / 2,
            Math.atan2(-(bz - az), bx - ax),
          ),
          m2,
        );
      }
    }
  },

  // as flores: pontos espalhados dentro do contorno (ou de w × d), p por metro quadrado, de diâmetro q
  // decímetros (0 → 2,5), na altura h acima da base da forma
  flowers: (s, { m }, parts, ctx) => {
    const poly = polygonOf(s);
    const xs = poly.map((v) => v[0]);
    const zs = poly.map((v) => v[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    const want = Math.min(
      FLOWERS_PER_SHAPE,
      ctx.flowers.left,
      Math.round(abs(area(poly)) * Math.max(s.p, 0)),
    );
    const size = (s.q > 0 ? s.q : 2.5) / 10;
    const inside = (px: number, pz: number) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i] ?? [0, 0];
        const [xj, zj] = poly[j] ?? [0, 0];
        if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) hit = !hit;
      }
      return hit;
    };
    const geos: BufferGeometry[] = [];
    for (let tries = 0; geos.length < want && tries < want * 6; tries++) {
      const px = x0 + ctx.r() * (x1 - x0);
      const pz = z0 + ctx.r() * (z1 - z0);
      if (!inside(px, pz)) continue;
      const g = new OctahedronGeometry(size / 2, 0);
      g.translate(px, abs(s.h) + size * (0.4 + ctx.r() * 0.3), pz);
      geos.push(g);
    }
    ctx.flowers.left -= geos.length;
    if (geos.length === 0) return;
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    parts.add(merged, m);
  },

  // o poste com globos: a haste de altura h, os braços de abertura w e p globos (1, 4 ou 5) que acendem
  lamp: (s, { m }, parts, ctx) => {
    const h = Math.max(abs(s.h), 0.5);
    const spread = Math.max(abs(s.w), 0.2) / 2;
    const n = Math.round(s.p) || 1;
    parts.add(boxAt(0.4, 0.4, 0.4, 0, 0, 0), m);
    parts.add(strut(new Vector3(0, 0.4, 0), new Vector3(0, h, 0), 0.06, 6), m);
    const globe = (gx: number, gy: number, gz: number, r: number) => {
      const g = new SphereGeometry(r, 8, 6);
      g.translate(gx, gy, gz);
      parts.add(g, ctx.p.lamp);
    };
    if (n >= 4) {
      parts.add(
        strut(new Vector3(-spread, h * 0.83, 0), new Vector3(spread, h * 0.83, 0), 0.03, 4),
        m,
      );
      parts.add(
        strut(new Vector3(0, h * 0.83, -spread), new Vector3(0, h * 0.83, spread), 0.03, 4),
        m,
      );
      for (const [gx, gz] of [
        [-spread, 0],
        [spread, 0],
        [0, -spread],
        [0, spread],
      ] as const) {
        globe(gx, h * 0.9, gz, 0.17);
      }
      if (n >= 5) globe(0, h + 0.2, 0, 0.21);
    } else {
      globe(0, h + 0.18, 0, 0.22);
    }
  },

  tree: (s, { m }, parts, ctx) => {
    const h = Math.max(abs(s.h), 0.5);
    const w = Math.max(abs(s.w), h * 0.5);
    parts.add(strut(new Vector3(0, 0, 0), new Vector3(0, h * 0.5, 0), w * 0.06, 6), ctx.p.trunk);
    const crown = new IcosahedronGeometry(w / 2, 1);
    crown.scale(1, 0.85 + ctx.r() * 0.2, 1);
    crown.translate(0, h - w * 0.42, 0);
    parts.add(crown, m);
  },

  pine: (s, { m }, parts, ctx) => {
    const h = Math.max(abs(s.h), 0.5);
    const w = Math.max(abs(s.w), h * 0.3);
    parts.add(strut(new Vector3(0, 0, 0), new Vector3(0, h * 0.25, 0), w * 0.08, 5), ctx.p.trunk);
    const a = new ConeGeometry(w / 2, h * 0.55, 7);
    a.translate(0, h * 0.2 + h * 0.275, 0);
    parts.add(a, m);
    const b = new ConeGeometry(w * 0.37, h * 0.45, 7);
    b.translate(0, h * 0.55 + h * 0.225, 0);
    parts.add(b, m);
  },

  // a araucária: o tronco alto e a copa em guarda-chuva, três andares (o perfil das peças da serra)
  araucaria: (s, { m }, parts, ctx) => {
    const h = Math.max(abs(s.h), 1);
    const w = Math.max(abs(s.w), h * 0.4);
    parts.add(strut(new Vector3(0, 0, 0), new Vector3(0, h, 0), w * 0.03, 6), ctx.p.trunk);
    const prof = [
      [0.05, 0],
      [0.46, 0.04],
      [0.84, 0.19],
      [1, 0.35],
      [0.91, 0.39],
      [0.53, 0.25],
      [0.07, 0.22],
    ].map(([px, py]) => new Vector2((px ?? 0) * (w / 2), (py ?? 0) * (w / 2)));
    for (const [yy, sc] of [
      [h - w * 0.3, 1],
      [h - w * 0.16, 0.74],
      [h - w * 0.04, 0.42],
    ] as const) {
      const g = new LatheGeometry(prof, 12);
      g.scale(sc, sc, sc);
      g.translate(0, yy, 0);
      parts.add(g, m);
    }
  },

  palm: (s, { m }, parts, ctx) => {
    const h = Math.max(abs(s.h), 0.5);
    const w = Math.max(abs(s.w), h * 0.4);
    parts.add(strut(new Vector3(0, 0, 0), new Vector3(w * 0.05, h, 0), w * 0.04, 6), ctx.p.trunk);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      parts.add(
        strut(
          new Vector3(w * 0.05, h, 0),
          new Vector3(w * 0.05 + Math.cos(a) * w * 0.5, h - w * 0.18, Math.sin(a) * w * 0.5),
          w * 0.05,
          3,
        ),
        m,
      );
    }
  },

  // o painel: um plano fino de pé, de frente para +z (o vidro, a água de uma cascata, um letreiro)
  panel: (s, { m }, parts) => parts.add(boxAt(s.w, s.h, s.d ? s.d : 0.08, 0, 0, 0), m),

  // a viga: de (x, y, z) até (x + w, y + h, z + d), de espessura p centímetros (0 → 8)
  beam: (s, { m }, parts) => {
    const r = (s.p > 0 ? s.p : 8) / 200;
    parts.add(strut(new Vector3(0, 0, 0), new Vector3(s.w, s.h, s.d), Math.max(r, 0.01), 5), m);
  },
};

// ------------------------------------------------------------------ a repetição, o espelho e a montagem
type Copy = { x: number; z: number; ry: number; mx: boolean; mz: boolean };

/** As cópias de uma forma: a repetição (em linha ou em anel) e o espelho. */
export function copiesFor(s: LandmarkShape): Copy[] {
  const base: Copy[] = [];
  const n = s.rep === 'one' ? 1 : Math.max(1, Math.min(64, Math.round(s.n)));
  for (let i = 0; i < n; i++) {
    if (s.rep === 'ring') {
      const step = s.sz ? s.sz * DEG : (Math.PI * 2) / n;
      const a = i * step;
      base.push({
        x: s.x + Math.sin(a) * s.sx,
        z: s.z + Math.cos(a) * s.sx,
        ry: s.ry * DEG + a,
        mx: false,
        mz: false,
      });
    } else {
      base.push({ x: s.x + i * s.sx, z: s.z + i * s.sz, ry: s.ry * DEG, mx: false, mz: false });
    }
  }
  const out = [...base];
  if (s.mir === 'x' || s.mir === 'xz')
    for (const c of base) out.push({ x: -c.x, z: c.z, ry: -c.ry, mx: true, mz: false });
  if (s.mir === 'z' || s.mir === 'xz')
    for (const c of base) out.push({ x: c.x, z: -c.z, ry: Math.PI - c.ry, mx: false, mz: true });
  if (s.mir === 'xz')
    for (const c of base) out.push({ x: -c.x, z: -c.z, ry: Math.PI + c.ry, mx: true, mz: true });
  return out;
}

/**
 * O espelho também vira a forma por dentro. Um espelho em x é a forma com os pontos em −x, girada
 * por −ry; um espelho em z é a mesma coisa girada por π − ry (M_z = R(π)·M_x); os dois juntos são só
 * um giro de π (M_x·M_z = R(π)), sem virar nada. As formas sem contorno são simétricas em x (a caixa,
 * o cilindro, a escada, o arco), menos a viga, que vira pelo sinal de `w`.
 */
function mirrored(s: LandmarkShape, c: Copy): LandmarkShape {
  if (c.mx === c.mz) return s;
  if (s.k === 'lathe') return s;
  if (s.k === 'beam') return { ...s, w: -s.w };
  if (s.pts.length === 0) return s;
  const pts = s.pts.map((v, i) => (i % 2 === 0 ? -v : v));
  return { ...s, pts };
}

/** A caixa de um tipo de parada, ou a da cidade (o cartão-postal de uma cidade de passagem). */
export function landmarkBox(kind: StopKind): Box {
  return MINIATURE_BOX[kind];
}

export function buildLandmark(recipe: LandmarkRecipe, box: Box, seed = 1): LandmarkPiece {
  const kit = new Kit();
  const p = palette(kit);
  const x = extraMaterials(kit);
  const group = new Group();
  group.name = 'landmark';
  const ctx: Ctx = { p, x, r: rng(seed), flowers: { left: FLOWERS_TOTAL } };
  const byMaterial = new Map<Material, BufferGeometry[]>();
  let skipped = 0;
  let copies = 0;
  const m4 = new Matrix4();
  for (const shape of recipe.shapes) {
    copies += copiesOf(shape);
    if (copies > 2_000) throw new Error('cópias demais');
    const mats: Mats = {
      m: materialOf(p, x, shape.m),
      m2: shape.m2 === 'none' ? null : materialOf(p, x, shape.m2),
    };
    for (const c of copiesFor(shape)) {
      const local: { geo: BufferGeometry; m: Material }[] = [];
      try {
        const s = mirrored(shape, c);
        BUILDERS[s.k](s, mats, { add: (geo, m) => local.push({ geo, m }) }, ctx);
      } catch {
        for (const l of local) l.geo.dispose();
        skipped += 1;
        continue;
      }
      // a cópia vai ao lugar: o giro da forma, depois a posição (e o espelho dos pontos já foi feito)
      m4.makeRotationY(c.ry).setPosition(c.x, shape.y, c.z);
      for (const l of local) {
        const geo = l.geo.index ? l.geo.toNonIndexed() : l.geo;
        if (geo !== l.geo) l.geo.dispose();
        geo.applyMatrix4(m4);
        const list = byMaterial.get(l.m) ?? [];
        list.push(geo);
        byMaterial.set(l.m, list);
      }
    }
  }

  // a fusão: uma malha por material
  let vertices = 0;
  for (const [material, geos] of byMaterial) {
    const clean = geos.map(stripToPositionNormalUv);
    const merged = clean.length > 1 ? mergeGeometries(clean) : (clean[0] ?? null);
    for (const g of [...geos, ...clean]) if (g !== merged) g.dispose();
    if (!merged) continue;
    vertices += merged.getAttribute('position').count;
    const mesh = new Mesh(kit.own(merged), material);
    mesh.castShadow = material !== x.glass;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (group.children.length === 0 || vertices > LANDMARK_MAX_VERTICES) {
    kit.dispose();
    p.cars.dispose();
    throw new Error(group.children.length === 0 ? 'a receita não montou nada' : 'vértices demais');
  }

  // a caixa manda: uma escala só, centrada em x e z, assentada no chão
  const bounds = new Box3().setFromObject(group);
  const size = bounds.getSize(new Vector3());
  const k = Math.min(
    (box.w * 0.98) / Math.max(size.x, 1e-3),
    (box.h * 0.98) / Math.max(size.y, 1e-3),
    (box.d * 0.98) / Math.max(size.z, 1e-3),
  );
  const center = bounds.getCenter(new Vector3());
  const fit = new Matrix4()
    .makeScale(k, k, k)
    .multiply(new Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
  for (const child of group.children) {
    if (child instanceof Mesh) (child.geometry as BufferGeometry).applyMatrix4(fit);
  }

  // a poça de luz no chão, do tamanho da caixa, que só a noite acende (como as peças por tipo)
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
    kind: 'other',
    group,
    box,
    skipped,
    vertices,
    setNight: (t) => {
      const kk = Math.max(0, Math.min(1, (t - 0.3) / 0.6));
      const s = kk * kk * (3 - 2 * kk);
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

/** A fusão pede os mesmos atributos em todas: posição, normal e uv (os outros saem). */
function stripToPositionNormalUv(geo: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
  }
  if (!('normal' in geo.attributes)) geo.computeVertexNormals();
  if (!('uv' in geo.attributes)) {
    geo.setAttribute(
      'uv',
      new Float32BufferAttribute(
        new Array<number>(geo.getAttribute('position').count * 2).fill(0),
        2,
      ),
    );
  }
  geo.clearGroups();
  return geo;
}
