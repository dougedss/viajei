import { describe, expect, it } from 'vitest';
import {
  cityCenterOf,
  classifyHits,
  confirmNamed,
  distinctive,
  matchHits,
  namedQueries,
  nameScore,
  type SearchResult,
} from './named.ts';

// os resultados do Nominatim de 15/11 (a prova por curl da memória do defeito)
const BIOPARQUE: SearchResult = {
  name: 'Bioparque Zoo Pomerode',
  address: 'Bioparque Zoo Pomerode, Rua Hermann Weege, Pomerode, Santa Catarina, Brasil',
  lat: -26.7302,
  lng: -49.1745,
  category: 'tourism',
  type: 'zoo',
};
const BRINQUEDO: SearchResult = {
  name: 'Museu do Brinquedo',
  address: 'Museu do Brinquedo, Pomerode, Santa Catarina, Brasil',
  lat: -26.74,
  lng: -49.18,
  category: 'tourism',
  type: 'museum',
};
const CENTRO: SearchResult = {
  name: 'Pomerode',
  address: 'Pomerode, Região Geográfica Imediata de Blumenau, Santa Catarina, Brasil',
  lat: -26.7405,
  lng: -49.1765,
  category: 'boundary',
  type: 'administrative',
};

describe('o lugar nomeado (fase 24)', () => {
  it('a segunda tentativa: as palavras que distinguem com a cidade, sem preposição e sem repetir', () => {
    expect(namedQueries({ name: 'Zoológico de Pomerode', city: 'Pomerode' })).toEqual([
      'Zoológico de Pomerode',
      'zoologico pomerode',
    ]);
    expect(namedQueries({ name: 'Torten Paradies', city: 'Pomerode' })).toEqual([
      'Torten Paradies, Pomerode',
      'torten paradies pomerode',
    ]);
    expect(namedQueries({ name: 'Zoo Pomerode', city: null })).toEqual(['Zoo Pomerode']);
  });

  it('a cidade fora da conta: "Museu Pomerode" não casa com o Museu do Brinquedo', () => {
    expect(nameScore('Museu Pomerode', 'Museu do Brinquedo', 'Pomerode')).toBe(0);
    expect(distinctive('Museu Pomerode', 'Pomerode')).toEqual([]);
    expect(nameScore('Zoológico de Pomerode', 'Bioparque Zoo Pomerode', 'Pomerode')).toBe(1);
  });

  it('as classes que faltavam: o zoológico é natureza; o nome exato vale em qualquer classe', () => {
    expect(
      matchHits({ name: 'Zoológico de Pomerode', city: 'Pomerode', kind: 'nature' }, [BIOPARQUE]),
    ).toHaveLength(1);
    expect(
      matchHits({ name: 'Bioparque Zoo Pomerode', city: null, kind: 'food' }, [BIOPARQUE]),
    ).toHaveLength(1);
  });

  it('"centro de Pomerode" é o centro da cidade', async () => {
    expect(cityCenterOf({ name: 'Centro de Pomerode', city: null })).toBe('pomerode');
    expect(cityCenterOf({ name: 'Centro Histórico de Blumenau', city: 'Blumenau' })).toBe(
      'Blumenau',
    );
    const state = await confirmNamed(
      { name: 'Centro de Pomerode', city: 'Pomerode', kind: 'city' },
      () => Promise.resolve([CENTRO]),
    );
    expect(state).toMatchObject({ kind: 'found', hit: { name: 'Pomerode' } });
  });

  it('a primeira busca não acha, a segunda acha (o defeito de 15/11)', async () => {
    const asked: string[] = [];
    const state = await confirmNamed(
      { name: 'Zoológico de Pomerode', city: 'Pomerode', kind: 'nature' },
      (q) => {
        asked.push(q);
        return Promise.resolve(q === 'zoologico pomerode' ? [BIOPARQUE] : []);
      },
    );
    expect(asked).toEqual(['Zoológico de Pomerode', 'zoologico pomerode']);
    expect(state).toEqual({
      kind: 'found',
      hit: {
        name: BIOPARQUE.name,
        address: BIOPARQUE.address,
        lat: BIOPARQUE.lat,
        lng: BIOPARQUE.lng,
      },
    });
  });

  it('dois candidatos longe um do outro: a escolha, nunca o chute', () => {
    const other = { ...BIOPARQUE, lat: -27.5, lng: -48.5, address: 'Bioparque, Florianópolis' };
    expect(classifyHits([BIOPARQUE, other])).toMatchObject({ kind: 'choice' });
    expect(classifyHits([BIOPARQUE, { ...BIOPARQUE, lat: -26.731 }])).toMatchObject({
      kind: 'found',
    });
  });

  it('um tipo numa cidade não é um nome: vira a busca das opções; o mapa fora é "offline"', async () => {
    expect(
      await confirmNamed({ name: 'Museu Pomerode', city: 'Pomerode', kind: 'city' }, () =>
        Promise.resolve([BRINQUEDO]),
      ),
    ).toEqual({ kind: 'type' });
    expect(
      await confirmNamed({ name: 'Torten Paradies', city: 'Pomerode', kind: 'food' }, () =>
        Promise.reject(new Error('Nominatim 503')),
      ),
    ).toEqual({ kind: 'offline' });
    expect(
      await confirmNamed({ name: 'Café Frohsinn', city: 'Pomerode', kind: 'food' }, () =>
        Promise.resolve([]),
      ),
    ).toEqual({ kind: 'none' });
  });
});
