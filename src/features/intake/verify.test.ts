import { describe, expect, it } from 'vitest';
import type { ImportData, ImportStop } from '@shared/import-schema.ts';
import type { OsmElement } from '@/lib/geocode/overpass.ts';
import {
  accentless,
  checkPlaces,
  distinctive,
  matchElement,
  matchResult,
  nameScore,
  overpassQuery,
  regionCity,
  type CheckDeps,
} from './verify.ts';

const stop = (
  kind: ImportStop['kind'],
  name: string,
  address: string | null = null,
): ImportStop => ({
  time: null,
  kind,
  name,
  address,
  closes_at: null,
  travel_minutes_to_next: null,
  notes: null,
  url: null,
  lat: null,
  lng: null,
});
const data = (stops: ImportStop[]): ImportData => ({
  days: [{ date: '2026-11-15', title: null, stops }],
  reservations: [],
  contacts: [],
  checklist_before: [],
  checklist_pack: [],
  quests: [
    { text: 'Foto do time com a cascata', stop_ref: 'Cascata do Caracol' },
    { text: 'Registrar o rótulo preferido', stop_ref: 'Vinícola Inventada' },
  ],
  unclassified: [],
});
const el = (id: number, tags: Record<string, string>, lat = -29.31, lng = -50.85): OsmElement => ({
  type: 'node',
  id,
  lat,
  lng,
  tags,
});
const CANELA = { lat: -29.36, lng: -50.81 };
const region = { center: CANELA, radiusKm: 60 };

const PROPOSTA = data([
  stop('origin', 'Saída de Canela', 'Canela, RS'),
  stop('nature', 'Cascata do Caracol', 'Canela, RS'),
  stop('nature', 'Lago Negro', 'Gramado, RS'),
  stop('winery', 'Vinícola Inventada', 'Canela, RS'),
  stop('food', 'Restaurante Garibaldi', 'Gramado, RS'),
]);

const MAPA = [
  el(1, { name: 'Parque Estadual do Caracol', tourism: 'attraction' }, -29.312, -50.852),
  // o mesmo nome num restaurante: não é a cascata
  el(2, { name: 'Restaurante Caracol', amenity: 'restaurant' }, -29.35, -50.8),
  el(3, { name: 'Lago Negro', natural: 'water', water: 'lake' }, -29.395, -50.876),
];
const GARIBALDI = {
  name: 'Garibaldi',
  address: 'Restaurante Garibaldi, Gramado, RS',
  lat: -29.38,
  lng: -50.87,
  category: 'amenity',
  type: 'restaurant',
};

function deps(over: Partial<CheckDeps> = {}) {
  const asked: string[] = [];
  const queries: string[] = [];
  const d: CheckDeps = {
    overpass: (q) => {
      queries.push(q);
      return Promise.resolve(MAPA);
    },
    search: (q) => {
      asked.push(q);
      return Promise.resolve(/garibaldi/i.test(q) ? [GARIBALDI] : []);
    },
    ...over,
  };
  return { d, asked, queries };
}

/** Um Overpass que só responde quando o teste manda, e que o corte da conferência rejeita. */
function heldOverpass() {
  const held: { answer: (els: OsmElement[]) => void; signal: AbortSignal | null } = {
    answer: () => undefined,
    signal: null,
  };
  const overpass: CheckDeps['overpass'] = (_q, signal) =>
    new Promise((resolve, reject) => {
      held.answer = resolve;
      held.signal = signal;
      signal.addEventListener('abort', () => reject(new DOMException('cortado', 'AbortError')));
    });
  return { held, overpass };
}

