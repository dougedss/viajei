import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type Matrix4,
  type Texture,
} from 'three/webgpu';
import { fbm, smooth } from '../noise.ts';
import { mulberry32 } from '../seed.ts';
import type { WorldLayout } from '../layout.ts';
import { heightAt, PATCH, sampleField, type HeightField } from './heightfield.ts';

/**
 * A decoração instanciada por cenário, portada do protótipo: torres e quadras na cidade (densidade
 * pela população), casas e árvores no interior, talhões, silos e lavouras na plantação, pinheiros e
 * rochas na serra, coqueiros, guarda-sóis e casas claras na praia; mais os toques do roteiro:
 * parreirais em fileiras ao redor da vinícola e a miniatura do hotel. Cada instância é gravada em
 * ordem embaralhada: o nível Leve reduz o `count` e afina o cenário por igual.
 */
type Placed = { m: Matrix4; c: Color | null };
type Bucket = { mesh: InstancedMesh; items: Placed[]; total: number; shadows: boolean };

export type PropTextures = { facade: Texture; windows: Texture };

export type BuiltProps = {
  meshes: InstancedMesh[];
  towerMat: MeshStandardMaterial;
  total: number;
  applyTier: (ratio: number, treeShadows: boolean) => void;
  dispose: () => void;
};

const GRID = 1.5;

const TREES = new Set(['cone', 'round', 'trunk', 'palmTrunk', 'fronds']);
/** o que cresce quando a câmera está longe; lavoura, quadras e miniaturas ficam no lugar */
const SCALED = new Set([...TREES, 'wall', 'roof', 'silo', 'rock', 'umbrella']);

function up(g: BufferGeometry, y: number): BufferGeometry {
  g.translate(0, y, 0);
  return g;
}
/** tampo e base da caixa das torres apontam para o canto liso da textura (sem janelas no telhado) */
function boxUV(g: BufferGeometry): BufferGeometry {
  const a = g.getAttribute('uv');
  for (let i = 8; i <= 15; i++) a.setXY(i, 0.95, 0.97);
  return g;
}
const colors = (hexes: string[]) => hexes.map((h) => new Color(h));
function pick<T>(arr: T[], r: number): T | undefined {
  return arr[Math.floor(r * arr.length) % arr.length];
}

