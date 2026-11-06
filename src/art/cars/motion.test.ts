import { describe, expect, it } from 'vitest';
import {
  DROP,
  dropPose,
  OUT_MS,
  outPose,
  PAINT_MS,
  paintProgress,
  POP_MS,
  POP_SEAT,
  popPose,
} from './motion.ts';

describe('as poses do encaixe', () => {
  it('drop: cai de 0,9, assenta aos 300 ms achatado e volta com mola até 600 ms', () => {
    expect(dropPose(0).dy).toBeCloseTo(DROP.height);
    expect(dropPose(0).seated).toBe(false);
    expect(dropPose(DROP.fallMs - 1).dy).toBeLessThan(0.01);
    const contact = dropPose(DROP.fallMs);
    expect(contact.seated).toBe(true);
    expect(contact.squash).toBeCloseTo(0.88, 2);
    expect(dropPose(DROP.fallMs + DROP.settleMs - 1).squash).toBeCloseTo(1, 1);
    expect(dropPose(DROP.fallMs + DROP.settleMs)).toEqual({
      dy: 0,
      scale: 1,
      squash: 1,
      seated: true,
      done: true,
    });
    // a queda acelera
    const a = DROP.height - dropPose(100).dy;
    const b = dropPose(100).dy - dropPose(200).dy;
    expect(b).toBeGreaterThan(a);
  });

  it('pop: cresce de 0, passa do tamanho e assenta', () => {
    expect(popPose(0).scale).toBeCloseTo(0);
    const peak = Math.max(
      ...Array.from({ length: 40 }, (_, i) => popPose((i / 40) * POP_MS).scale),
    );
    expect(peak).toBeGreaterThan(1);
    expect(popPose(POP_MS * POP_SEAT).seated).toBe(true);
    expect(popPose(POP_MS).done).toBe(true);
  });

  it('out: sobe e encolhe em 250 ms', () => {
    expect(outPose(0)).toMatchObject({ dy: 0, scale: 1, done: false });
    expect(outPose(OUT_MS)).toMatchObject({ dy: 0.5, scale: 0, done: true });
  });

  it('a tinta interpola em 400 ms, suave nas pontas', () => {
    expect(paintProgress(0)).toBe(0);
    expect(paintProgress(PAINT_MS / 2)).toBeCloseTo(0.5);
    expect(paintProgress(PAINT_MS)).toBe(1);
    expect(paintProgress(PAINT_MS * 0.1)).toBeLessThan(0.1);
  });
});
