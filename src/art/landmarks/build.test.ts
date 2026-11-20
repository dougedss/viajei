import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Material, type MeshStandardMaterial } from 'three/webgpu';
import {
  LANDMARK_LIMITS,
  LANDMARK_MATERIALS,
  LANDMARK_SHAPE_KINDS,
  landmarkRecipeSchema,
  parseRecipe,
  type LandmarkRecipe,
  type LandmarkShape,
} from '@shared/landmark-recipe.ts';
import { MINIATURE_BOX } from '../stops/types.ts';
import { buildLandmark, copiesFor, LANDMARK_MAX_VERTICES } from './build.ts';
import { ESTUFA_CURITIBA } from './samples/estufa-curitiba.ts';

/**
 * O que quebraria o 3D nos cartões-postais (fase 23), no molde do `build.test.ts` das peças por tipo:
 * a receita passa no schema, cabe na caixa, assenta no chão, fica centrada, é poucas malhas, acende à
 * noite, descarta uma vez; a inválida não constrói; os tetos; e a régua (a estufa à mão) passa em tudo.
 */
const S = (partial: Partial<LandmarkShape> & Pick<LandmarkShape, 'k' | 'm'>): LandmarkShape => ({
  m2: 'none',
  x: 0,
  y: 0,
  z: 0,
  w: 1,
  h: 1,
  d: 1,
  ry: 0,
  p: 0,
  q: 0,
  rep: 'one',
  n: 1,
  sx: 0,
  sz: 0,
  mir: 'none',
  pts: [],
  ...partial,
});
const recipe = (...shapes: LandmarkShape[]): LandmarkRecipe => ({ v: 1, shapes });
const NATURE = MINIATURE_BOX.nature;

function bounds(piece: { group: { children: { visible: boolean }[] } }): Box3 {
  const box = new Box3();
  for (const child of piece.group.children) if (child.visible) box.expandByObject(child as never);
  return box;
}

describe('a receita', () => {
  it('a estufa escrita à mão passa no schema inteiro', () => {
    expect(parseRecipe(ESTUFA_CURITIBA)).not.toBeNull();
    expect(ESTUFA_CURITIBA.shapes.length).toBeLessThanOrEqual(LANDMARK_LIMITS.shapes);
  });

  it('a inválida não passa: uma forma fora do vocabulário, um material fora da paleta, um número solto', () => {
    expect(
      parseRecipe({ v: 1, shapes: [{ ...S({ k: 'box', m: 'wall' }), k: 'teapot' }] }),
    ).toBeNull();
    expect(
      parseRecipe({ v: 1, shapes: [{ ...S({ k: 'box', m: 'wall' }), m: 'neon' }] }),
    ).toBeNull();
    expect(parseRecipe({ v: 1, shapes: [{ ...S({ k: 'box', m: 'wall' }), w: 9_999 }] })).toBeNull();
    expect(
      parseRecipe({ v: 1, shapes: [{ ...S({ k: 'box', m: 'wall' }), pts: [1, 2, 3] }] }),
    ).toBeNull();
    expect(parseRecipe({ v: 2, shapes: [S({ k: 'box', m: 'wall' })] })).toBeNull();
    expect(parseRecipe({ v: 1, shapes: [] })).toBeNull();
    expect(parseRecipe('nada')).toBeNull();
  });

  it('os tetos: 300 formas, 2.000 cópias e 32 KB', () => {
    const many = Array.from({ length: LANDMARK_LIMITS.shapes + 1 }, () =>
      S({ k: 'box', m: 'wall' }),
    );
    expect(parseRecipe(recipe(...many))).toBeNull();
    const copies = Array.from({ length: 40 }, () => S({ k: 'box', m: 'wall', rep: 'line', n: 64 }));
    expect(parseRecipe(recipe(...copies))).toBeNull();
    const fat = Array.from({ length: 200 }, () =>
      S({ k: 'wall', m: 'wall', pts: Array.from({ length: 128 }, (_, i) => i * 1.2345) }),
    );
    expect(parseRecipe(recipe(...fat))).toBeNull();
  });

  it('a repetição e o espelho contam as cópias', () => {
    expect(copiesFor(S({ k: 'box', m: 'wall' }))).toHaveLength(1);
    expect(copiesFor(S({ k: 'box', m: 'wall', rep: 'line', n: 4, sx: 2 }))).toHaveLength(4);
    expect(copiesFor(S({ k: 'box', m: 'wall', rep: 'ring', n: 6, sx: 3, mir: 'xz' }))).toHaveLength(
      24,
    );
    const ring = copiesFor(S({ k: 'box', m: 'wall', rep: 'ring', n: 4, sx: 3 }));
    expect(ring.map((c) => [Math.round(c.x) + 0, Math.round(c.z) + 0])).toEqual([
      [0, 3],
      [3, 0],
      [0, -3],
      [-3, 0],
    ]);
  });
});

