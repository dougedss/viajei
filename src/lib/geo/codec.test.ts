import { describe, expect, it } from 'vitest';
import { bboxOf, decodeInts, decodeLine, encodeInts, encodeLine } from './codec.ts';

describe('codec geográfico', () => {
  it('inteiros com sinal vão e voltam', () => {
    const values = [0, 1, -1, 127, 128, -129, 1_000_000, -2_500_000, 11_911_337];
    expect(decodeInts(encodeInts(values))).toEqual(values);
  });

  it('linha vai e volta com precisão de milésimo de grau', () => {
    const line = [
      [-50.1433, -26.3786],
      [-50.1501, -26.3812],
      [-51.3451, -29.2241],
    ];
    const back = decodeLine(encodeLine(line));
    expect(back).toHaveLength(3);
    for (let i = 0; i < line.length; i++) {
      expect(back[i]?.[0]).toBeCloseTo(line[i]?.[0] ?? 0, 3);
      expect(back[i]?.[1]).toBeCloseTo(line[i]?.[1] ?? 0, 3);
    }
  });

  it('deltas pequenos ocupam pouco', () => {
    const line = Array.from({ length: 1000 }, (_, i) => [-50 + i * 0.001, -26 + i * 0.001]);
    expect(encodeLine(line).length).toBeLessThan(1000 * 4);
  });

  it('bboxOf', () => {
    expect(
      bboxOf([
        [1, 2],
        [-3, 4],
        [0, -1],
      ]),
    ).toEqual([-3, -1, 1, 4]);
  });
});
