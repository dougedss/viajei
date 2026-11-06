import { lineTo, moveTo, quadTo, type CarProfile, type Pt } from '../profile.ts';

/** Janela de cantos chanfrados, como as da kombi. */
function softWindow(x0: number, x1: number, y0: number, y1: number, c = 0.07): Pt[] {
  return [
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ];
}

/**
 * A kombi (nível 5): caixa alta de cantos arredondados, nariz quase reto com o para-brisa
 * dividido, janelas laterais em série e pintura saia e blusa (a cor da viagem embaixo, branco gelo
 * em cima, com o V no nariz). Três faixas no teto: o prêmio do último nível leva mala, prancha e
 * bicicleta ao mesmo tempo.
 */
export const KOMBI: CarProfile = {
  model: 'kombi',
  top: [
    moveTo(-2.26, 0.38),
    lineTo(-2.3, 0.62),
    lineTo(-2.3, 1.58),
    quadTo(-2.3, 1.97, -1.9, 1.97),
    lineTo(1.72, 1.97),
    quadTo(2.1, 1.97, 2.18, 1.64),
    lineTo(2.28, 1.16),
    quadTo(2.36, 0.92, 2.32, 0.62),
    lineTo(2.28, 0.38),
  ],
  sill: 0.38,
  width: 1.96,
  bevel: 0.08,
  wheels: { radius: 0.4, tire: 0.3, front: 1.25, rear: -1.15, track: 1.7, archGap: 0.12, flare: 0 },
  glass: {
    side: [
      [
        [1.3, 1.34],
        [1.98, 1.34],
        [1.94, 1.78],
        [1.3, 1.8],
      ],
      softWindow(0.3, 1.0, 1.34, 1.8),
      softWindow(-0.7, 0.0, 1.34, 1.8),
      softWindow(-1.7, -1.0, 1.34, 1.8),
      [
        [-1.95, 1.36],
        [-1.95, 1.78],
        [-2.16, 1.7],
        [-2.2, 1.36],
      ],
    ],
    windshield: { from: [2.28, 1.18], to: [2.19, 1.62], split: true },
    rear: { from: [-2.3, 1.3], to: [-2.3, 1.56] },
  },
  lights: {
    head: [2.33, 0.86],
    headSize: [0.22, 0.22],
    headRound: true,
    headSpread: 0.62,
    tail: [-2.3, 0.86],
    tailSize: [0.22, 0.12],
    tailSpread: 0.74,
  },
  grille: null,
  mirror: [2.1, 1.3],
  handles: [
    [1.42, 1.16],
    [0.25, 1.1],
  ],
  bed: null,
  spare: null,
  twoTone: { split: 1.22, vDepth: 0.34 },
  anchors: {
    roof: { y: 2.05, x0: -1.9, x1: 1.7, lanes: [0.56, 0, -0.56] },
    frontBumper: { at: [2.3, 0.52], spread: 0.58 },
    rearPlate: [-2.29, 0.58],
    antenna: [-2.08, 1.98, 0.8],
    stickers: [
      { at: [0.55, 0.78], size: 0.3 },
      { at: [-0.35, 0.78], size: 0.3 },
      { at: [-1.88, 0.86], size: 0.26 },
    ],
  },
};
