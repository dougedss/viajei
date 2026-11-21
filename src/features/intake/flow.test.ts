import { describe, expect, it } from 'vitest';
import type { Place, PlacesRequest } from '@shared/places-schema.ts';
import { EMPTY_INTENT, type PlanIntent } from '@shared/plan-protocol.ts';
import {
  answersByTopic,
  canBuild,
  missingNamed,
  pickNamed,
  picksOf,
  prepare,
  searchMap,
  toggleChoice,
  type FlowDeps,
  type SearchInput,
} from './flow.ts';
import type { SearchResult } from './named.ts';

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
const TORTEN = place('torten', 'Torten Paradies Café Colonial', -49.172, -26.74);
const MAHLZEIT = place('mahlzeit', 'Mahlzeit Café Colonial', -49.18, -26.73);
const ZOO = place('zoo', 'Bioparque Zoo Pomerode', -49.175, -26.73, ['entertainment.zoo']);
const PAPANDUVA: SearchResult = {
  name: 'Papanduva',
  address: 'Papanduva, SC',
  lat: -26.37,
  lng: -50.144,
  category: 'place',
  type: 'town',
};
const POMERODE: SearchResult = {
  name: 'Pomerode',
  address: 'Pomerode, SC',
  lat: -26.74,
  lng: -49.177,
  category: 'place',
  type: 'town',
};
const BIOPARQUE: SearchResult = {
  name: 'Bioparque Zoo Pomerode',
  address: 'Bioparque Zoo Pomerode, Pomerode, SC',
  lat: -26.7302,
  lng: -49.1745,
  category: 'tourism',
  type: 'zoo',
};

function deps(over: Partial<FlowDeps> = {}) {
  const requests: PlacesRequest[] = [];
  const queries: string[] = [];
  const d: FlowDeps = {
    findPlaces: (r) => {
      requests.push(r);
      // as buscas das opções (cafés e restaurantes); as das sugestões (os marcos e o clássico)
      if (r.categories.includes('catering.cafe')) return Promise.resolve([TORTEN, MAHLZEIT]);
      return Promise.resolve([ZOO, TORTEN]);
    },
    geocode: (q) =>
      Promise.resolve(/papanduva/i.test(q) ? [PAPANDUVA] : /pomerode/i.test(q) ? [POMERODE] : []),
    searchNear: (q) => {
      queries.push(q);
      return Promise.resolve(q === 'zoologico pomerode' ? [BIOPARQUE] : []);
    },
    route: (w) =>
      Promise.resolve({
        geometry: w,
        legs: w.slice(1).map(() => ({ distance_m: 140_000, duration_s: 7_500 })),
      }),
    ...over,
  };
  return { d, requests, queries };
}
const intent = (over: Partial<PlanIntent> = {}): PlanIntent => ({
  ...EMPTY_INTENT,
  wants: [{ words: 'café colonial', kind: 'food' }],
  ...over,
});
const input = (over: Partial<SearchInput> = {}): SearchInput => ({
  kind: 'plan',
  text: 'um café colonial em Pomerode, saindo de Papanduva',
  intent: intent({ area: 'Pomerode', origin: 'Papanduva, SC' }),
  questions: [],
  answers: [],
  context: { origin: null, position: null, place: null },
  center: null,
  ...over,
});

