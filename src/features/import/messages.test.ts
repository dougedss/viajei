import { describe, expect, it } from 'vitest';
import { charCount, errorCopy, quotaHint, whenBack } from './messages.ts';
import type { ImportPhase } from './preview.ts';

/** 7/11 às 10h de São Paulo */
const NOW = new Date('2026-11-07T13:00:00Z');
type ErrorPhase = Extract<ImportPhase, { kind: 'error' }>;
const error = (over: Partial<ErrorPhase>): ErrorPhase => ({
  kind: 'error',
  code: 'failed',
  reason: null,
  category: null,
  retryAt: null,
  ...over,
});

describe('a hora em que a cota volta', () => {
  it('hoje, amanhã ou a data, sempre na hora de São Paulo', () => {
    expect(whenBack('2026-11-07T17:32:00Z', NOW)).toBe('às 14:32');
    expect(whenBack('2026-11-08T12:10:00Z', NOW)).toBe('amanhã às 09:10');
    // 02:30 UTC do dia 8 ainda é dia 7 em São Paulo
    expect(whenBack('2026-11-08T02:30:00Z', NOW)).toBe('às 23:30');
    expect(whenBack('2026-11-10T11:00:00Z', NOW)).toBe('em 10/11 às 08:00');
  });
});

describe('as frases de erro', () => {
  it('o limite diz quantas leituras e quando volta', () => {
    expect(
      errorCopy(error({ code: 'rate_limited', retryAt: '2026-11-07T17:32:00Z' }), {
        now: NOW,
        lastStop: null,
      }).text,
    ).toBe('Você já leu 20 roteiros nas últimas 24 horas. A próxima leitura libera às 14:32.');
  });

  it('o texto incompleto diz até onde foi lido', () => {
    expect(
      errorCopy(error({ code: 'truncated', reason: 'deadline' }), {
        now: NOW,
        lastStop: 'Cascata do Caracol',
      }).text,
    ).toMatch(/^O texto foi lido até Cascata do Caracol\. O que chegou está aqui/);
  });

  it('cada estado tem frase própria, sem jargão', () => {
    for (const code of [
      'too_long',
      'refused',
      'truncated',
      'invalid',
      'failed',
      'offline',
    ] as const) {
      const copy = errorCopy(error({ code }), { now: NOW, lastStop: null });
      expect(copy.title.length).toBeGreaterThan(0);
      expect(`${copy.title} ${copy.text}`).not.toMatch(/token|modelo|servidor|API|JSON|erro \d/i);
    }
    expect(errorCopy(error({ code: 'refused' }), { now: NOW, lastStop: null }).text).toContain(
      'monte as paradas à mão',
    );
  });
});

describe('o contador e a cota', () => {
  it('o contador mostra o limite com separador de milhar', () => {
    expect(charCount(2714)).toBe('2.714 / 30.000');
  });

  it('a cota só aparece perto do fim', () => {
    expect(quotaHint(null)).toBeNull();
    expect(quotaHint(12)).toBeNull();
    expect(quotaHint(3)).toBe('Restam 3 leituras hoje.');
    expect(quotaHint(1)).toBe('Resta 1 leitura hoje.');
    expect(quotaHint(0)).toBe('As leituras de hoje acabaram.');
  });
});
