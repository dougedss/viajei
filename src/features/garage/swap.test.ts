import { describe, expect, it } from 'vitest';
import { shortestTurn, SWAP, swapPose } from './swap.ts';

describe('a troca de modelo', () => {
  it('o atual sai acelerando, esterçando no começo; o novo entra freando; ~0,9 s', () => {
    const start = swapPose(0);
    expect(start.out).toEqual({ travel: 0, steer: 0 });
    const early = swapPose(SWAP.outMs * SWAP.steer);
    expect(early.out?.steer).toBeCloseTo(1, 6);
    const half = swapPose(SWAP.outMs / 2);
    expect(half.out?.travel).toBeCloseTo(SWAP.distance / 4, 6);
    const entering = swapPose(SWAP.outMs + 1);
    expect(entering.out).toBeNull();
    expect(entering.in?.offset).toBeCloseTo(-SWAP.distance, 1);
    const near = swapPose(SWAP.outMs + SWAP.inMs * 0.9);
    expect(Math.abs(near.in?.offset ?? 99)).toBeLessThan(0.05);
    const end = swapPose(SWAP.outMs + SWAP.inMs);
    expect(end).toEqual({ out: null, in: { offset: 0 }, done: true });
    expect(SWAP.outMs + SWAP.inMs).toBe(900);
  });

  it('o esterço vai pelo caminho mais curto', () => {
    expect(shortestTurn(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(shortestTurn(0, (3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(shortestTurn(10, 10)).toBeCloseTo(0);
  });
});
