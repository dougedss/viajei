import { lineTo, moveTo, type CarProfile } from '../profile.ts';

/** O sedã (nível 2): mais longo, terceiro volume do porta-malas, teto mais baixo que o do hatch. */
export const SEDAN: CarProfile = {
  model: 'sedan',
  top: [
    moveTo(-2.42, 0.36),
    lineTo(-2.48, 0.62),
    lineTo(-2.44, 0.96),
    lineTo(-2.3, 1.06),
    lineTo(-1.55, 1.1),
    lineTo(-1.05, 1.37),
    lineTo(0.22, 1.38),
    lineTo(1.0, 1.06),
    lineTo(2.3, 0.94),
    lineTo(2.5, 0.7),
    lineTo(2.46, 0.36),
  ],
  sill: 0.36,
  width: 1.9,
  bevel: 0.08,
  wheels: {
    radius: 0.42,
    tire: 0.3,
    front: 1.55,
    rear: -1.45,
    track: 1.72,
    archGap: 0.1,
    flare: 0,
  },
  glass: {
    side: [
      [
        [0.86, 1.1],
        [0.2, 1.33],
        [-0.36, 1.33],
        [-0.36, 1.1],
      ],
      [
        [-0.48, 1.1],
        [-0.48, 1.33],
        [-1.02, 1.32],
        [-1.36, 1.14],
        [-1.36, 1.1],
      ],
    ],
    windshield: { from: [1.0, 1.06], to: [0.22, 1.38], split: false },
    rear: { from: [-1.05, 1.37], to: [-1.55, 1.1] },
  },
  lights: {
    head: [2.4, 0.82],
    headSize: [0.14, 0.4],
    headRound: false,
    headSpread: 0.58,
    tail: [-2.45, 0.86],
    tailSize: [0.12, 0.4],
    tailSpread: 0.58,
  },
  grille: { at: [2.49, 0.58], size: [0.16, 0.9] },
  mirror: [0.86, 1.08],
  handles: [
    [0.45, 1.0],
    [-0.64, 1.0],
  ],
  bed: null,
  spare: null,
  twoTone: null,
  anchors: {
    roof: { y: 1.46, x0: -1.15, x1: 0.28, lanes: [0.32, -0.32] },
    frontBumper: { at: [2.47, 0.46], spread: 0.62 },
    rearPlate: [-2.48, 0.64],
    antenna: [2.0, 1.04, 0.7],
    stickers: [
      { at: [0.3, 0.72], size: 0.3 },
      { at: [-0.72, 0.74], size: 0.26 },
      { at: [-2.08, 0.82], size: 0.24 },
    ],
  },
};
