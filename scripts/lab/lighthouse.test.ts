import { describe, expect, it } from 'vitest';
import { belowTarget, median } from './lighthouse-score.ts';

describe('median', () => {
  it('a do meio em três, a média das duas do meio em quatro', () => {
    expect(median([91, 72, 88])).toBe(88);
    expect(median([90, 80, 70, 100])).toBe(85);
    expect(median([])).toBe(0);
  });
});

describe('belowTarget', () => {
  it('lista cada nota abaixo de 90, por rota e categoria', () => {
    expect(
      belowTarget({
        entrar: { performance: 97, accessibility: 100, 'best-practices': 96 },
        visao_geral: { performance: 84, accessibility: 89, 'best-practices': 100 },
      }),
    ).toEqual(['visao_geral performance 84', 'visao_geral accessibility 89']);
  });
});