describe('a conversa nova: as opções do mapa (fase 24)', () => {
  it('"café colonial em Pomerode, saindo de Papanduva": as opções ao redor de Pomerode, medidas de Papanduva', async () => {
    const { d, requests } = deps();
    const stage = await searchMap(input(), d);
    expect(stage.origin).toEqual({ label: 'Papanduva, SC', at: [-50.144, -26.37] });
    expect(stage.groups).toHaveLength(1);
    const g = stage.groups[0];
    expect(g?.status).toBe('ok');
    // os mais perto de Pomerode primeiro (a área pedida), com o tempo de carro de Papanduva
    expect(g?.options.map((o) => o.place.name)).toEqual([
      'Torten Paradies Café Colonial',
      'Mahlzeit Café Colonial',
    ]);
    expect(g?.options[0]?.minutes).toBeGreaterThan(100);
    expect(requests[0]).toMatchObject({
      categories: ['catering.cafe', 'catering.restaurant'],
      names: ['colonial'],
      area: { type: 'circle', lng: -49.18, lat: -26.74, radius_m: 30_000 },
      near: { lng: -49.18, lat: -26.74 },
    });
    // e a busca pela cozinha: os cafés, sem nome, no mesmo círculo
    expect(requests[1]).toMatchObject({ categories: ['catering.cafe'], names: [] });
  });

  it('sem área: em volta de onde se sai, pelo alcance que a resposta deu', async () => {
    const { d, requests } = deps();
    await searchMap(
      input({
        intent: intent(),
        context: { origin: 'Papanduva, SC', position: null, place: null },
        questions: [
          { text: 'Até quanto tempo de carro?', options: ['1 hora', '2 horas'], topic: 'reach' },
        ],
        answers: ['2 horas'],
      }),
      d,
    );
    const area = requests[0]?.area;
    expect(area?.type === 'circle' ? [area.lng, area.lat] : null).toEqual([-50.14, -26.37]);
    expect(area?.type === 'circle' ? area.radius_m : 0).toBeGreaterThan(90_000);
  });

  it('o nomeado se confirma pela segunda tentativa; "Museu Pomerode" vira uma busca por tipo', async () => {
    const { d, queries } = deps();
    const stage = await searchMap(
      input({
        intent: intent({
          area: 'Pomerode',
          origin: 'Papanduva, SC',
          named: [
            { name: 'Zoológico de Pomerode', city: 'Pomerode', kind: 'nature' },
            { name: 'Museu Pomerode', city: 'Pomerode', kind: 'city' },
          ],
        }),
      }),
      d,
    );
    expect(queries).toEqual(['Zoológico de Pomerode', 'zoologico pomerode']);
    expect(stage.named).toHaveLength(1);
    expect(stage.named[0]).toMatchObject({ state: { kind: 'found' }, pick: 0 });
    expect(stage.groups.map((g) => g.label)).toEqual(['café colonial', 'museu']);
  });

  it('a função sem chave: a busca diz no_source, e a tela oferece a busca por nome', async () => {
    const { d } = deps({
      findPlaces: () => Promise.reject(Object.assign(new Error('x'), { code: 'no_source' })),
    });
    const stage = await searchMap(input(), d);
    expect(stage.groups[0]?.status).toBe('no_source');
  });

  it('com a posição permitida, a origem é onde a pessoa está, também numa viagem (fase 25, D271)', async () => {
    const { d, requests } = deps();
    const stage = await searchMap(
      input({
        intent: intent(),
        context: {
          origin: 'Major Vieira, SC',
          position: { lat: -26.37, lng: -50.33 },
          place: 'Major Vieira, SC',
        },
        center: { lat: -26.3712, lng: -50.3268 },
        questions: [
          { text: 'Até quanto tempo de carro?', options: ['1 hora', '2 horas'], topic: 'reach' },
        ],
        answers: ['2 horas'],
      }),
      d,
    );
    expect(stage.origin).toEqual({ label: 'Major Vieira, SC', at: [-50.3268, -26.3712] });
    // a busca em volta de onde ela está (arredondada a uns 1 km), não da viagem de dezembro
    expect(requests[0]?.area).toMatchObject({ type: 'circle', lng: -50.33, lat: -26.37 });
  });

  it('a origem dita no pedido, ou escrita no "mudar", vale acima da posição', async () => {
    const { d } = deps();
    const withPosition = {
      context: {
        origin: 'Major Vieira, SC',
        position: { lat: -26.37, lng: -50.33 },
        place: 'Major Vieira, SC',
      },
      center: { lat: -26.3712, lng: -50.3268 },
    };
    const said = await searchMap(
      input({ ...withPosition, intent: intent({ area: 'Pomerode', origin: 'Papanduva, SC' }) }),
      d,
    );
    expect(said.origin).toEqual({ label: 'Papanduva, SC', at: [-50.144, -26.37] });
    const changed = await searchMap(
      input({ ...withPosition, intent: intent({ area: 'Pomerode' }), originOverride: 'Papanduva' }),
      d,
    );
    expect(changed.origin).toEqual({ label: 'Papanduva', at: [-50.144, -26.37] });
  });

  it('sem origem, sem área e sem posição: não há onde procurar', async () => {
    const { d } = deps();
    const stage = await searchMap(input({ intent: intent() }), d);
    expect(stage.nowhere).toBe(true);
  });

  it('as respostas pelo assunto; as perguntas do app da saída de hoje também', () => {
    expect(
      answersByTopic(
        [
          { text: 'Quanto tempo vocês têm?', options: [] },
          { text: 'De onde vocês saem?', options: [] },
        ],
        ['O dia', 'Canela'],
      ),
    ).toEqual({ reach: 'O dia', origin: 'Canela' });
  });

  it('"1 hora e meia" e "1:30 no máximo" valem 1,5 h de alcance (a regra única de reach.ts)', async () => {
    for (const answer of ['1 hora e meia', '1:30 no máximo', '1h30']) {
      const { d, requests } = deps();
      await searchMap(
        input({
          intent: intent(),
          context: { origin: 'Papanduva, SC', position: null, place: null },
          questions: [
            { text: 'Até quanto tempo de carro?', options: ['1 hora', '2 horas'], topic: 'reach' },
          ],
          answers: [answer],
        }),
        d,
      );
      const area = requests[0]?.area;
      expect(area?.type === 'circle' ? area.radius_m : 0).toBe(63_000);
    }
  });
});

