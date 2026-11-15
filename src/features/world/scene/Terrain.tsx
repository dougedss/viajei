import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShadowMaterial,
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
 * lago. A maquete é de mesa (fase 22): na borda do heightfield o chão termina num corte de terra (a
 * saia, com a grama em cima e a terra escurecendo para baixo), sobre uma base escura, e a base faz
 * sombra na mesa (um plano que só recebe sombra). Uma geometria por layout e por paleta; na abertura
 * do dia o grupo sobe (escala em y), a mesa fica onde está.
 */
type Props = { runtime: WorldRuntime; palette: Palette; field: HeightField; group: Group };

/** quanto a saia desce abaixo do chão mais baixo */
export const SKIRT_DEPTH = 3.4;
/** a base escura: a altura e quanto passa da saia de cada lado */
export const BASE_HEIGHT = 1.3;
export const BASE_LIP = 1.1;
/** a faixa de grama no alto da saia, antes da terra */
const SOD = 0.45;
const EARTH = new Color('#7a5d43');
const EARTH_DARK = new Color('#5a4332');
const BASE_COLOR = 0x2c2622;

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

/** O chão mais baixo do heightfield: a saia e a base ficam abaixo dele. */
function floorOf(field: HeightField): number {
  let min = Number.POSITIVE_INFINITY;
  for (const h of field.heights) if (h < min) min = h;
  return Number.isFinite(min) ? min : 0;
}

/**
 * A saia: o corte de terra em volta do heightfield, do chão até `baseY`, com a cor da grama do
 * próprio terreno na faixa de cima e a terra escurecendo para baixo. Percorre a borda no sentido
 * horário visto de cima, para as faces olharem para fora.
 */
function buildSkirt(terrain: BufferGeometry, field: HeightField, baseY: number): BufferGeometry {
  const { nx, nz } = field;
  const tpos = terrain.getAttribute('position');
  const tcol = terrain.getAttribute('color');
  const ring: number[] = [];
  for (let i = 0; i < nx; i++) ring.push(i); // z0, x crescendo
  for (let j = 1; j < nz; j++) ring.push(j * nx + nx - 1); // x1, z crescendo
  for (let i = nx - 2; i >= 0; i--) ring.push((nz - 1) * nx + i); // z1, x decrescendo
  for (let j = nz - 2; j >= 1; j--) ring.push(j * nx); // x0, z decrescendo
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const n = ring.length;
  ring.forEach((k, r) => {
    const x = tpos.getX(k);
    const h = tpos.getY(k);
    const z = tpos.getZ(k);
    const gr = [tcol.getX(k), tcol.getY(k), tcol.getZ(k)];
    pos.push(x, h, z, x, h - SOD, z, x, baseY, z);
    col.push(...gr, EARTH.r, EARTH.g, EARTH.b, EARTH_DARK.r, EARTH_DARK.g, EARTH_DARK.b);
    const a = r * 3;
    const b = ((r + 1) % n) * 3;
    idx.push(a, a + 1, b, b, a + 1, b + 1, a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
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

  const built = useMemo(() => {
    const geo = buildGeometry(layout, field, palette);
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
    });
    const terrain = new Mesh(geo, material);
    terrain.receiveShadow = true;
    const baseY = floorOf(field) - SKIRT_DEPTH;
    const skirt = new Mesh(buildSkirt(geo, field, baseY), material);
    skirt.receiveShadow = true;
    skirt.castShadow = true;
    const { bounds } = layout;
    const w = bounds.x1 - bounds.x0 + 2 * BASE_LIP;
    const l = bounds.z1 - bounds.z0 + 2 * BASE_LIP;
    const base = new Mesh(
      new BoxGeometry(w, BASE_HEIGHT, l),
      new MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.55, metalness: 0 }),
    );
    base.position.set(
      (bounds.x0 + bounds.x1) / 2,
      baseY - BASE_HEIGHT / 2,
      (bounds.z0 + bounds.z1) / 2,
    );
    base.castShadow = true;
    base.receiveShadow = true;
    // a mesa: só a sombra da maquete sobre o fundo do palco
    const table = new Mesh(
      new PlaneGeometry(w * 4, l * 3),
      new ShadowMaterial({ opacity: 0.42, depthWrite: false }),
    );
    table.rotation.x = -Math.PI / 2;
    table.position.set(base.position.x, baseY - BASE_HEIGHT - 0.02, base.position.z);
    table.receiveShadow = true;
    return { terrain, skirt, base, table, material, baseY };
  }, [layout, field, palette]);

  useEffect(() => {
    const { terrain, skirt, base, table, material } = built;
    group.add(terrain, skirt, base);
    scene.add(group, table);
    invalidate();
    return () => {
      group.remove(terrain, skirt, base);
      scene.remove(group, table);
      terrain.geometry.dispose();
      skirt.geometry.dispose();
      base.geometry.dispose();
      base.material.dispose();
      table.geometry.dispose();
      table.material.dispose();
      material.dispose();
    };
  }, [scene, group, built, invalidate]);

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
