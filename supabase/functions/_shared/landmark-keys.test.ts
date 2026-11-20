import { describe, expect, it } from 'vitest';
import { cityPlaceKey, PLACE_KEY_RE, slugOf, stopPlaceKey } from './landmark-keys.ts';

describe('as chaves dos lugares no catálogo', () => {
  it('a parada com o objeto do OSM usa o objeto', () => {
    expect(
      stopPlaceKey({
        name: 'Jardim Botânico',
        lat: -25.4428,
        lng: -49.2392,
        osm_type: 'way',
        osm_id: 607776738,
      }),
    ).toBe('osm:w607776738');
    expect(stopPlaceKey({ name: 'x', lat: null, lng: null, osm_type: 'node', osm_id: 12 })).toBe(
      'osm:n12',
    );
  });

  it('sem o objeto, o nome e a coordenada a três casas (duas marcações do mesmo lugar caem juntas)', () => {
    expect(
      stopPlaceKey({ name: 'Jardim Botânico de Curitiba', lat: -25.44281, lng: -49.23917 }),
    ).toBe('geo:jardim-botanico-de-curitiba@-25.443,-49.239');
    expect(
      stopPlaceKey({ name: 'Jardim Botânico de Curitiba', lat: -25.4429, lng: -49.2393 }),
    ).toBe('geo:jardim-botanico-de-curitiba@-25.443,-49.239');
  });

  it('sem coordenada, ou sem um nome que vire chave, nada (a miniatura do tipo)', () => {
    expect(stopPlaceKey({ name: 'Parque', lat: null, lng: null })).toBeNull();
    expect(stopPlaceKey({ name: '???', lat: -25.4, lng: -49.2 })).toBeNull();
    expect(stopPlaceKey({ name: 'x', lat: Number.NaN, lng: -49.2 })).toBeNull();
  });

  it('a cidade pela UF e pelo nome; toda chave passa na expressão do banco', () => {
    expect(cityPlaceKey('PR', 'Ponta Grossa')).toBe('city:PR:ponta-grossa');
    expect(cityPlaceKey('SC', "Herval d'Oeste")).toBe('city:SC:herval-d-oeste');
    for (const k of ['osm:w607776738', 'geo:a@-25.443,-49.239', 'city:PR:ponta-grossa']) {
      expect(PLACE_KEY_RE.test(k)).toBe(true);
    }
    expect(PLACE_KEY_RE.test('geo:a@-25.44,-49.239')).toBe(false);
  });

  it('o slug tira acento, corta em 80 e nunca termina em hífen', () => {
    expect(slugOf('São José dos Pinhais!')).toBe('sao-jose-dos-pinhais');
    expect(slugOf('a'.repeat(79) + ' b')).toBe('a'.repeat(79));
    expect(slugOf('a'.repeat(79) + ' b').length).toBeLessThanOrEqual(80);
  });
});
