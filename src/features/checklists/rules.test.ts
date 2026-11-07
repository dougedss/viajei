import { describe, expect, it } from 'vitest';
import { makeItem } from '@/test/factories.ts';
import {
  daysUntil,
  eveOf,
  isReady,
  kindFromSlug,
  listItems,
  listsProgress,
  normalizeText,
  questPoints,
  readinessPhrase,
  shortcutValue,
  shouldCelebrate,
  showsReadiness,
} from './rules.ts';

const DONE = { done_by: 'u', done_at: '2026-12-01T10:00:00.000Z' };

describe('progresso das listas', () => {
  it('conta só o que está ativo: dispensado, sugerido e excluído não entram', () => {
    const items = [
      makeItem({ kind: 'before', ...DONE }),
      makeItem({ kind: 'before' }),
      makeItem({ kind: 'before', status: 'dismissed', source: 'system' }),
      makeItem({ kind: 'pack', ...DONE }),
      makeItem({ kind: 'pack', status: 'suggested', source: 'system' }),
      makeItem({ kind: 'pack', deleted_at: '2026-12-01T10:00:00.000Z' }),
      makeItem({ kind: 'quest', points: 20, ...DONE }),
      makeItem({ kind: 'quest', points: 10 }),
    ];
    const p = listsProgress(items);
    expect(p).toEqual({
      before: { done: 1, total: 2 },
      pack: { done: 1, total: 1 },
      quest: { done: 1, total: 2 },
    });
    expect(shortcutValue(p)).toBe('2 de 3');
    expect(questPoints(items)).toEqual({ done: 20, total: 30 });
  });

  it('"7 de 11" como no style tile; listas vazias dizem "vazias"', () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => makeItem({ kind: 'before', ...(i < 3 ? DONE : {}) })),
      ...Array.from({ length: 6 }, (_, i) => makeItem({ kind: 'pack', ...(i < 4 ? DONE : {}) })),
    ];
    expect(shortcutValue(listsProgress(items))).toBe('7 de 11');
    expect(shortcutValue(listsProgress([]))).toBe('vazias');
  });

  it('a lista sai na ordem da posição fracionária (collate "C"), não na de criação', () => {
    const items = [
      makeItem({ kind: 'pack', text: 'b', position: 'a1' }),
      makeItem({ kind: 'pack', text: 'a', position: 'Zz' }),
      makeItem({ kind: 'pack', text: 'c', position: 'a1V' }),
    ];
    expect(listItems(items, 'pack').map((i) => i.text)).toEqual(['a', 'b', 'c']);
  });
});

describe('"Pronto para partir"', () => {
  const ready = [makeItem({ kind: 'before', ...DONE }), makeItem({ kind: 'pack', ...DONE })];

  it('antes e mala com itens e tudo marcado; lista vazia não é lista pronta', () => {
    expect(isReady(listsProgress(ready))).toBe(true);
    expect(isReady(listsProgress([makeItem({ kind: 'before', ...DONE })]))).toBe(false);
    expect(isReady(listsProgress([...ready, makeItem({ kind: 'pack' })]))).toBe(false);
    // missão faltando não segura a prontidão
    expect(isReady(listsProgress([...ready, makeItem({ kind: 'quest', points: 10 })]))).toBe(true);
  });

  it('só antes do início e uma vez por aparelho', () => {
    const progress = listsProgress(ready);
    const base = { progress, startDate: '2026-12-11', alreadyShown: false };
    expect(shouldCelebrate({ ...base, today: '2026-12-10' })).toBe(true);
    expect(shouldCelebrate({ ...base, today: '2026-12-11' })).toBe(false);
    expect(shouldCelebrate({ ...base, today: '2026-12-13' })).toBe(false);
    expect(shouldCelebrate({ ...base, today: '2026-12-01', alreadyShown: true })).toBe(false);
    expect(showsReadiness('2026-12-10', '2026-12-11')).toBe(true);
    expect(showsReadiness('2026-12-11', '2026-12-11')).toBe(false);
  });

  it('a frase do style tile: o prazo é a véspera, no plural para o time e no singular sozinho', () => {
    expect(readinessPhrase('2026-12-11', 2)).toBe(
      'Fechem as duas listas até 10/12 para ganhar a mala de teto.',
    );
    expect(readinessPhrase('2026-12-11', 1)).toBe(
      'Feche as duas listas até 10/12 para ganhar a mala de teto.',
    );
    expect(eveOf('2027-01-01')).toBe('2026-12-31');
    expect(daysUntil('2026-12-08', '2026-12-11')).toBe(3);
  });
});

describe('miúdos', () => {
  it('texto comparável sem acento, maiúscula nem espaço extra', () => {
    expect(normalizeText('  Calçado   com ADERÊNCIA ')).toBe('calcado com aderencia');
  });

  it('a aba pela URL', () => {
    expect(kindFromSlug('mala')).toBe('pack');
    expect(kindFromSlug('missoes')).toBe('quest');
    expect(kindFromSlug(null)).toBe('before');
    expect(kindFromSlug('qualquer')).toBe('before');
  });
});
