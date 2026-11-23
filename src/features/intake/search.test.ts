import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import type { Place } from '@shared/places-schema.ts';
import { searchFor } from './places.ts';
import {
  aboutMinutes,
  bestOrder,
  corridorArea,
  detourMinutes,
  driveMinutes,
  optionsFor,
  optionsRequest,
  placesKey,
  radiusForHours,
  reachLabel,
  suggestionsFor,
} from './search.ts';

const place = (
  id: string,
  name: string,
  lng: number,
  lat: number,
  categories = ['catering.cafe'],
): Place => ({
  id,
  name,
  lat,
  lng,
  categories,
  city: 'Pomerode',
  address: null,
  opening_hours: null,
  website: null,
  osm: null,
  distance_m: null,
});
const PAPANDUVA: LngLat = [-50.144, -26.37];
const POMERODE: LngLat = [-49.177, -26.74];

describe('o tempo de carro estimado (fase 24)', () => {
  it('a linha reta vezes o fator de estrada, a velocidade pela faixa, arredondado a 5', () => {
    expect(driveMinutes(0)).toBe(5);
    expect(driveMinutes(10)).toBe(20); // 13 km de estrada a 35 km/h
    expect(driveMinutes(105)).toBe(135); // Papanduva → Pomerode: ~2 h 15 (a rota real dá ~2 h)
    expect(aboutMinutes(40)).toBe('cerca de 40 min');
    expect(aboutMinutes(130)).toBe('cerca de 2 h 10');
    expect(aboutMinutes(120)).toBe('cerca de 2 h');
  });

  it('o alcance em horas vira o raio, pela mesma conta, e volta como rótulo', () => {
    const r = radiusForHours(2);
    expect(driveMinutes(r)).toBeLessThanOrEqual(120);
    expect(driveMinutes(r + 5)).toBeGreaterThan(115);
    expect(reachLabel(r)).toBe('2 h');
    expect(reachLabel(30)).toBe('50 min');
  });
});

describe('as opções', () => {
  const cafe = searchFor({ words: 'café colonial', kind: 'food' });
  it('só o que tem a palavra no nome, sem repetir, as mais perto primeiro, com a distância (o tempo é o medido, D310)', () => {
    const opts = optionsFor(
      [
        place('a', 'Torten Paradies Café Colonial', -49.172, -26.74),
        place('b', 'Mahlzeit Café Colonial', -49.18, -26.73),
        place('c', 'Café do Centro', -49.17, -26.74),
        place('d', 'Mahlzeit Café Colonial', -49.1801, -26.7301),
        place('e', 'Café Colonial Perto', -50.1, -26.4),
      ],
      cafe,
      PAPANDUVA,
    );
    expect(opts.map((o) => o.place.id)).toEqual(['e', 'b', 'a']);
    expect(opts[1]?.km).toBeGreaterThan(80);
    expect(opts[1]).not.toHaveProperty('minutes');
    expect(opts.every((o) => o.kind === 'food')).toBe(true);
  });

  it('o pedido: as categorias, as palavras, o círculo pelo alcance e a proximidade de onde se sai', () => {
    expect(optionsRequest(cafe, POMERODE, 30, PAPANDUVA)).toEqual({
      categories: ['catering.cafe', 'catering.restaurant'],
      names: ['colonial'],
      area: { type: 'circle', lng: -49.18, lat: -26.74, radius_m: 30_000 },
      near: { lng: -50.14, lat: -26.37 },
      limit: 20,
    });
  });

  it('a chave do cache arredonda a posição: a posição exata nunca é a chave', () => {
    const hash = (s: string) => `h${String(s.length)}`;
    const a = placesKey(optionsRequest(cafe, [-49.1771, -26.7404], 30, PAPANDUVA), hash);
    const b = placesKey(optionsRequest(cafe, [-49.1774, -26.7399], 30, PAPANDUVA), hash);
    expect(a).toBe(b);
    expect(a).not.toContain('-49.1771');
  });
});

describe('a ordem do caminho', () => {
  it('saindo de casa e voltando, a ordem mais curta (em linha reta)', () => {
    // casa em (0,0); A em (0,2), B em (1,1), C em (0,1): o melhor é C → A → B (ou o contrário)
    const order = bestOrder(
      [0, 0],
      [
        [0, 2],
        [1, 1],
        [0, 1],
      ],
    );
    expect([
      [2, 0, 1],
      [1, 0, 2],
    ]).toContainEqual(order);
    expect(bestOrder([0, 0], [[1, 1]])).toEqual([0]);
  });
});

