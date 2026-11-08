import { describe, expect, it } from 'vitest';
import type { ReverseRow } from '@/lib/geocode/nominatim.ts';
import { metersAt } from './__fixtures__/tracks.ts';
import {
  kindFromOsm,
  NAME_MAX,
  placeFromReverse,
  provisionalName,
  type AutoPlace,
} from './auto-place.ts';

/**
 * O lugar da parada automática a partir de respostas forjadas do Nominatim (`/reverse`, `jsonv2`):
 * a tabela de classe para tipo, o nome pelo endereço quando não há lugar a 60 m, e o nome pela hora
 * quando não há nada.
 */
const [lng, lat] = metersAt(5100, 80);
const center = { lng, lat };
const at = (x: number, y: number) => {
  const [lo, la] = metersAt(x, y);
  return { lat: String(la), lon: String(lo) };
};

function row(over: Partial<ReverseRow>): ReverseRow {
  return {
    ...at(5110, 85),
    display_name: 'Posto da Serra, Rodovia BR-116, Serra Alta, RS, Brasil',
    address: { road: 'Rodovia Régis Bittencourt', town: 'Serra Alta', state: 'RS' },
    namedetails: null,
    ...over,
  };
}

describe('a classe do OSM vira o tipo da parada', () => {
  it.each([
    ['amenity', 'fuel', 'fuel'],
    ['amenity', 'restaurant', 'food'],
    ['amenity', 'cafe', 'food'],
    ['amenity', 'fast_food', 'food'],
    ['amenity', 'food_court', 'food'],
    ['amenity', 'ice_cream', 'food'],
    ['shop', 'bakery', 'food'],
    ['tourism', 'hotel', 'hotel'],
    ['tourism', 'motel', 'hotel'],
    ['tourism', 'guest_house', 'hotel'],
    ['tourism', 'hostel', 'hotel'],
    ['tourism', 'viewpoint', 'nature'],
    ['natural', 'peak', 'nature'],
    ['natural', 'beach', 'nature'],
    ['leisure', 'park', 'nature'],
    ['leisure', 'nature_reserve', 'nature'],
    ['waterway', 'waterfall', 'nature'],
    ['boundary', 'protected_area', 'nature'],
    ['craft', 'winery', 'winery'],
    ['landuse', 'vineyard', 'winery'],
    // compras não é tipo: a loja vira Outro, com o nome do OSM
    ['shop', 'supermarket', 'other'],
    ['shop', 'wine', 'other'],
    ['amenity', 'bank', 'other'],
    ['amenity', 'toilets', 'other'],
    [undefined, undefined, 'other'],
  ] as const)('%s=%s → %s', (category, type, kind) => {
    expect(kindFromOsm(category, type)).toBe(kind);
  });
});

describe('o nome da parada', () => {
  it('o posto com nome a até 60 m: o nome e o tipo dele, com o endereço do OSM', () => {
    const place = placeFromReverse(
      row({ category: 'amenity', type: 'fuel', name: 'Posto da Serra' }),
      center,
    );
    expect(place).toEqual<AutoPlace>({
      name: 'Posto da Serra',
      kind: 'fuel',
      address: 'Posto da Serra, Rodovia BR-116, Serra Alta, RS, Brasil',
    });
  });

  it('o lugar com nome a mais de 60 m é o vizinho: a parada se chama pela via e pela cidade', () => {
    const place = placeFromReverse(
      row({ category: 'amenity', type: 'restaurant', name: 'Cantina Longe', ...at(5300, 80) }),
      center,
    );
    expect(place).toEqual<AutoPlace>({
      name: 'Parada na Rodovia Régis Bittencourt, Serra Alta',
      kind: 'other',
      address: 'Posto da Serra, Rodovia BR-116, Serra Alta, RS, Brasil',
    });
  });

  it('na estrada, sem lugar: o número da rodovia, sem quilômetro (o OSM não dá, e não se inventa)', () => {
    const place = placeFromReverse(
      row({
        category: 'highway',
        type: 'trunk',
        name: 'Rodovia Régis Bittencourt',
        namedetails: { name: 'Rodovia Régis Bittencourt', ref: 'BR-116;BR-376' },
      }),
      center,
    );
    expect(place?.name).toBe('Parada na BR-116, Serra Alta');
    expect(place?.name).not.toMatch(/km/);
    expect(place?.kind).toBe('other');
  });

  it('na rua da cidade, e no largo (a preposição da via)', () => {
    const rua = placeFromReverse(
      row({
        category: 'building',
        type: 'yes',
        address: { road: 'Rua das Flores', city: 'Vale Verde' },
      }),
      center,
    );
    expect(rua?.name).toBe('Parada na Rua das Flores, Vale Verde');
    const largo = placeFromReverse(
      row({ category: 'place', type: 'square', address: { road: 'Largo da Matriz' } }),
      center,
    );
    expect(largo?.name).toBe('Parada no Largo da Matriz');
  });

  it('só a cidade, e nada', () => {
    expect(
      placeFromReverse(
        row({ category: 'place', type: 'village', address: { village: 'Linha Bonita' } }),
        center,
      )?.name,
    ).toBe('Parada em Linha Bonita');
    expect(
      placeFromReverse(row({ category: 'place', type: 'locality', address: {} }), center),
    ).toBeNull();
    expect(placeFromReverse(null, center)).toBeNull();
  });

  it('a cidade e o limite não são lugar de parar, mesmo com nome e perto', () => {
    const place = placeFromReverse(
      row({ category: 'place', type: 'town', name: 'Serra Alta', address: { town: 'Serra Alta' } }),
      center,
    );
    expect(place?.name).toBe('Parada em Serra Alta');
    expect(place?.kind).toBe('other');
  });

  it('um nome comprido do OSM cabe no limite do banco', () => {
    const long = 'Auto Posto Ipiranga Rodovia Presidente Dutra km 180 '.repeat(4);
    const place = placeFromReverse(row({ category: 'amenity', type: 'fuel', name: long }), center);
    expect(place?.name.length).toBeLessThanOrEqual(NAME_MAX);
    expect(place?.name.endsWith('…')).toBe(true);
  });

  it('sem o OSM, pela hora medida da chegada, no fuso da viagem', () => {
    expect(provisionalName(Date.parse('2026-12-12T17:20:40Z'))).toBe('Parada às 14h20');
    expect(provisionalName(Date.parse('2026-12-12T11:05:00Z'))).toBe('Parada às 08h05');
  });
});
