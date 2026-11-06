import type { Pt } from './profile.ts';

/**
 * As medidas dos acessórios, as mesmas no 3D e na vista lateral: o rack levanta o convés onde os
 * itens de teto se apoiam; mala, prancha e bicicleta têm forma própria e se ajustam ao comprimento
 * e à largura da faixa. Tudo em unidades da cena, relativo ao convés e ao centro do trilho.
 */
export const RACK = {
  /** do teto ao topo das barras transversais: onde os itens se apoiam */
  deck: 0.11,
  bar: { w: 0.07, h: 0.06 },
  rail: 0.05,
  /** as barras ficam a esta fração do comprimento do trilho, a partir de cada ponta */
  inset: 0.2,
};

/** A blusa da kombi: branco gelo. */
export const PAINT_TOP_HEX = '#F1EEE7';

export const BOX = { height: 0.34, width: 0.78, minLength: 1.4, maxLength: 2.0, radius: 0.08 };

export const BOARD = { length: 2.66, width: 0.56, thickness: 0.12 };

/** A bicicleta de lado, com o centro do trilho em x = 0 e o convés em y = 0; frente para o nariz. */
export const BIKE: {
  wheelR: number;
  rear: Pt;
  front: Pt;
  crank: Pt;
  seat: Pt;
  head: Pt;
  tube: number;
} = {
  wheelR: 0.3,
  rear: [-0.45, 0.3],
  front: [0.45, 0.3],
  crank: [-0.02, 0.22],
  seat: [-0.25, 0.74],
  head: [0.28, 0.71],
  tube: 0.025,
};

/** Os tubos do quadro, como pares de pontos da bicicleta. */
export const BIKE_TUBES: readonly (readonly [Pt, Pt])[] = [
  [BIKE.rear, BIKE.seat],
  [BIKE.seat, BIKE.head],
  [BIKE.head, BIKE.front],
  [BIKE.rear, BIKE.crank],
  [BIKE.crank, BIKE.head],
  [BIKE.seat, BIKE.crank],
];

export const ANTENNA = { height: 0.85, flag: { w: 0.3, h: 0.17 } };

export const FOG_LIGHT = { radius: 0.065 };

/** A altura máxima que um acessório leva acima do teto (a bicicleta). */
export const ROOF_HEADROOM = RACK.deck + BIKE.seat[1] + 0.06;

/** Largura útil de uma faixa: a distância à vizinha, ou a largura do teto quando é uma só. */
export function laneWidth(lanes: readonly number[], width: number): number {
  if (lanes.length < 2) return width - 0.3;
  const sorted = [...lanes].sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < sorted.length; i++) {
    min = Math.min(min, (sorted[i] ?? 0) - (sorted[i - 1] ?? 0));
  }
  return min;
}

/** O comprimento da mala de teto numa faixa: acompanha o trilho, entre o mínimo e o máximo. */
export function boxLength(roofLength: number): number {
  return Math.min(BOX.maxLength, Math.max(BOX.minLength, roofLength - 0.1));
}
