import { describe, expect, it } from 'vitest';
import type { Place, PlacesRequest } from '@shared/places-schema.ts';
import { EMPTY_INTENT, type PlanIntent } from '@shared/plan-protocol.ts';
import {
  addNamed,
  answersByTopic,
  canBuild,
  pendingForAi,
  pendingOf,
  pickNamed,
  picksOf,
  prepare,
  removeWant,
  searchMap,
  summaryOf,
  toggleChoice,
  type FlowDeps,
  type GeoBias,
  type NamedEntry,
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
const MAFRA_PT: SearchResult = {
  name: 'Mafra',
  address: 'Mafra, Lisboa, Portugal',
  lat: 38.9369,
  lng: -9.3312,
  category: 'place',
  type: 'town',
};
const MAFRA_SC: SearchResult = {
  name: 'Mafra',
  address: 'Mafra, Santa Catarina, Brasil',
  lat: -26.1116,
  lng: -49.8054,
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

  it('a cidade dita vai ao geocodificador com o viés da origem; "mafra" com Portugal em 1º vira Mafra/SC, sem pergunta (fase 25, D276)', async () => {
    const biases: (GeoBias | undefined)[] = [];
    const { d, requests } = deps({
      geocode: (q, bias) => {
        biases.push(bias);
        if (/papanduva/i.test(q)) return Promise.resolve([PAPANDUVA]);
        if (/mafra/i.test(q)) return Promise.resolve([MAFRA_PT, MAFRA_SC]);
        return Promise.resolve([]);
      },
    });
    const stage = await searchMap(
      input({
        intent: intent({
          area: 'Mafra',
          origin: 'Papanduva, SC',
          wants: [{ words: 'almoçar', kind: 'food' }],
        }),
      }),
      d,
    );
    expect(stage.ask ?? null).toBeNull();
    expect(stage.groups[0]?.centerLabel).toBe('Mafra');
    // a busca em volta da Mafra de Santa Catarina, não da de Lisboa
    expect(requests[0]?.area).toMatchObject({ type: 'circle', lng: -49.81, lat: -26.11 });
    // a origem sem viés (não há posição); a cidade com o viés da origem resolvida, no alcance máximo
    expect(biases[0]).toBeUndefined();
    expect(biases[1]).toEqual({ near: { lat: -26.37, lng: -50.144 }, radiusKm: 400 });
  });

  it('só candidatos longe, ou dois plausíveis: a pergunta na tela antes da busca; a escolha guardada resolve', async () => {
    const { d, requests } = deps({
      geocode: (q) =>
        Promise.resolve(/papanduva/i.test(q) ? [PAPANDUVA] : /mafra/i.test(q) ? [MAFRA_PT] : []),
    });
    const base = input({ intent: intent({ area: 'Mafra', origin: 'Papanduva, SC' }) });
    const asked = await searchMap(base, d);
    expect(asked.ask).toMatchObject({ said: 'Mafra', role: 'area', far: true });
    expect(asked.ask?.options.map((o) => o.address)).toEqual(['Mafra, Lisboa, Portugal']);
    expect(asked.ask?.options[0]?.minutes).toBeGreaterThan(100 * 60);
    expect(asked.groups).toEqual([]);
    expect(requests).toHaveLength(0);
    // a pessoa escolheu: a busca roda em volta do que ela escolheu, sem perguntar de novo
    const hit = asked.ask?.options[0];
    const chosen = await searchMap({ ...base, places: hit ? { mafra: hit } : {} }, d);
    expect(chosen.ask ?? null).toBeNull();
    expect(chosen.groups[0]?.center).toEqual([-9.3312, 38.9369]);
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
    expect(pendingOf(pickNamed(stage, 0, 'skip'))).toEqual([
      { name: 'Bioparque', city: null, kind: 'nature' },
    ]);
    expect(picksOf(pickNamed(stage, 0, 1)).map((p) => [p.ref, p.place.name])).toEqual([
      ['n1', 'B'],
      ['e1', 'Torten Paradies Café Colonial'],
    ]);
  });

  it('os três estados (fase 25, D278): a vontade sem opção fica pendente, "Tirar" a tira, e o resumo diz', async () => {
    const { d } = deps({
      findPlaces: (r) =>
        // o café tem opções; a feirinha e o salão, nenhuma
        Promise.resolve(r.categories.includes('catering.cafe') ? [TORTEN, MAHLZEIT] : []),
    });
    const stage = await searchMap(
      input({
        intent: intent({
          area: 'Pomerode',
          origin: 'Papanduva, SC',
          wants: [
            { words: 'feirinha', kind: 'event' },
            { words: 'café', kind: 'food' },
            { words: 'cortar o cabelo', kind: 'other' },
          ],
        }),
      }),
      d,
    );
    expect(stage.groups.map((g) => g.status)).toEqual(['none', 'ok', 'none']);
    // nada escolhido ainda: o café é "sem escolha", os outros dois pendentes
    expect(summaryOf(stage)).toEqual({
      chosen: 0,
      unchosen: ['Café'],
      pending: ['Feirinha', 'Cortar o cabelo'],
      removed: [],
    });
    expect(pendingOf(stage)).toEqual([
      { name: 'Feirinha', city: 'Pomerode', kind: 'event' },
      { name: 'Cortar o cabelo', city: 'Pomerode', kind: 'other' },
    ]);
    // o café escolhido; o salão tirado pela pessoa
    const decided = removeWant(toggleChoice(stage, 'torten'), 2, true);
    expect(summaryOf(decided)).toEqual({
      chosen: 1,
      unchosen: [],
      pending: ['Feirinha'],
      removed: ['Cortar o cabelo'],
    });
    expect(pendingForAi(decided)).toEqual([{ name: 'Feirinha', kind: 'event', why: 'not_found' }]);
    // e o desfazer
    expect(summaryOf(removeWant(decided, 2, false)).pending).toEqual([
      'Feirinha',
      'Cortar o cabelo',
    ]);
    // o caminho leva o pendente como parada sem lugar e como dado para a IA
    const prepared = await prepare(decided, { interests: [], learned: [] }, d);
    expect(prepared.missing).toEqual([{ name: 'Feirinha', city: 'Pomerode', kind: 'event' }]);
    expect(prepared.places.pending).toEqual([
      { name: 'Feirinha', kind: 'event', why: 'not_found' },
    ]);
  });

  it('a busca pelo nome a partir do grupo sem fonte: o desfecho é o do nomeado, e o grupo não fica pendente de novo', async () => {
    const { d } = deps({
      findPlaces: () => Promise.reject(Object.assign(new Error('x'), { code: 'no_source' })),
      searchNear: () =>
        Promise.resolve([
          {
            name: 'Torten Paradies',
            address: 'Torten Paradies, Pomerode, SC',
            lat: -26.7404,
            lng: -49.1718,
            category: 'amenity',
            type: 'cafe',
          },
        ]),
    });
    const stage = await searchMap(input(), d);
    expect(summaryOf(stage).pending).toEqual(['Café colonial']);
    const found = await addNamed(stage, 'Torten Paradies', 'food', d, 0);
    expect(found.groups[0]?.byName).toBe(true);
    expect(summaryOf(found)).toMatchObject({ chosen: 1, pending: [] });
    expect(pendingOf(found)).toEqual([]);
  });

  it('o nomeado sem lugar fica pendente; "Nenhum destes" também; tirado, sai (fase 25)', () => {
    const none = (pick: NamedEntry['pick']) => ({
      named: { name: 'Feirinha de Canoinhas', city: 'Canoinhas', kind: 'event' as const },
      state: { kind: 'none' as const },
      pick,
    });
    const base = { origin: null, groups: [], chosen: [], nowhere: false };
    expect(summaryOf({ ...base, named: [none(null)] }).pending).toEqual(['Feirinha de Canoinhas']);
    expect(pendingForAi({ ...base, named: [none(null)] })).toEqual([
      { name: 'Feirinha de Canoinhas', kind: 'event', why: 'not_found' },
    ]);
    expect(summaryOf({ ...base, named: [none('remove')] })).toMatchObject({
      pending: [],
      removed: ['Feirinha de Canoinhas'],
    });
    const choice = {
      named: { name: 'Bioparque', city: null, kind: 'nature' as const },
      state: {
        kind: 'choice' as const,
        options: [
          { name: 'A', address: 'a', lat: 0, lng: 0 },
          { name: 'B', address: 'b', lat: 1, lng: 1 },
        ],
      },
      pick: 'skip' as const,
    };
    expect(pendingForAi({ ...base, named: [choice] })).toEqual([
      { name: 'Bioparque', kind: 'nature', why: 'unplaced' },
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
