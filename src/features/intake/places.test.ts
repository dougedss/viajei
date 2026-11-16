import { describe, expect, it } from 'vitest';
import {
  kindOfCategories,
  mainCategory,
  nameFits,
  PLACE_TYPES,
  searchFor,
  suggestionCategories,
  wantsInText,
} from './places.ts';

describe('a tabela de tipos (fase 24): a tabela, não a IA, decide a categoria', () => {
  it.each([
    ['café colonial', ['catering.cafe', 'catering.restaurant'], ['colonial'], 'food'],
    ['Café Colonial', ['catering.cafe', 'catering.restaurant'], ['colonial'], 'food'],
    ['zoológico', ['entertainment.zoo'], [], 'nature'],
    ['museu', ['entertainment.museum'], [], 'city'],
    ['mirante', ['tourism.attraction.viewpoint'], [], 'nature'],
    [
      'cachoeira',
      ['tourism.attraction', 'natural', 'leisure.park'],
      ['cascata', 'cachoeira', 'salto'],
      'nature',
    ],
    ['centro histórico', ['tourism.sights', 'building.historic', 'heritage'], [], 'city'],
    ['vinícola', ['production.winery'], [], 'winery'],
    ['posto de gasolina', ['service.vehicle.fuel'], [], 'fuel'],
    ['pousada', ['accommodation'], [], 'hotel'],
    [
      'parque',
      ['leisure.park', 'leisure.park.nature_reserve', 'national_park', 'natural.protected_area'],
      [],
      'nature',
    ],
  ])('"%s"', (words, categories, names, kind) => {
    const s = searchFor({ words, kind: 'other' });
    expect(s.categories).toEqual(categories);
    expect(s.names).toEqual(names);
    expect(s.kind).toBe(kind);
  });

  it('o mais específico primeiro: parque temático não é parque, café colonial não é café', () => {
    expect(searchFor({ words: 'parque temático', kind: 'event' }).label).toBe(
      'parque de diversões',
    );
    expect(searchFor({ words: 'um café', kind: 'food' }).label).toBe('café');
    expect(searchFor({ words: 'café colonial', kind: 'food' }).label).toBe('café colonial');
  });

  it('o que não está na tabela vira "outro": a categoria larga pelo tipo, e as palavras do pedido no nome', () => {
    expect(searchFor({ words: 'loja de cristais', kind: 'other' })).toEqual({
      label: 'loja de cristais',
      kind: 'other',
      categories: ['tourism.attraction', 'tourism.sights', 'entertainment'],
      names: ['loja', 'cristais'],
    });
    expect(searchFor({ words: 'galinhada', kind: 'food' }).categories).toEqual([
      'catering.restaurant',
      'catering.cafe',
    ]);
  });

  it('toda categoria é uma chave da Geoapify bem formada', () => {
    for (const t of PLACE_TYPES) {
      for (const c of t.categories) expect(c).toMatch(/^[a-z_]+(\.[a-z_-]+)*$/);
    }
  });

  it('a saída de hoje lê o tipo do texto, sem IA', () => {
    expect(wantsInText('quero sair hoje para um café colonial')).toEqual([
      { words: 'café colonial', kind: 'food' },
    ]);
    expect(wantsInText('hoje: zoológico e depois um mirante')).toEqual([
      { words: 'zoológico', kind: 'nature' },
      { words: 'mirante', kind: 'nature' },
    ]);
    expect(wantsInText('quero sair hoje')).toEqual([]);
  });

  it('as sugestões: o clássico de turismo mais o que a pessoa gosta e o que ela deu 4 e 5', () => {
    const { categories, liked } = suggestionCategories(
      ['wineries', 'no_dirt_road'],
      [{ kind: 'food' }],
    );
    expect(categories).toContain('tourism.attraction');
    expect(categories).toContain('entertainment.zoo');
    expect(categories).toContain('production.winery');
    expect(categories).toContain('catering.cafe');
    expect(liked.has('production.winery')).toBe(true);
    expect(categories.length).toBeLessThanOrEqual(20);
  });

  it('o tipo do app de um lugar, pela categoria do mapa', () => {
    expect(kindOfCategories(['catering', 'catering.cafe'])).toBe('food');
    expect(kindOfCategories(['entertainment', 'entertainment.zoo'])).toBe('nature');
    expect(kindOfCategories(['entertainment', 'entertainment.museum'])).toBe('city');
    expect(kindOfCategories(['accommodation', 'accommodation.hotel'])).toBe('hotel');
    expect(kindOfCategories(['production', 'production.winery'])).toBe('winery');
    expect(kindOfCategories(['building'])).toBe('other');
    expect(mainCategory(['catering', 'catering.cafe'])).toBe('catering.cafe');
  });

  it('a palavra do nome tem de estar no nome do mapa', () => {
    const s = searchFor({ words: 'café colonial', kind: 'food' });
    expect(nameFits(s, 'Mahlzeit Café Colonial')).toBe(true);
    expect(nameFits(s, 'Café do Centro')).toBe(false);
    expect(nameFits(searchFor({ words: 'zoo', kind: 'nature' }), 'Bioparque')).toBe(true);
  });
});
