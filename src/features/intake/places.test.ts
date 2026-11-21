import { describe, expect, it } from 'vitest';
import {
  kindOfCategories,
  mainCategory,
  nameFits,
  PLACE_TYPES,
  placeFits,
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

  it('a saída de hoje na ordem do texto (fase 25, D277): os pedidos 6 e 9 da bateria de 20/11', () => {
    // 9: "quero sair hoje a tarde, ver uma cachoeira e depois tomar um cafe" listava o café antes
    expect(
      wantsInText('quero sair hoje a tarde, ver uma cachoeira e depois tomar um cafe').map(
        (w) => w.words,
      ),
    ).toEqual(['cascata', 'café']);
    // 6: "bora numa caxoeira dps comer um xis" (a grafia a IA lê; aqui, o texto como a tabela o entende)
    expect(wantsInText('bora numa cachoeira dps comer um xis').map((w) => w.words)).toEqual([
      'cascata',
      'restaurante',
    ]);
    // a ordem da tabela ainda decide o que cobre o quê: café colonial cobre café
    expect(wantsInText('um café e depois um café colonial').map((w) => w.words)).toEqual([
      'café colonial',
    ]);
    // e o teto de dois continua: o primeiro e o segundo do texto
    expect(wantsInText('mirante, depois praia e por fim um museu').map((w) => w.words)).toEqual([
      'mirante',
      'praia',
    ]);
  });

  it('as sugestões: os marcos mais o que a pessoa gosta, e o clássico de turismo, em duas buscas', () => {
    const { landmarks, classic, liked } = suggestionCategories(
      ['wineries', 'no_dirt_road'],
      [{ kind: 'food' }],
    );
    expect(landmarks).toContain('entertainment.zoo');
    expect(landmarks).toContain('entertainment.museum');
    expect(landmarks).toContain('production.winery');
    expect(landmarks).toContain('catering.cafe');
    expect(classic).toContain('tourism.attraction');
    expect(classic).not.toContain('entertainment.zoo');
    expect(liked.has('production.winery')).toBe(true);
    expect(landmarks.length).toBeLessThanOrEqual(20);
  });

  it('o café colonial sem "colonial" no nome, pela cozinha do OSM (o Torten Paradies, 16/11)', () => {
    const s = searchFor({ words: 'café colonial', kind: 'food' });
    expect(s.cuisine?.categories).toEqual(['catering.cafe']);
    expect(
      placeFits(s, { name: 'Torten Paradies', cuisine: 'german;breakfast;coffee_shop;regional' }),
    ).toBe(true);
    expect(placeFits(s, { name: 'Mahlzeit Café Colonial', cuisine: null })).toBe(true);
    // um café qualquer, sem a cozinha regional, não é café colonial
    expect(placeFits(s, { name: 'Café do Centro', cuisine: 'coffee_shop' })).toBe(false);
    expect(placeFits(s, { name: 'Café do Centro' })).toBe(false);
    // as outras buscas não têm a segunda busca
    expect(searchFor({ words: 'zoológico', kind: 'nature' }).cuisine).toBeUndefined();
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
