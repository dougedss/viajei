import { lineTo, moveTo, quadTo, type CarProfile } from '../profile.ts';

/**
 * A picape (nível 4): cabine dupla e caçamba aberta com paredes e tampa. O contorno desce até o
 * piso da caçamba atrás da cabine; as paredes vêm do campo `bed`. O rack fica sobre a cabine.
 */
export const PICKUP: CarProfile = {
  model: 'pickup',
  top: [
    moveTo(-2.68, 0.52),
    lineTo(-2.74, 0.78),
    lineTo(-2.72, 1.08),
    lineTo(-0.8, 1.08),
    lineTo(-0.8, 1.62),
    quadTo(-0.8, 1.74, -0.66, 1.74),
    lineTo(0.62, 1.74),
    lineTo(1.32, 1.3),
    lineTo(2.55, 1.2),
    lineTo(2.78, 0.98),
    lineTo(2.74, 0.52),
  ],
  sill: 0.52,
  width: 2.0,
  bevel: 0.08,
  wheels: {
    radius: 0.46,
    tire: 0.34,
    front: 1.75,
    rear: -1.55,
    track: 1.8,
    archGap: 0.1,
    flare: 0,
  },
  glass: {
    side: [
      [
        [1.16, 1.36],
        [0.62, 1.68],
        [0.06, 1.68],
        [0.06, 1.36],
      ],
      [
        [-0.06, 1.36],
        [-0.06, 1.68],
        [-0.68, 1.68],
        [-0.68, 1.36],
      ],
    ],
    windshield: { from: [1.32, 1.3], to: [0.62, 1.74], split: false },
    rear: { from: [-0.8, 1.38], to: [-0.8, 1.64] },
  },
  lights: {
    head: [2.72, 1.04],
    headSize: [0.16, 0.44],
    headRound: false,
    headSpread: 0.64,
    tail: [-2.73, 1.24],
    tailSize: [0.26, 0.1],
    tailSpread: 0.88,
  },
  grille: { at: [2.76, 0.8], size: [0.28, 1.1] },
  mirror: [1.16, 1.35],
  handles: [
    [0.72, 1.25],
    [-0.22, 1.25],
  ],
  bed: { x0: -2.72, x1: -0.8, floor: 1.08, top: 1.42, wall: 0.07 },
  spare: null,
  twoTone: null,
  anchors: {
    roof: { y: 1.82, x0: -0.75, x1: 0.65, lanes: [0.36, -0.36] },
    frontBumper: { at: [2.75, 0.6], spread: 0.7 },
    rearPlate: [-2.73, 0.7],
    antenna: [2.2, 1.3, 0.74],
    stickers: [
      { at: [0.62, 0.98], size: 0.3 },
      { at: [-0.35, 0.98], size: 0.28 },
      { at: [-2.3, 0.8], size: 0.26 },
    ],
  },
};