describe('o construtor', () => {
  it('monta toda forma do vocabulário em todo material, dentro da caixa, assentada e centrada', () => {
    for (const k of LANDMARK_SHAPE_KINDS) {
      const m = LANDMARK_MATERIALS[LANDMARK_SHAPE_KINDS.indexOf(k) % LANDMARK_MATERIALS.length]!;
      const piece = buildLandmark(
        recipe(
          S({
            k,
            m,
            m2: 'glass',
            w: 4,
            h: 3,
            d: 3,
            p: 6,
            q: 2,
            pts: k === 'lathe' ? [0.2, 0, 1, 0.5, 0.4, 1] : [],
          }),
        ),
        NATURE,
        7,
      );
      expect(piece.skipped, k).toBe(0);
      const box = bounds(piece);
      const size = box.getSize(new Vector3());
      expect(size.x, `${k} largura`).toBeLessThanOrEqual(NATURE.w + 0.01);
      expect(size.y, `${k} altura`).toBeLessThanOrEqual(NATURE.h + 0.01);
      expect(size.z, `${k} fundo`).toBeLessThanOrEqual(NATURE.d + 0.01);
      expect(box.min.y, `${k} no chão`).toBeGreaterThan(-0.01);
      expect(box.min.y, `${k} no chão`).toBeLessThan(0.2);
      expect(Math.abs(box.min.x + box.max.x) / 2, `${k} centrada`).toBeLessThan(0.05);
      piece.dispose();
    }
  });

  it('as cópias ficam no lugar: uma linha de três caixas, um anel, um espelho', () => {
    const line = buildLandmark(
      recipe(S({ k: 'box', m: 'wall', w: 1, h: 1, d: 1, rep: 'line', n: 3, sx: 4 })),
      NATURE,
    );
    const size = bounds(line).getSize(new Vector3());
    // três caixas de 1 em passos de 4: 9 de largura por 1 de fundo, na escala da caixa
    expect(size.x / size.z).toBeCloseTo(9, 0);
    line.dispose();
    const mirrored = buildLandmark(
      recipe(S({ k: 'stairs', m: 'stone', x: 3, w: 1, h: 1, d: 2, p: 4, mir: 'x' })),
      NATURE,
    );
    expect(Math.abs(bounds(mirrored).getCenter(new Vector3()).x)).toBeLessThan(0.05);
    mirrored.dispose();
  });

  it('uma forma que não monta fica de fora e a peça continua; nada montado não constrói', () => {
    const piece = buildLandmark(
      recipe(S({ k: 'box', m: 'wall', w: 2, h: 2, d: 2 }), S({ k: 'lathe', m: 'wall', pts: [] })),
      NATURE,
    );
    expect(piece.skipped).toBe(1);
    expect(piece.group.children.length).toBeGreaterThan(0);
    piece.dispose();
    expect(() => buildLandmark(recipe(S({ k: 'lathe', m: 'wall', pts: [] })), NATURE)).toThrow();
  });

  it('é poucas malhas (uma por material), acende à noite e descarta uma vez', () => {
    const piece = buildLandmark(
      recipe(
        S({ k: 'box', m: 'wall', w: 4, h: 3, d: 3 }),
        S({ k: 'box', m: 'wall', x: 5, w: 2, h: 2, d: 2 }),
        S({ k: 'panel', m: 'win', z: 1.6, w: 1, h: 1, d: 0.1 }),
        S({ k: 'lamp', m: 'steel', x: -4, w: 1, h: 3, p: 5 }),
      ),
      NATURE,
    );
    const meshes = piece.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const materials = new Set<Material>(meshes.map((m) => m.material as Material));
    expect(meshes.length).toBe(materials.size);
    expect(meshes.length).toBeLessThanOrEqual(8);
    const pool = meshes.find((m) => m.renderOrder === 2)!;
    const poolMat = pool.material as MeshStandardMaterial;
    const emissive = meshes
      .map((m) => m.material as MeshStandardMaterial)
      .filter((m) => m !== poolMat && 'emissive' in m && m.emissive);
    const glow = () => emissive.reduce((acc, m) => acc + m.emissiveIntensity, 0);
    piece.setNight(0);
    const day = glow();
    expect(pool.visible).toBe(false);
    piece.setNight(1);
    expect(pool.visible).toBe(true);
    expect(glow()).toBeGreaterThan(day);
    piece.dispose();
    piece.dispose();
    expect(piece.group.parent).toBeNull();
  });
});

