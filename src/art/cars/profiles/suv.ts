import { lineTo, moveTo, quadTo, type CarProfile } from '../profile.ts';

/**
 * O SUV (nível 3): mais alto, vão livre maior, rodas maiores com para-lamas marcados, traseira
 * reta com o estepe na tampa. Robusto, nada esportivo.
 */
export const SUV: CarProfile = {
  model: 'suv',
  top: [
    moveTo(-2.36, 0.55),
    lineTo(-2.42, 0.86),
    lineTo(-2.4, 1.66),
    quadTo(-2.4, 1.78, -2.24, 1.78),
    lineTo(0.35, 1.78),
    lineTo(1.2, 1.34),
    lineTo(2.3, 1.26),
    lineTo(2.46, 1.04),
    lineTo(2.42, 0.55),
  ],
  sill: 0.55,
  width: 2.0,
  bevel: 0.08,
  wheels: {
    radius: 0.52,
    tire: 0.34,
    front: 1.5,
    rear: -1.4,
    track: 1.78,
    archGap: 0.12,
    flare: 0.07,
  },
  glass: {
    side: [
      [
        [1.05, 1.38],
        [0.38, 1.72],
        [-0.28, 1.72],
        [-0.28, 1.38],
      ],
      [
        [-0.4, 1.38],
        [-0.4, 1.72],
        [-1.26, 1.72],
        [-1.26, 1.38],
      ],
      [
        [-1.38, 1.38],
        [-1.38, 1.72],
        [-2.18, 1.72],
        [-2.28, 1.38],
      ],
    ],
    windshield: { from: [1.2, 1.34], to: [0.35, 1.78], split: false },
    rear: { from: [-2.404, 1.48], to: [-2.401, 1.68] },
  },
  lights: {
    head: [2.4, 1.12],
    headSize: [0.16, 0.42],
    headRound: false,
    headSpread: 0.62,
    tail: [-2.41, 1.3],
    tailSize: [0.36, 0.12],
    tailSpread: 0.84,
  },
  grille: { at: [2.45, 0.86], size: [0.3, 1.0] },
  mirror: [1.05, 1.38],
  handles: [
    [0.55, 1.27],
    [-0.55, 1.27],
  ],
  bed: null,
  spare: [-2.415, 1.06],
  twoTone: null,
  anchors: {
    roof: { y: 1.86, x0: -2.0, x1: 0.25, lanes: [0.36, -0.36] },
    frontBumper: { at: [2.43, 0.66], spread: 0.68 },
    rearPlate: [-2.37, 0.6],
    antenna: [2.0, 1.36, 0.74],
    stickers: [
      { at: [0.42, 0.98], size: 0.3 },
      { at: [-0.6, 0.98], size: 0.28 },
      { at: [-2.12, 1.1], size: 0.24 },
    ],
  },
};
