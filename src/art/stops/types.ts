import type { StopKind } from '@shared/constants.ts';
import type { Group } from 'three/webgpu';

/**
 * As miniaturas das paradas (fase 14): uma por tipo, na mesma linguagem low-poly e com os mesmos
 * materiais dos carros. Cada uma é um construtor puro de geometria num grupo que olha para +z (a
 * frente, virada para a estrada), assentado no chão (y = 0) e dentro da caixa do tipo, em unidades
 * da cena (o hatch tem 4,6 de comprimento: as miniaturas são do tamanho de uma casa pequena).
 */
export type Box = { w: number; h: number; d: number };

export type Miniature = {
  kind: StopKind;
  group: Group;
  /** a caixa que ela nunca passa: largura (x), altura (y) e profundidade (z) */
  box: Box;
  /** idempotente */
  dispose: () => void;
};

/** A caixa de cada tipo. */
export const MINIATURE_BOX: Record<StopKind, Box> = {
  origin: { w: 3.2, h: 2.6, d: 2.6 },
  transit: { w: 0.8, h: 1.0, d: 0.8 },
  nature: { w: 4.0, h: 3.2, d: 4.0 },
  winery: { w: 3.6, h: 1.8, d: 2.4 },
  hotel: { w: 3.4, h: 3.2, d: 2.4 },
  food: { w: 3.6, h: 2.4, d: 3.0 },
  event: { w: 4.2, h: 2.6, d: 3.4 },
  city: { w: 4.4, h: 4.2, d: 4.4 },
  other: { w: 1.0, h: 2.2, d: 0.4 },
};

/** A folga entre a borda da estrada e a caixa da miniatura, em unidades da cena. */
export const MINIATURE_ROAD_GAP = 1.2;