export function buildProps(
  layout: WorldLayout,
  field: HeightField,
  textures: PropTextures,
  propScale = 1,
): BuiltProps {
  const rng = mulberry32(layout.seed ^ 0x9e3779b9);
  const helper = new Object3D();
  const buckets = new Map<string, Bucket>();
  const roadClear = layout.roadHalfWidth + 1.9;
  const make = (
    key: string,
    geom: BufferGeometry,
    mat: MeshStandardMaterial,
    max: number,
    shadows = true,
  ) => {
    const mesh = new InstancedMesh(geom, mat, max);
    mesh.count = 0;
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    buckets.set(key, { mesh, items: [], total: 0, shadows });
  };
  const place = (
    key: string,
    x: number,
    y: number,
    z: number,
    ry: number,
    sx: number,
    sy: number,
    sz: number,
    color?: Color,
  ) => {
    const b = buckets.get(key);
    if (!b || b.items.length >= b.mesh.instanceMatrix.count) return;
    const k = SCALED.has(key) ? propScale : 1;
    helper.position.set(x, y, z);
    helper.rotation.set(0, ry, 0);
    helper.scale.set(sx * k, sy * k, sz * k);
    helper.updateMatrix();
    b.items.push({ m: helper.matrix.clone(), c: color ?? null });
  };

  const towerMat = new MeshStandardMaterial({
    map: textures.facade,
    emissiveMap: textures.windows,
    emissive: 0xffd08a,
    emissiveIntensity: 0,
    roughness: 0.7,
  });
  make('tower', boxUV(up(new BoxGeometry(1, 1, 1), 0.5)), towerMat, 2600);
  make(
    'wall',
    up(new BoxGeometry(1.6, 1, 1.3), 0.5),
    new MeshStandardMaterial({ roughness: 0.85 }),
    1800,
  );
  const roofGeo = new ConeGeometry(1.2, 0.55, 4);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.translate(0, 1.27, 0);
  make('roof', roofGeo, new MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 1800);
  make(
    'trunk',
    up(new CylinderGeometry(0.11, 0.16, 0.9, 6), 0.45),
    new MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }),
    9000,
  );
  make(
    'cone',
    up(new ConeGeometry(0.75, 2.2, 7), 1.9),
    new MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    6000,
  );
  make(
    'round',
    up(new IcosahedronGeometry(0.9, 1), 1.55),
    new MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    3200,
  );
  make(
    'palmTrunk',
    up(new CylinderGeometry(0.09, 0.16, 3, 6), 1.5),
    new MeshStandardMaterial({ color: 0x8a6a46, roughness: 0.9 }),
    700,
  );
  const frondGeo = mergeGeometries(
    Array.from({ length: 6 }, (_, k) => {
      const g = new BoxGeometry(1.7, 0.06, 0.34);
      g.translate(0.85, 0, 0);
      g.rotateZ(-0.38);
      g.rotateY((k * Math.PI) / 3);
      g.translate(0, 3, 0);
      return g;
    }),
  );
  make('fronds', frondGeo, new MeshStandardMaterial({ roughness: 0.85, flatShading: true }), 700);
  make(
    'crop',
    up(new BoxGeometry(0.5, 0.35, 0.5), 0.17),
    new MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
    9000,
    false,
  );
  make(
    'vine',
    up(new BoxGeometry(0.42, 0.7, 0.42), 0.35),
    new MeshStandardMaterial({ color: 0x3d7a3a, roughness: 0.95, flatShading: true }),
    1200,
    false,
  );
  make(
    'post',
    up(new CylinderGeometry(0.04, 0.04, 1.0, 5), 0.5),
    new MeshStandardMaterial({ color: 0x8a7558, roughness: 0.9 }),
    400,
    false,
  );
  const siloGeo = mergeGeometries([
    up(new CylinderGeometry(0.6, 0.6, 3.2, 10), 1.6),
    up(new ConeGeometry(0.64, 0.6, 10), 3.5),
  ]);
  make(
    'silo',
    siloGeo,
    new MeshStandardMaterial({ color: 0xd8dadb, roughness: 0.45, metalness: 0.35 }),
    140,
  );
  make(
    'rock',
    up(new DodecahedronGeometry(0.6, 0), 0.25),
    new MeshStandardMaterial({ color: 0x7b7065, roughness: 0.95, flatShading: true }),
    700,
  );
  const umbGeo = mergeGeometries([
    up(new ConeGeometry(0.55, 0.3, 8), 1.3),
    up(new CylinderGeometry(0.03, 0.03, 1.3, 4), 0.65),
  ]);
  make('umbrella', umbGeo, new MeshStandardMaterial({ roughness: 0.8 }), 350, false);
  make(
    'hotel',
    up(new BoxGeometry(3.2, 1, 2.2), 0.5),
    new MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.8 }),
    8,
  );
  const hotelRoof = new ConeGeometry(2.1, 0.8, 4);
  hotelRoof.rotateY(Math.PI / 4);
  hotelRoof.translate(0, 2.6, 0);
  make(
    'hotelRoof',
    hotelRoof,
    new MeshStandardMaterial({ color: 0x8f4a37, roughness: 0.9, flatShading: true }),
    8,
  );

  const towerCols = colors(['#d9dad4', '#c9c6bd', '#b7bcc4', '#e1d6c3', '#aab3bf', '#cfd6dd']);
  const wallCols = colors(['#f1ebe0', '#e8dcc7', '#d8d3c8', '#f4f0e8', '#dbc9b0']);
  const roofCols = colors(['#a9533a', '#8f4a37', '#6e6a66', '#b4654a', '#5f5b57']);
  const coneCols = colors(['#3f7a3a', '#2f6a35', '#4a8a3c', '#35703b']);
  const roundCols = colors(['#5f9e45', '#6fae4c', '#4f8f3f', '#7cb050']);
  const frondCols = colors(['#3f8f45', '#4a9c4a', '#357f3f']);
  const cropCols = colors(['#3f7a2d', '#4c8a33']);
  const caneCols = colors(['#8fb43f', '#a3bf4a']);
  const umbCols = colors(['#e84c3d', '#f2b134', '#2f8fcf', '#f5f0e6', '#3cb371']);
  const beachCols = colors(['#f6f1e4', '#f0d9a8', '#cfe7e8', '#f2c7b3']);

  const ground = (x: number, z: number) => heightAt(field, x, z);
  const placeTree = (kind: 'cone' | 'round', x: number, y: number, z: number, sc: number) => {
    const r = rng();
    place('trunk', x, y - 0.15, z, r * 6.28, sc, sc, sc);
    place(
      kind,
      x,
      y - 0.15,
      z,
      r * 6.28,
      sc * (0.9 + rng() * 0.2),
      sc,
      sc * (0.9 + rng() * 0.2),
      pick(kind === 'cone' ? coneCols : roundCols, rng()),
    );
  };
  const placeHouse = (x: number, y: number, z: number, ry: number, cols = wallCols) => {
    const s = 0.8 + rng() * 0.5;
    place('wall', x, y - 0.2, z, ry, s, s, s, pick(cols, rng()));
    place('roof', x, y - 0.2, z, ry, s, s, s, pick(roofCols, rng()));
  };
  const placePalm = (x: number, y: number, z: number) => {
    const r = rng();
    const s = 0.8 + rng() * 0.5;
    place('palmTrunk', x, y - 0.2, z, r * 6.28, s, s, s);
    place('fronds', x, y - 0.2, z, r * 6.28, s, s, s, pick(frondCols, rng()));
  };
  const blocksDensity = (s: number): number => {
    let d = 0;
    for (const f of layout.features) {
      if (f.kind === 'blocks' && s >= f.from_s && s <= f.to_s) d = Math.max(d, f.density);
    }
    return d || 0.5;
  };

  const { bounds } = layout;
  for (let gz = bounds.z0 + 2; gz < bounds.z1 - 2; gz += GRID) {
    for (let gx = bounds.x0 + 2; gx < bounds.x1 - 2; gx += GRID) {
      const x = gx + (rng() - 0.5) * 1.1;
      const z = gz + (rng() - 0.5) * 1.1;
      const t = sampleField(field, x, z);
      if (t.water !== 'none' || t.dist < roadClear) continue;
      const w = t.weights;
      const y = ground(x, z);
      const r = rng();
      const ix = Math.round(gx / GRID);
      const iz = Math.round(gz / GRID);
      if (w.city > 0.35) {
        const dens = blocksDensity(t.s);
        const block = ix % 3 === 0 && iz % 3 === 0;
        const near = 1 - smooth(10, 70, t.dist);
        if (block && r < 0.62 * w.city * dens * (0.35 + 0.65 * near)) {
          const h = 1.4 + (1.5 + 8 * w.city * dens * near) * (0.3 + 0.7 * rng());
          place(
            'tower',
            gx,
            y - 0.4,
            gz,
            0,
            2 + rng() * 0.8,
            h + 0.4,
            2 + rng() * 0.8,
            pick(towerCols, rng()),
          );
          continue;
        }
        if (!block && r < 0.12 * w.city) {
          place(
            'tower',
            x,
            y - 0.3,
            z,
            0,
            1.3 + rng() * 0.8,
            1 + rng() * 1.2,
            1.3 + rng() * 0.8,
            pick(towerCols, rng()),
          );
          continue;
        }
        if (rng() < 0.06 * w.city) {
          placeTree('round', x, y, z, 0.8 + rng() * 0.4);
          continue;
        }
        if (w.city > 0.6) continue;
      }
      if (w.interior > 0.2) {
        const vila = fbm(x * 0.06 + 11, z * 0.06 + 5, 2);
        if (vila > 0.56 && rng() < 0.55 * w.interior) {
          placeHouse(x, y, z, rng() * Math.PI);
          continue;
        }
        if (rng() < 0.11 * w.interior) {
          placeTree(rng() < 0.6 ? 'round' : 'cone', x, y, z, 0.8 + rng() * 0.5);
          continue;
        }
      }
      if (w.field > 0.2) {
        if (rng() < 0.012 * w.field) {
          if (rng() < 0.4) place('silo', x, y - 0.2, z, 0, 1, 1, 1);
          else placeHouse(x, y, z, rng() * 6.28);
          continue;
        }
        if (rng() < 0.03 * w.field) {
          placeTree('round', x, y, z, 0.9 + rng() * 0.5);
          continue;
        }
      }
      const forest = Math.min(1, w.serra + 0.25 * (w.interior + w.field));
      if (forest > 0.15) {
        if (rng() < 0.75 * forest * (1 - 0.85 * w.field)) {
          placeTree('cone', x, y - 0.2, z, 0.75 + rng() * 0.7);
          continue;
        }
        if (rng() < 0.06 * w.serra) {
          place('rock', x, y, z, rng() * 6.28, 0.6 + rng(), 0.5 + rng() * 0.8, 0.6 + rng());
          continue;
        }
      }
      if (w.beach > 0.2) {
        const shore = layout.seaLevel === null ? 99 : y - layout.seaLevel;
        if (shore < 1.2 && shore > 0.25 && rng() < 0.18 * w.beach) {
          place('umbrella', x, y, z, 0, 1, 1, 1, pick(umbCols, rng()));
          continue;
        }
        if (rng() < (shore < 1.6 ? 0.16 : 0.06) * w.beach) {
          placePalm(x, y, z);
          continue;
        }
        if (rng() < 0.05 * w.beach) {
          placeHouse(x, y, z, rng() * 6.28, beachCols);
          continue;
        }
        if (rng() < 0.07 * w.beach) placeTree('round', x, y, z, 0.8 + rng() * 0.4);
      }
    }
  }
  // talhões: fileiras de lavoura, cana ou pomar, alinhados com as manchas de cor do terreno
  for (
    let kz = Math.floor((bounds.z0 + 500) / PATCH);
    kz <= Math.floor((bounds.z1 + 500) / PATCH);
    kz++
  ) {
    for (
      let kx = Math.floor((bounds.x0 + 500) / PATCH);
      kx <= Math.floor((bounds.x1 + 500) / PATCH);
      kx++
    ) {
      const pid = Math.abs(Math.sin(kx * 127.1 + kz * 311.7) * 43758.5453) % 1;
      const kind = Math.floor(pid * 4);
      if (kind === 0) continue;
      const cx = kx * PATCH - 500 + PATCH / 2;
      const cz = kz * PATCH - 500 + PATCH / 2;
      if (cx < bounds.x0 || cx > bounds.x1 || cz < bounds.z0 || cz > bounds.z1) continue;
      if (sampleField(field, cx, cz).weights.field < 0.3) continue;
      const ang = pid * 6.28;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const rowStep = kind === 2 ? 2.2 : 1.3;
      const step = kind === 2 ? 2.2 : 0.8;
      const half = PATCH / 2 - 0.6;
      for (let v = -half; v <= half; v += rowStep) {
        for (let u = -half; u <= half; u += step) {
          const x = cx + u * ca - v * sa;
          const z = cz + u * sa + v * ca;
          const t = sampleField(field, x, z);
          if (t.water !== 'none' || t.dist < roadClear || t.weights.field < 0.2) continue;
          const y = ground(x, z);
          if (kind === 2) placeTree('round', x, y, z, 0.5 + rng() * 0.12);
          else if (kind === 3)
            place('crop', x, y - 0.05, z, ang, 0.8, 1.4 + rng() * 0.4, 0.8, pick(caneCols, rng()));
          else place('crop', x, y - 0.05, z, ang, 1, 0.9 + rng() * 0.3, 1, pick(cropCols, rng()));
        }
      }
    }
  }
  // toques do roteiro
  for (const f of layout.features) {
    if (f.kind === 'vineyard') {
      const ca = Math.cos(f.angle);
      const sa = Math.sin(f.angle);
      for (let v = -f.half; v <= f.half; v += f.rowStep) {
        for (let u = -f.half; u <= f.half; u += 0.6) {
          const x = f.x + u * ca - v * sa;
          const z = f.z + u * sa + v * ca;
          const t = sampleField(field, x, z);
          if (t.water !== 'none' || t.dist < roadClear) continue;
          place('vine', x, ground(x, z) - 0.05, z, f.angle, 1, 0.8 + rng() * 0.4, 1);
        }
        for (const u of [-f.half, f.half]) {
          const x = f.x + u * ca - v * sa;
          const z = f.z + u * sa + v * ca;
          if (sampleField(field, x, z).dist >= roadClear)
            place('post', x, ground(x, z) - 0.05, z, f.angle, 1, 1, 1);
        }
      }
    } else if (f.kind === 'hotel') {
      const y = ground(f.x, f.z);
      place('hotel', f.x, y - 0.2, f.z, f.angle, 1, 2.1, 1);
      place('hotelRoof', f.x, y - 0.2, f.z, f.angle, 1, 1, 1);
    }
  }

  // grava em ordem embaralhada: a qualidade Leve reduz o count e afina o cenário por igual
  let total = 0;
  for (const b of buckets.values()) {
    const it = b.items;
    for (let i = it.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const a = it[i];
      const other = it[j];
      if (a && other) {
        it[i] = other;
        it[j] = a;
      }
    }
    it.forEach((e, i) => {
      b.mesh.setMatrixAt(i, e.m);
      if (e.c) b.mesh.setColorAt(i, e.c);
    });
    b.mesh.count = it.length;
    b.total = it.length;
    b.mesh.instanceMatrix.needsUpdate = true;
    if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
    b.items = [];
    total += it.length;
  }
  return {
    meshes: [...buckets.values()].map((b) => b.mesh),
    towerMat,
    total,
    applyTier(ratio, treeShadows) {
      for (const [key, b] of buckets) {
        b.mesh.count = Math.round(b.total * ratio);
        if (TREES.has(key)) b.mesh.castShadow = treeShadows && b.shadows;
      }
    },
    dispose() {
      for (const b of buckets.values()) {
        b.mesh.geometry.dispose();
        (b.mesh.material as MeshStandardMaterial).dispose();
        b.mesh.dispose();
      }
    },
  };
}

/** As janelas das torres acendem com a noite. */
export function setWindowGlow(built: BuiltProps, glow: number): void {
  built.towerMat.emissiveIntensity = glow;
}
