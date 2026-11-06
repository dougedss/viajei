import { lineTo, moveTo, type CarProfile } from '../profile.ts';

/**
 * O hatch, o carro livre: dois volumes, traseira quase reta, capô curto. É a régua dos outros. O
 * capô sobe um pouco em relação à fase 5 para o arco da roda da frente, agora centrado nela, ficar
 * por baixo da chapa (antes o contorno se cruzava ali).
 */
export const HATCH: CarProfile = {
  model: 'hatch',
  top: [
    moveTo(-2.15, 0.38),
    lineTo(-2.2, 0.64),
    lineTo(-2.15, 1.04),
    lineTo(-1.85, 1.4),
    lineTo(-1.3, 1.48),
    lineTo(0.1, 1.46),
    lineTo(0.95, 1.04),
    lineTo(2.1, 0.92),
    lineTo(2.26, 0.68),
    lineTo(2.2, 0.38),
  ],
  sill: 0.38,
  width: 1.9,
  bevel: 0.08,
  wheels: { radius: 0.42, tire: 0.3, front: 1.4, rear: -1.4, track: 1.72, archGap: 0.1, flare: 0 },
  glass: {
    side: [
      [
        [0.8, 1.06],
        [0.14, 1.38],
        [-0.4, 1.39],
        [-0.4, 1.06],
      ],
      [
        [-0.52, 1.06],
        [-0.52, 1.39],
        [-1.28, 1.4],
        [-1.7, 1.12],
        [-1.7, 1.06],
      ],
    ],
    windshield: { from: [0.95, 1.04], to: [0.1, 1.46], split: false },
    rear: { from: [-1.85, 1.4], to: [-2.15, 1.04] },
  },
  lights: {
    head: [2.18, 0.8],
    headSize: [0.16, 0.36],
    headRound: false,
    headSpread: 0.58,
    tail: [-2.16, 0.94],
    tailSize: [0.12, 0.34],
    tailSpread: 0.6,
  },
  grille: { at: [2.23, 0.55], size: [0.18, 0.9] },
  mirror: [0.8, 1.1],
  handles: [
    [0.42, 0.96],
    [-0.66, 0.96],
  ],
  bed: null,
  spare: null,
  twoTone: null,
  anchors: {
    roof: { y: 1.55, x0: -1.75, x1: 0.05, lanes: [0.32, -0.32] },
    frontBumper: { at: [2.22, 0.46], spread: 0.62 },
    rearPlate: [-2.2, 0.64],
    antenna: [1.75, 1.03, 0.7],
    stickers: [
      { at: [0.22, 0.72], size: 0.3 },
      { at: [-0.64, 0.74], size: 0.26 },
      { at: [-1.98, 0.86], size: 0.24 },
    ],
  },
};
