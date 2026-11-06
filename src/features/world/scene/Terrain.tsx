import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  type Group,
} from 'three/webgpu';
import type { Palette } from '@/art/palette.ts';
import { fbm, hash2, smooth, vnoise } from '../noise.ts';
import { stepProgress } from '../opening.ts';
import type { WorldLayout } from '../layout.ts';
import { PATCH, sampleCell, type HeightField } from './heightfield.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O terreno: um heightfield amostrado do layout, com cores por vértice misturadas pelos pesos dos
 * cenários (os tokens --color-zone-*), rocha nas encostas, areia na praia, água escura no mar e no
 * lago. Uma geometria por layout e por paleta; na abertura do dia o grupo sobe (escala em y).
 */
type Props = { runtime: WorldRuntime; palette: Palette; field: HeightField; group: Group };

function buildGeometry(layout: WorldLayout, field: HeightField, palette: Palette): BufferGeometry {
  const { nx, nz, cell, x0, z0, heights } = field;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const idx: number[] = [];
  const PAL = {
    city: new Color(palette.zone.city),
    park: new Color(palette.zone.city).lerp(new Color(palette.zone.interior), 0.55),
    interior: new Color(palette.zone.interior),
    field: ['#86b04d', '#b9b556', palette.zone.field, '#6f9a3e'].map((c) => new Color(c)),
    serra: new Color(palette.zone.serra),
    sand: new Color(palette.zone.beach),
    sea: new Color('#1f5c78'),
    lake: new Color('#2b6f83'),
    rock: new Color('#7b7065'),
  };
  const tmp = new Color();
  const tmp2 = new Color();
  const add = (acc: Color, c: Color, w: number) => {
    if (w <= 0) return 0;
    acc.r += c.r * w;
    acc.g += c.g * w;
    acc.b += c.b * w;
    return w;
  };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * cell;
      const z = z0 + j * cell;
      const h = heights[k] ?? 0;
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      const hx =
        (heights[j * nx + Math.min(nx - 1, i + 1)] ?? h) -
        (heights[j * nx + Math.max(0, i - 1)] ?? h);
      const hz =
        (heights[Math.min(nz - 1, j + 1) * nx + i] ?? h) -
        (heights[Math.max(0, j - 1) * nx + i] ?? h);
      const slope = Math.hypot(hx, hz) / (2 * cell);
      const t = sampleCell(field, k);
      const w = t.weights;
      const pid = hash2(Math.floor((x + 500) / PATCH), Math.floor((z + 500) / PATCH));
      const campo = PAL.field[Math.floor(pid * 4) % 4] ?? PAL.interior;
      tmp.setRGB(0, 0, 0);
      let sum = 0;
      sum += add(
        tmp,
        tmp2.copy(PAL.city).lerp(PAL.park, smooth(0.55, 0.75, fbm(x * 0.07, z * 0.07, 2))),
        w.city,
      );
      sum += add(tmp, tmp2.copy(PAL.interior).lerp(campo, 0.45), w.interior);
      sum += add(tmp, campo, w.field);
      sum += add(tmp, PAL.serra, w.serra);
      sum += add(tmp, tmp2.copy(PAL.interior).lerp(PAL.serra, 0.5), w.beach);
      if (sum <= 0) sum = add(tmp, PAL.interior, 1);
      tmp.multiplyScalar(1 / sum);
      tmp.lerp(PAL.rock, smooth(0.85, 1.6, slope));
      if (t.water === 'sea') {
        tmp.copy(PAL.sea).multiplyScalar(0.75 + 0.25 * smooth(-3, 0, (layout.seaLevel ?? 0) - h));
      } else if (t.water === 'lake') {
        tmp.copy(PAL.lake).multiplyScalar(0.7);
      } else if (layout.seaLevel !== null && w.beach > 0.3) {
        // perto do mar o chão vira areia
        tmp.lerp(PAL.sand, 1 - smooth(0.15, 0.9, h - layout.seaLevel));
      }
      tmp.multiplyScalar(0.93 + 0.14 * vnoise(x * 0.7, z * 0.7));
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
    }
  }
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A abertura: o relevo sobe de quase zero à altura cheia, com desaceleração. */
function rise(group: Group, progress: number): void {
  const e = 1 - (1 - progress) * (1 - progress);
  group.scale.y = 0.02 + 0.98 * e;
}

export function Terrain({ runtime, palette, field, group }: Props) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;

  const mesh = useMemo(() => {
    const geo = buildGeometry(layout, field, palette);
    const m = new Mesh(
      geo,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }),
    );
    m.receiveShadow = true;
    return m;
  }, [layout, field, palette]);

  useEffect(() => {
    group.add(mesh);
    scene.add(group);
    invalidate();
    return () => {
      group.remove(mesh);
      scene.remove(group);
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [scene, group, mesh, invalidate]);

  useEffect(
    () =>
      runtime.register(({ now }) => {
        const op = runtime.opening;
        rise(group, op ? stepProgress(op.plan, 'terrain', runtime.openingElapsed(now)) : 1);
      }),
    [runtime, group],
  );

  return null;
}
