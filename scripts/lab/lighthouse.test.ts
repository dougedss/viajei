import { describe, expect, it } from 'vitest';
import { belowTarget, median, MIN_BENCHMARK_INDEX, verdict } from './lighthouse-score.ts';

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

describe('verdict', () => {
  const ok = 'tudo acima de 90';
  it('passa com tudo acima da meta, e diz o índice da máquina', () => {
    expect(verdict({ below: [], benchmark: 4_120.4, problems: [], ok })).toEqual({
      status: 'pass',
      detail: 'tudo acima de 90 · índice de CPU 4120',
    });
  });

  it('numa máquina normal, nota abaixo da meta é falha', () => {
    expect(
      verdict({ below: ['visao_geral performance 86'], benchmark: 2_950, problems: [], ok }),
    ).toEqual({ status: 'fail', detail: 'visao_geral performance 86 (índice de CPU 2950)' });
  });

  it('numa máquina lenta, nota abaixo da meta é medida e não cobrada (pulado, com os números)', () => {
    const v = verdict({
      below: ['visao_geral performance 86', 'roteiro_dia performance 88'],
      benchmark: MIN_BENCHMARK_INDEX - 1,
      problems: [],
      ok,
    });
    expect(v.status).toBe('skip');
    expect(v.detail).toBe(
      'Medido, não cobrado: máquina lenta (índice de CPU 2799, abaixo de 2800): visao_geral performance 86; roteiro_dia performance 88',
    );
  });

  it('sem o índice, a nota abaixo da meta continua sendo cobrada', () => {
    expect(
      verdict({ below: ['viagens performance 80'], benchmark: null, problems: [], ok }).status,
    ).toBe('fail');
  });

  it('o que falha por si (instalação, o Lighthouse não rodou) é falha em qualquer máquina', () => {
    const v = verdict({
      below: ['visao_geral performance 86'],
      benchmark: 2_300,
      problems: ['o service worker não assumiu a página'],
      ok,
    });
    expect(v).toEqual({
      status: 'fail',
      detail:
        'o service worker não assumiu a página; visao_geral performance 86; índice de CPU 2300',
    });
  });
});