describe('a conferência dos lugares no OSM', () => {
  it('o Overpass responde com a fila andando: o que ele achou não vai ao Nominatim; o que não existe sai', async () => {
    const { d, asked, queries } = deps();
    const check = await checkPlaces(PROPOSTA, region, d);
    const stops = check.data.days[0]?.stops ?? [];
    expect(stops.map((s) => [s.name, s.lat])).toEqual([
      ['Saída de Canela', null],
      ['Cascata do Caracol', -29.312],
      ['Lago Negro', -29.395],
      ['Restaurante Garibaldi', -29.38],
    ]);
    expect(check).toMatchObject({
      confirmed: 3,
      removed: ['Vinícola Inventada'],
      unchecked: [],
      overpass: 'ok',
    });
    // uma consulta ao Overpass na conversa inteira; a primeira busca sai antes de ele responder, e
    // o lago, que ele achou, não vai ao Nominatim
    expect(queries).toHaveLength(1);
    expect(asked).toEqual([
      'Cascata do Caracol, Canela, RS',
      'Vinícola Inventada, Canela, RS',
      'Restaurante Garibaldi, Gramado, RS',
    ]);
    // a missão do lugar que saiu sai junto
    expect(check.data.quests.map((q) => q.stop_ref)).toEqual(['Cascata do Caracol']);
  });

  it('o Overpass pendurado não segura nada: com tudo confirmado pelo Nominatim, a consulta é cortada', async () => {
    const { held, overpass } = heldOverpass();
    const tudo = data([stop('food', 'Restaurante Garibaldi', 'Gramado, RS')]);
    const check = await checkPlaces(tudo, region, deps({ overpass }).d);
    expect(held.signal?.aborted).toBe(true);
    expect(check).toMatchObject({ confirmed: 1, removed: [], overpass: 'skipped' });
  });

  it('faltando lugar, o Overpass é esperado, e o que ele acha depois da fila ainda se confirma', async () => {
    const { held, overpass } = heldOverpass();
    const asked: string[] = [];
    const search: CheckDeps['search'] = (q) => {
      asked.push(q);
      return Promise.resolve([]);
    };
    const running = checkPlaces(PROPOSTA, region, deps({ overpass, search }).d);
    // a fila do Nominatim acaba sem achar nada; só então o Overpass responde
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toHaveLength(4);
    held.answer(MAPA);
    const check = await running;
    expect(held.signal?.aborted).toBe(false);
    expect(check).toMatchObject({
      confirmed: 2,
      removed: ['Vinícola Inventada', 'Restaurante Garibaldi'],
      overpass: 'ok',
    });
  });

  it('com o Overpass fora, o Nominatim confere cada um', async () => {
    const { d, asked } = deps({ overpass: () => Promise.reject(new Error('Overpass 502')) });
    const check = await checkPlaces(PROPOSTA, region, d);
    expect(check.overpass).toBe('failed');
    expect(asked).toHaveLength(4);
    expect(check.removed).toEqual(['Cascata do Caracol', 'Lago Negro', 'Vinícola Inventada']);
    expect(check.confirmed).toBe(1);
  });

  it('com o Nominatim fora, o que faltava fica sem conferir (e sai: nunca inventar)', async () => {
    const { d } = deps({ search: () => Promise.reject(new TypeError('Failed to fetch')) });
    const check = await checkPlaces(PROPOSTA, region, d);
    // o que o Overpass achou se confirma, mesmo que a busca dele no Nominatim tenha falhado
    expect(check.confirmed).toBe(2);
    expect(check.unchecked).toEqual(['Vinícola Inventada', 'Restaurante Garibaldi']);
    expect(check.removed).toEqual([]);
    expect(check.data.days[0]?.stops.map((s) => s.name)).toEqual([
      'Saída de Canela',
      'Cascata do Caracol',
      'Lago Negro',
    ]);
  });

  it('sem centro, o Overpass nem é perguntado', async () => {
    const { d, queries } = deps();
    const check = await checkPlaces(PROPOSTA, { center: null, radiusKm: 60 }, d);
    expect(queries).toEqual([]);
    expect(check.overpass).toBe('skipped');
  });

  it('o progresso conta cada lugar proposto, achado por um ou pelo outro', async () => {
    const seen: [number, number][] = [];
    const { d } = deps();
    await checkPlaces(PROPOSTA, region, { ...d, onProgress: (a, b) => seen.push([a, b]) });
    expect(seen.at(0)).toEqual([0, 4]);
    expect(seen.at(-1)).toEqual([4, 4]);
    // nunca volta nem passa do total
    expect(seen.every(([a], i) => a <= 4 && (i === 0 || a >= (seen[i - 1]?.[0] ?? 0)))).toBe(true);
  });
});

