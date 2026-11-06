import { describe, expect, it } from 'vitest';
import {
  clampPan,
  containSize,
  doubleTap,
  DOUBLE_TAP_SCALE,
  IDENTITY,
  MAX_SCALE,
  pinch,
  swipeDirection,
} from './zoom.ts';

const view = { width: 390, height: 760 };

describe('zoom do visualizador', () => {
  it('a foto cabe inteira em escala 1', () => {
    expect(containSize({ width: 1600, height: 1200 }, view)).toEqual({ width: 390, height: 292.5 });
    expect(containSize({ width: 1200, height: 1600 }, view)).toEqual({ width: 390, height: 520 });
  });

  it('pinça: escala pela distância e o ponto entre os dedos fica parado', () => {
    const z = pinch(
      IDENTITY,
      [
        { x: -50, y: 0 },
        { x: 50, y: 0 },
      ],
      [
        { x: -100, y: 0 },
        { x: 100, y: 0 },
      ],
    );
    expect(z.scale).toBe(2);
    expect(z.x).toBe(0);
    // pinça fora do centro: o ponto (100, 0) continua sob os dedos
    const off = pinch(
      IDENTITY,
      [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    );
    expect(off.scale).toBe(2);
    expect(off.x).toBe(-100);
    expect(
      pinch(
        IDENTITY,
        [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
        ],
        [
          { x: -500, y: 0 },
          { x: 500, y: 0 },
        ],
      ).scale,
    ).toBe(MAX_SCALE);
  });

  it('o arrasto não descola a foto da borda, e em escala 1 ela fica no centro', () => {
    const fitted = { width: 390, height: 292.5 };
    expect(clampPan({ scale: 1, x: 80, y: 40 }, fitted, view)).toEqual({ scale: 1, x: 0, y: 0 });
    // em 2x a foto tem 780 de largura: pode andar 195 para cada lado
    expect(clampPan({ scale: 2, x: 500, y: 0 }, fitted, view).x).toBe(195);
  });

  it('toque duplo aproxima no ponto e o segundo volta ao inteiro', () => {
    const z = doubleTap(IDENTITY, { x: 100, y: 0 });
    expect(z.scale).toBe(DOUBLE_TAP_SCALE);
    expect(z.x).toBe(100 - 100 * DOUBLE_TAP_SCALE);
    expect(doubleTap(z, { x: 0, y: 0 })).toEqual(IDENTITY);
  });

  it('deslizar troca de foto só em escala 1 e na horizontal', () => {
    expect(swipeDirection(-80, 5, 1)).toBe(1);
    expect(swipeDirection(90, -10, 1)).toBe(-1);
    expect(swipeDirection(-40, 0, 1)).toBe(0);
    expect(swipeDirection(-80, 90, 1)).toBe(0);
    expect(swipeDirection(-200, 0, 2)).toBe(0);
  });
});