describe('a conversa nova: a escolha e o caminho', () => {
  it('só segue com um lugar escolhido; um nomeado com dois candidatos pede a escolha', async () => {
    const { d } = deps();
    let stage = await searchMap(input(), d);
    expect(canBuild(stage)).toBe(false);
    stage = toggleChoice(stage, 'torten');
    expect(canBuild(stage)).toBe(true);
    stage = {
      ...stage,
      named: [
        {
          named: { name: 'Bioparque', city: null, kind: 'nature' },
          state: {
            kind: 'choice',
            options: [
              { name: 'A', address: 'a', lat: 0, lng: 0 },
              { name: 'B', address: 'b', lat: 1, lng: 1 },
            ],
          },
          pick: null,
        },
      ],
    };
    expect(canBuild(stage)).toBe(false);
    expect(canBuild(pickNamed(stage, 0, 'skip'))).toBe(true);
    expect(missingNamed(pickNamed(stage, 0, 'skip'))).toEqual([
      { name: 'Bioparque', city: null, kind: 'nature' },
    ]);
    expect(picksOf(pickNamed(stage, 0, 1)).map((p) => [p.ref, p.place.name])).toEqual([
      ['n1', 'B'],
      ['e1', 'Torten Paradies Café Colonial'],
    ]);
  });

  it('a rota pelas escolhas, as sugestões no corredor e perto do destino, sem o que foi escolhido', async () => {
    const { d, requests } = deps();
    const stage = toggleChoice(await searchMap(input(), d), 'torten');
    const prepared = await prepare(stage, { interests: [], learned: [] }, d);
    expect(prepared.routed).toBe(true);
    expect(prepared.picks.map((p) => p.place.id)).toEqual(['torten']);
    expect(prepared.suggestions.map((s) => s.place.id)).toEqual(['zoo']);
    expect(prepared.chosenFractions).toEqual([0.5]);
    expect(prepared.places.chosen[0]).toMatchObject({ ref: 'e1', minutes: 125 });
    expect(prepared.places.home_minutes).toBe(125);
    // depois das duas buscas das opções, as quatro das sugestões: os marcos e o clássico, no corredor
    // e em volta do destino
    const kinds = requests.slice(2).map((r) => r.area.type);
    expect(kinds.sort()).toEqual(['circle', 'circle', 'corridor', 'corridor']);
    expect(requests.slice(2).some((r) => r.categories.includes('entertainment.zoo'))).toBe(true);
  });

  it('sem rota (a route-day não respondeu): a linha reta, e as sugestões ainda vêm', async () => {
    const { d } = deps({ route: () => Promise.resolve(null) });
    const stage = toggleChoice(await searchMap(input(), d), 'torten');
    const prepared = await prepare(stage, { interests: [], learned: [] }, d);
    expect(prepared.routed).toBe(false);
    expect(prepared.legs).toBeNull();
    expect(prepared.places.chosen[0]?.minutes).toBeNull();
    expect(prepared.suggestions.length).toBeGreaterThan(0);
  });
});