describe('os nomes e a consulta', () => {
  it('as palavras que distinguem, sem acento e sem o tipo do lugar', () => {
    expect(distinctive('Cascata do Caracol')).toEqual(['caracol']);
    expect(distinctive('Vinícola Dom Cândido')).toEqual(['dom', 'candido']);
    expect(distinctive('Mirante')).toEqual([]);
  });

  it('a cobertura do nome do mapa', () => {
    expect(nameScore('Cascata do Caracol', 'Parque Estadual do Caracol')).toBe(1);
    expect(nameScore('Vinícola Dom Cândido', 'Dom Candido Vinhos')).toBe(1);
    expect(nameScore('Casa Valduga', 'Vinícola Miolo')).toBe(0);
    expect(nameScore('Mirante', 'Mirante')).toBe(0);
  });

  it('o tipo confere: o restaurante do mesmo nome não é a cascata', () => {
    const els = [el(2, { name: 'Restaurante Caracol', amenity: 'restaurant' })];
    expect(matchElement(stop('nature', 'Cascata do Caracol'), els, CANELA)).toBeNull();
    expect(matchElement(stop('food', 'Restaurante Caracol'), els, CANELA)?.id).toBe(2);
  });

  it('o lago: no Overpass é natural=water, no Nominatim a classe é water (o Lago Negro)', () => {
    const lago = stop('nature', 'Lago Negro', 'Gramado, RS');
    // a resposta do `/search` de verdade, em 15/11/2026, para "lago negro, gramado, rs"
    const nominatim = {
      name: 'Lago Negro',
      address: 'Lago Negro, Ipê Amarelo, Gramado, Rio Grande do Sul',
      lat: -29.395,
      lng: -50.876,
      category: 'water',
      type: 'lake',
    };
    expect(matchResult(lago, [nominatim])?.lat).toBe(-29.395);
    const els = [el(3, { name: 'Lago Negro', natural: 'water', water: 'lake' })];
    expect(matchElement(lago, els, CANELA)?.id).toBe(3);
    // o tipo continua conferindo: o restaurante do lago não é o lago
    expect(
      matchResult(lago, [{ ...nominatim, category: 'amenity', type: 'restaurant' }]),
    ).toBeNull();
  });

  it('a consulta: uma expressão sem acento, as classes dos tipos, em volta do centro', () => {
    const q = overpassQuery(
      [stop('nature', 'Cascata do Caracol'), stop('fuel', 'Posto Buffon')],
      CANELA,
      60,
    );
    expect(q).toContain('[out:json][timeout:20];');
    expect(q).toContain(`${accentless('buffon')}|${accentless('caracol')}`);
    expect(q).toContain('["waterway"~"^(waterfall)$"]');
    expect(q).toContain('["amenity"~"^(fuel)$"]');
    expect(q).toContain('(around:60000,-29.36000,-50.81000);');
    expect(q).toContain('out center tags 400;');
    expect(accentless('cao')).toBe('(c|ç)(a|á|à|â|ã)(o|ó|ô|õ)');
    expect(overpassQuery([stop('nature', 'Mirante')], CANELA, 60)).toBeNull();
  });

  it('a cidade da região: a que mais aparece nas paradas propostas', () => {
    expect(regionCity(PROPOSTA)).toBe('Canela, RS');
  });
});