describe('a régua: a estufa do Jardim Botânico', () => {
  it('monta inteira (nenhuma forma de fora), cabe na caixa da natureza, assenta e fica centrada', () => {
    const piece = buildLandmark(ESTUFA_CURITIBA, NATURE, 1);
    expect(piece.skipped).toBe(0);
    const box = bounds(piece);
    const size = box.getSize(new Vector3());
    expect(size.x).toBeLessThanOrEqual(NATURE.w + 0.01);
    expect(size.y).toBeLessThanOrEqual(NATURE.h + 0.01);
    expect(size.z).toBeLessThanOrEqual(NATURE.d + 0.01);
    // grande como as peças do tipo: enche a caixa num dos lados
    expect(Math.max(size.x / NATURE.w, size.z / NATURE.d)).toBeGreaterThan(0.9);
    expect(box.min.y).toBeGreaterThan(-0.01);
    expect(box.min.y).toBeLessThan(0.2);
    expect(Math.abs(box.min.x + box.max.x) / 2).toBeLessThan(0.05);
    expect(Math.abs(box.min.z + box.max.z) / 2).toBeLessThan(0.05);
    // dentro do orçamento do aparelho e em poucas malhas
    expect(piece.vertices).toBeLessThanOrEqual(LANDMARK_MAX_VERTICES);
    const meshes = piece.group.children.filter((c): c is Mesh => c instanceof Mesh);
    expect(meshes.length).toBeLessThanOrEqual(24);
    piece.dispose();
  });

  it('também cabe na caixa da cidade (o cartão-postal de uma cidade de passagem) e acende à noite', () => {
    const piece = buildLandmark(ESTUFA_CURITIBA, MINIATURE_BOX.city, 1);
    const size = bounds(piece).getSize(new Vector3());
    expect(size.x).toBeLessThanOrEqual(MINIATURE_BOX.city.w + 0.01);
    expect(size.z).toBeLessThanOrEqual(MINIATURE_BOX.city.d + 0.01);
    const lamps = piece.group.children.filter(
      (c): c is Mesh => c instanceof Mesh && 'emissive' in (c.material as object),
    );
    piece.setNight(1);
    expect(lamps.some((m) => (m.material as MeshStandardMaterial).emissiveIntensity > 1)).toBe(
      true,
    );
    piece.dispose();
  });

  it('a mesma semente dá a mesma peça', () => {
    const a = buildLandmark(ESTUFA_CURITIBA, NATURE, 3);
    const b = buildLandmark(ESTUFA_CURITIBA, NATURE, 3);
    expect(a.vertices).toBe(b.vertices);
    expect(bounds(a).getSize(new Vector3()).toArray()).toEqual(
      bounds(b).getSize(new Vector3()).toArray(),
    );
    a.dispose();
    b.dispose();
  });

  it('o schema confere o que a IA escreveria: a estufa serializada em JSON volta igual', () => {
    const json = JSON.parse(JSON.stringify(ESTUFA_CURITIBA)) as unknown;
    expect(landmarkRecipeSchema.parse(json)).toEqual(ESTUFA_CURITIBA);
  });
});
