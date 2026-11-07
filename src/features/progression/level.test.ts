import { describe, expect, it } from 'vitest';
import { levelOf, levelPhrase, levelProgress, unlockPhrase } from './level.ts';

describe('níveis', () => {
  it('limiares: 0 Turista, 150 Viajante, 400 Explorador, 900 Estradeiro, 2000 Lenda da Estrada', () => {
    expect(
      [0, 149, 150, 399, 400, 899, 900, 1999, 2000, 9999].map((xp) => levelOf(xp).level),
    ).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(levelOf(400).name).toBe('Explorador');
  });

  it('a barra: o caminho até o próximo nível e quanto falta', () => {
    expect(levelProgress(24)).toMatchObject({ fraction: 0.16, toNext: 126 });
    expect(levelProgress(275).fraction).toBe(0.5);
    expect(levelProgress(2400)).toMatchObject({ next: null, fraction: 1, toNext: 0 });
  });

  it('o que cada nível libera, com o artigo', () => {
    expect(unlockPhrase(2)).toBe('que libera o sedã');
    expect(unlockPhrase(3)).toBe('que libera o SUV');
    expect(unlockPhrase(4)).toBe('que libera a picape');
    expect(unlockPhrase(5)).toBe('que libera a kombi e o dourado');
    expect(unlockPhrase(1)).toBe('');
  });

  it('a frase do time e a da pessoa (e de quem viaja só)', () => {
    expect(levelPhrase(levelProgress(24), 'team')).toBe(
      'Mais 126 XP e vocês viram Viajante, que libera o sedã.',
    );
    expect(levelPhrase(levelProgress(612), 'me')).toBe(
      'Mais 288 XP para Estradeiro, que libera a picape.',
    );
    expect(levelPhrase(levelProgress(24), 'team', true)).toBe(
      'Mais 126 XP para Viajante, que libera o sedã.',
    );
    expect(levelPhrase(levelProgress(2000), 'team')).toBe('Vocês chegaram ao último nível.');
  });
});