describe('os marcos e os bustos (a medição de 16/11)', () => {
  it('o zoológico a 2 km entra na frente de vinte bustos, casas e praças mais perto; busto não é sugestão', () => {
    const ROUTE2: LngLat[] = [PAPANDUVA, POMERODE];
    const perto = Array.from({ length: 20 }, (_, i) =>
      place(`b${String(i)}`, `Busto ${String(i)}`, -49.177 + i * 0.0001, -26.74, [
        'tourism',
        'tourism.sights',
        'tourism.sights.memorial',
        'tourism.sights.memorial.monument',
      ]),
    );
    const casas = Array.from({ length: 5 }, (_, i) =>
      place(`c${String(i)}`, `Casa ${String(i)}`, -49.177, -26.7405 - i * 0.0001, [
        'tourism',
        'tourism.sights',
        'building.historic',
      ]),
    );
    const zoo = place('zoo', 'Bioparque Zoo Pomerode', -49.1745, -26.7302, [
      'entertainment',
      'entertainment.zoo',
    ]);
    const s = suggestionsFor([...perto, ...casas, zoo], ROUTE2, [], new Set());
    expect(s[0]?.place.id).toBe('zoo');
    expect(s.some((x) => x.place.id.startsWith('b'))).toBe(false);
  });
});

describe('o corredor e as sugestões', () => {
  const ROUTE: LngLat[] = [PAPANDUVA, [-49.6, -26.5], POMERODE];
  it('a linha do corredor é a rota simplificada, com a faixa de 8 km', () => {
    const area = corridorArea(ROUTE);
    expect(area).toMatchObject({ type: 'corridor', buffer_m: 8000 });
    expect(area.type === 'corridor' ? area.line.length : 0).toBeGreaterThanOrEqual(2);
  });

  it('o desvio: a distância ao traçado, ida e volta, vezes o fator de estrada', () => {
    expect(detourMinutes(0)).toBe(5);
    expect(detourMinutes(3_000)).toBe(10);
  });

  it('pelo desvio e pelo gosto, sem o que foi escolhido, dois por tipo, até seis, nada longe demais', () => {
    const zoo = place('zoo', 'Bioparque Zoo Pomerode', -49.175, -26.735, ['entertainment.zoo']);
    const museus = [1, 2, 3].map((i) =>
      place(`m${String(i)}`, `Museu ${String(i)}`, -49.6, -26.5 + i * 0.001, [
        'entertainment.museum',
      ]),
    );
    const vinicola = place('v', 'Vinícola', -49.6, -26.49, ['production.winery']);
    const longe = place('x', 'Longe', -48.8, -26.0, ['tourism.attraction']);
    const escolhido = place('t', 'Torten', -49.172, -26.74);
    const s = suggestionsFor(
      [zoo, ...museus, vinicola, longe, escolhido],
      ROUTE,
      [escolhido],
      new Set(['production.winery']),
    );
    expect(s.map((x) => x.place.id)).not.toContain('t');
    expect(s.map((x) => x.place.id)).not.toContain('x');
    expect(s.filter((x) => x.kind === 'city')).toHaveLength(2);
    expect(s.length).toBeLessThanOrEqual(6);
    // o que a pessoa gosta vale como um marco: a vinícola entra junto com os museus
    expect(s.map((x) => x.place.id)).toContain('v');
    expect(s.find((x) => x.place.id === 'zoo')?.fraction).toBeGreaterThan(0.9);
  });
});

describe('placesKey: a busca por texto no Google (fase 27)', () => {
  const hash = (s: string) => s;
  it('a chave pelas palavras e pelo círculo arredondado; outro texto ou outro tipo é outra chave', () => {
    const base = {
      provider: 'google' as const,
      query: 'Café em Canoinhas',
      bias: { lng: -50.3901, lat: -26.1799, radius_m: 15_000 },
    };
    const a = placesKey(base, hash);
    const b = placesKey(
      { ...base, query: 'café em canoinhas', bias: { ...base.bias, lng: -50.3904 } },
      hash,
    );
    expect(a).toBe(b);
    expect(a).toMatch(/^google\|cafe em canoinhas\|c:-50\.39,-26\.18,15\|-\|-\|0\|relevance\|20$/);
    expect(placesKey({ ...base, type: 'cafe' }, hash)).not.toBe(a);
    expect(placesKey({ ...base, query: 'padaria em Canoinhas' }, hash)).not.toBe(a);
    expect(placesKey({ ...base, bias: null }, hash)).toContain('|-|');
    // a busca por tipo de antes continua com a chave de antes
    expect(
      placesKey(
        {
          categories: ['catering.cafe'],
          area: { type: 'circle', lng: -50.39, lat: -26.18, radius_m: 30_000 },
        },
        hash,
      ),
    ).toMatch(/^places\|/);
  });
});
