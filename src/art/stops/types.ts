import type { StopKind } from '@shared/constants.ts';
import type { Group } from 'three/webgpu';

/**
 * As peças das paradas (fases 14 e 22): uma por tipo, na mesma linguagem low-poly e com os mesmos
 * materiais dos carros. Cada uma é um construtor puro de geometria num grupo que olha para +z (a
 * frente, virada para a estrada), assentado no chão (y = 0) e dentro da caixa do tipo, em unidades
 * da cena. Com o dia inteiro na tela (fase 22) as peças são grandes, como num mapa ilustrado de
 * turismo: de 6 a 18 unidades de frente (o hatch tem 4,6 de comprimento e anda 2,6× maior no
 * repouso), reconhecíveis de longe. À noite acendem as janelas e uma poça de luz no chão, por
 * emissão (nenhuma luz entra na cena).
 */
export type Box = { w: number; h: number; d: number };

export type Miniature = {
  kind: StopKind;
  group: Group;
  /** a caixa que ela nunca passa: largura (x, a frente), altura (y) e profundidade (z) */
  box: Box;
  /** 0 = dia, 1 = noite: as janelas, as lâmpadas e a poça de luz */
  setNight: (t: number) => void;
  /** idempotente */
  dispose: () => void;
};

/** A caixa de cada tipo: a frente (ao longo da estrada), a altura e o fundo. */
export const MINIATURE_BOX: Record<StopKind, Box> = {
  origin: { w: 12, h: 8, d: 10 },
  transit: { w: 6, h: 5, d: 4 },
  nature: { w: 18, h: 11, d: 14 },
  winery: { w: 18, h: 7, d: 14 },
  hotel: { w: 16, h: 11, d: 12 },
  food: { w: 15, h: 8, d: 12 },
  event: { w: 18, h: 9, d: 14 },
  city: { w: 18, h: 18, d: 16 },
  fuel: { w: 16, h: 8, d: 12 },
  other: { w: 6, h: 8, d: 3 },
};

/** A folga entre a borda da estrada e a caixa da peça, em unidades da cena. */
export const MINIATURE_ROAD_GAP = 2.5;
