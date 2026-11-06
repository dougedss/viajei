import { tierFor as baseTier, type QualityLevel, type Tier } from '@/lib/three/quality.ts';

/**
 * O que o nível de qualidade muda só na maquete, por cima do `Tier` comum das cenas 3D
 * (`lib/three/quality.ts`): Leve afina o cenário para 60% das instâncias e tira a sombra das
 * árvores; Alta mantém tudo.
 */
export type WorldTier = Tier & {
  /** fração das instâncias do cenário que ficam */
  instanceRatio: number;
  treeShadows: boolean;
};

const SCENERY: Record<QualityLevel, Pick<WorldTier, 'instanceRatio' | 'treeShadows'>> = {
  leve: { instanceRatio: 0.6, treeShadows: false },
  alta: { instanceRatio: 1, treeShadows: true },
};

export function tierFor(level: QualityLevel, devicePixelRatio: number): WorldTier {
  return { ...baseTier(level, devicePixelRatio), ...SCENERY[level] };
}
