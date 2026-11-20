import { z } from 'zod';

/**
 * A receita de um cartão-postal (fase 23): a peça de um lugar real como **dado, nunca código**. Uma
 * lista de formas de um vocabulário fechado, cada uma com o material de uma paleta fechada, montada no
 * aparelho pelo mesmo construtor das peças por tipo (`src/art/landmarks/build.ts`). Nada que a IA
 * escreva é executado: a receita só escolhe entre as formas daqui. O mesmo Zod no app (que confere antes
 * de montar) e na função (que confere a saída da IA e o tamanho).
 *
 * **Raso de propósito.** A saída estruturada da Anthropic aceita até 16 parâmetros com união por pedido
 * (conferido em 20/11/2026), e uma forma com campos opcionais por tipo estouraria isso. Aqui não há
 * união nenhuma: `k` e os materiais são enumerações, e todo número está sempre presente (0 quando a
 * forma não usa). Os limites de número e de lista o Zod confere depois (a API não os aceita).
 *
 * As medidas são em metros, na proporção do lugar (pelas fotos, pela planta do OSM quando há): o
 * construtor ajusta a peça inteira à caixa da maquete por uma escala só. O eixo x vai para a direita,
 * y para cima e z para a frente: **a fachada principal olha para +z** (para a estrada). `x`, `y`, `z` são
 * o centro da base da forma; `ry` o giro em graus em torno do eixo vertical; `pts` são pontos `[x0, z0,
 * x1, z1, …]` no plano da forma (antes do giro), ou o perfil `[r0, y0, r1, y1, …]` do torno.
 */
export const LANDMARK_RECIPE_VERSION = 1;

export const LANDMARK_SHAPE_KINDS = [
  'box',
  'cylinder',
  'cone',
  'sphere',
  'dome',
  'drum',
  'arch',
  'arcade',
  'extrude',
  'vault',
  'lathe',
  'gable',
  'hip',
  'stairs',
  'wall',
  'railing',
  'basin',
  'bed',
  'flowers',
  'lamp',
  'tree',
  'pine',
  'araucaria',
  'palm',
  'panel',
  'beam',
] as const;
export type LandmarkShapeKind = (typeof LANDMARK_SHAPE_KINDS)[number];

/** A paleta das peças por tipo (fase 22) mais o que os lugares pedem (fase 23). */
export const LANDMARK_MATERIALS = [
  'wall',
  'wall2',
  'wall3',
  'roof',
  'roof2',
  'slate',
  'wood',
  'leaf',
  'leaf2',
  'leaf3',
  'trunk',
  'awning',
  'awning2',
  'stone',
  'stone2',
  'sign',
  'concrete',
  'concrete2',
  'asphalt',
  'sand',
  'dark',
  'barrel',
  'amber',
  'water',
  'flowerA',
  'flowerB',
  'flowerC',
  'win',
  'lamp',
  'glass',
  'steel',
  'white',
  'grass',
  'soil',
  'paving',
  'brick',
  'violet',
  'gold',
] as const;
export type LandmarkMaterial = (typeof LANDMARK_MATERIALS)[number];

export const LANDMARK_SECOND_MATERIALS = ['none', ...LANDMARK_MATERIALS] as const;
export type LandmarkSecondMaterial = (typeof LANDMARK_SECOND_MATERIALS)[number];

/** O teto: formas antes da repetição, cópias depois dela, o JSON inteiro e os pontos de uma forma. */
export const LANDMARK_LIMITS = {
  shapes: 300,
  copies: 2_000,
  bytes: 32_768,
  pts: 128,
  repeat: 64,
} as const;

/** Uma medida em metros (o sinal só vale para a viga e para a repetição). */
const meters = z.number().min(-500).max(500);

export const landmarkShapeSchema = z.object({
  k: z.enum(LANDMARK_SHAPE_KINDS).describe('a forma, do vocabulário'),
  m: z.enum(LANDMARK_MATERIALS).describe('o material principal'),
  m2: z
    .enum(LANDMARK_SECOND_MATERIALS)
    .describe(
      'o segundo material (a armação do vidro, a água da fonte, a borda do canteiro) ou none',
    ),
  x: meters.describe('o centro da base, em metros (x para a direita)'),
  y: meters.describe('a altura da base, em metros'),
  z: meters.describe('o centro da base, em metros (z para a frente, a fachada olha para +z)'),
  w: meters.describe('a largura (x), ou o diâmetro'),
  h: meters.describe('a altura'),
  d: meters.describe('o fundo (z)'),
  ry: z.number().min(-360).max(360).describe('o giro em torno do eixo vertical, em graus'),
  p: z.number().min(0).max(256).describe('o primeiro parâmetro da forma (0 quando não usa)'),
  q: z.number().min(0).max(100).describe('o segundo parâmetro da forma (0 quando não usa)'),
  rep: z.enum(['one', 'line', 'ring']).describe('a repetição: uma só, em linha ou em anel'),
  n: z
    .number()
    .int()
    .min(1)
    .max(LANDMARK_LIMITS.repeat)
    .describe('quantas cópias (1 sem repetição)'),
  sx: meters.describe('em linha: o passo em x; em anel: o raio'),
  sz: meters.describe('em linha: o passo em z; em anel: o passo em graus (0 = a volta inteira)'),
  mir: z
    .enum(['none', 'x', 'z', 'xz'])
    .describe('o espelho: mais uma cópia do outro lado do plano x = 0 e/ou z = 0'),
  pts: z
    .array(meters)
    .max(LANDMARK_LIMITS.pts)
    .describe(
      'pontos [x0, z0, x1, z1, …] (ou o perfil [r0, y0, r1, y1, …] do torno); vazio se não usa',
    ),
});
export type LandmarkShape = z.infer<typeof landmarkShapeSchema>;

/** Quantas cópias uma forma vira depois da repetição e do espelho. */
export function copiesOf(s: Pick<LandmarkShape, 'rep' | 'n' | 'mir'>): number {
  const rep = s.rep === 'one' ? 1 : s.n;
  const mir = s.mir === 'none' ? 1 : s.mir === 'xz' ? 4 : 2;
  return rep * mir;
}

const utf8 = new TextEncoder();

export const landmarkRecipeSchema = z
  .object({
    v: z.literal(LANDMARK_RECIPE_VERSION),
    shapes: z.array(landmarkShapeSchema).min(1).max(LANDMARK_LIMITS.shapes),
  })
  .superRefine((recipe, ctx) => {
    const copies = recipe.shapes.reduce((acc, s) => acc + copiesOf(s), 0);
    if (copies > LANDMARK_LIMITS.copies) {
      ctx.addIssue({ code: 'custom', message: `cópias demais (${String(copies)})` });
    }
    for (const [i, s] of recipe.shapes.entries()) {
      if (s.pts.length % 2 !== 0) {
        ctx.addIssue({ code: 'custom', path: ['shapes', i, 'pts'], message: 'pontos aos pares' });
      }
    }
    if (utf8.encode(JSON.stringify(recipe)).length > LANDMARK_LIMITS.bytes) {
      ctx.addIssue({ code: 'custom', message: 'a receita passa de 32 KB' });
    }
  });
export type LandmarkRecipe = z.infer<typeof landmarkRecipeSchema>;

/** A receita que veio de fora (o catálogo, a IA) só monta se passar inteira no schema. */
export function parseRecipe(value: unknown): LandmarkRecipe | null {
  const parsed = landmarkRecipeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
