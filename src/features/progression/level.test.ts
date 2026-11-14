import { describe, expect, it } from 'vitest';
import { CAR_MODELS, type CarModel } from '@shared/constants.ts';
import { levelOf, levelPhrase, levelProgress, unlockPhrase, unlocksAt } from './level.ts';

const MODELS = Object.keys(CAR_MODELS) as CarModel[];

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

  it('o que cada nível libera no carro, com o artigo (a escada da fase 16)', () => {
    expect(unlockPhrase(1)).toBe('');
    expect(unlockPhrase(2)).toBe('que libera o metálico e a roda de cinco raios');
    expect(unlockPhrase(3)).toBe('que libera o perolado e a roda raiada');
    expect(unlockPhrase(4)).toBe('que libera o fosco e a roda de aço');
    expect(unlockPhrase(5)).toBe(
      'que libera o dourado e o seu carro de verdade, numa versão futura',
    );
    expect(unlocksAt(1)).toMatchObject({
      models: MODELS,
      finishes: ['solid'],
      wheels: ['classic'],
    });
    expect(unlocksAt(5)).toMatchObject({ models: [], colors: ['gold'], ownCar: true });
    expect(unlocksAt(3).ownCar).toBe(false);
  });

  it('a frase da pessoa diz o que vem; a do time, só o nível (cada um libera o seu carro)', () => {
    expect(levelPhrase(levelProgress(24), 'team')).toBe('Mais 126 XP e vocês viram Viajante.');
    expect(levelPhrase(levelProgress(612), 'me')).toBe(
      'Mais 288 XP para Estradeiro, que libera o fosco e a roda de aço.',
    );
    // quem viaja só: o time é a pessoa
    expect(levelPhrase(levelProgress(24), 'team', true)).toBe(
      'Mais 126 XP para Viajante, que libera o metálico e a roda de cinco raios.',
    );
    expect(levelPhrase(levelProgress(2000), 'team')).toBe('Vocês chegaram ao último nível.');
    expect(levelPhrase(levelProgress(2000), 'me')).toBe('Último nível.');
  });
});
