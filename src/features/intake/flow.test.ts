import { describe, expect, it } from 'vitest';
import type { FindPlacesRequest, Place, PlacesRequest } from '@shared/places-schema.ts';
import { EMPTY_INTENT, type PlanIntent } from '@shared/plan-protocol.ts';
import type { FoundPlace, Outing, PlanStep } from '@shared/plan-search-protocol.ts';
import {
  addNamed,
  answersByTopic,
  backTo,
  canBuild,
  canContinue,
  currentStep,
  destinationPosition,
  nextStep,
  orderedPicks,
  pendingForAi,
  pendingOf,
  pickNamed,
  picksOf,
  prepare,
  removeWant,
  searchMap,
  searchStep,
  stageAccount,
  stageFromOuting,
  stepsDone,
  stepSearchPlan,
  summaryOf,
  toggleChoice,
  type FlowDeps,
  type GeoBias,
  type MapStage,
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
      // a busca por texto no Google (fase 27) não entra na conversa de antes: vazia
      if ('provider' in r) return Promise.resolve([]);
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
    expect(asked.ask).toMatchObject({ said: 'Mafra', role: 'area', kind: 'far' });
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

  it('o que não é cidade no mapa pergunta a cidade, sem candidatos; a cidade escrita resolve; "sem cidade" segue de onde se sai (D283)', async () => {
    const { d, requests } = deps({
      geocode: (q) =>
        Promise.resolve(/papanduva/i.test(q) ? [PAPANDUVA] : /pomerode/i.test(q) ? [POMERODE] : []),
    });
    const base = input({ intent: intent({ area: 'Serra Gaúcha', origin: 'Papanduva, SC' }) });
    const asked = await searchMap(base, d);
    expect(asked.ask).toEqual({ said: 'Serra Gaúcha', role: 'area', options: [], kind: 'unknown' });
    expect(requests).toHaveLength(0);
    // a pessoa escreveu a cidade: a busca em volta dela
    const typed = await searchMap({ ...base, renamed: { 'serra gaucha': 'Pomerode' } }, d);
    expect(typed.ask ?? null).toBeNull();
    expect(typed.groups[0]?.center).toEqual([-49.177, -26.74]);
    expect(typed.groups[0]?.centerLabel).toBe('Pomerode');
    // "sem cidade": em volta de onde sai, pelo alcance de uma viagem
    const without = await searchMap({ ...base, renamed: { 'serra gaucha': '' } }, d);
    expect(without.ask ?? null).toBeNull();
    expect(without.groups[0]?.center).toEqual([-50.144, -26.37]);
    expect(without.groups[0]?.centerLabel).toBe('Papanduva, SC');
    // e a origem que não é cidade também pergunta, de onde saem
    const origin = await searchMap(
      input({ intent: intent({ area: 'Pomerode', origin: 'minha casa' }) }),
      d,
    );
    expect(origin.ask).toMatchObject({ said: 'minha casa', role: 'origin', kind: 'unknown' });
  });

  it('o mapa fora do ar não vira "não é cidade": segue sem a cidade, como a busca sem rede', async () => {
    const { d } = deps({
      geocode: (q) =>
        /papanduva/i.test(q) ? Promise.resolve([PAPANDUVA]) : Promise.reject(new Error('rede')),
    });
    const stage = await searchMap(
      input({ intent: intent({ area: 'Pomerode', origin: 'Papanduva, SC' }) }),
      d,
    );
    expect(stage.ask ?? null).toBeNull();
    expect(stage.groups[0]?.center).toEqual([-50.144, -26.37]);
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
        Promise.resolve(
          !('provider' in r) && r.categories.includes('catering.cafe') ? [TORTEN, MAHLZEIT] : [],
        ),
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
      destination: null,
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
      destination: null,
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

// ---------------------------------------------------------- o passeio um passo de cada vez (fase 26)
/** Um lugar do Google inventado, na forma dos que o planejador devolve. */
const gplace = (
  id: string,
  name: string,
  lng: number,
  lat: number,
  city: string,
  categories = ['cafe', 'food'],
): Place => ({
  id,
  name,
  lat,
  lng,
  categories,
  city,
  address: `${name}, ${city} - SC`,
  opening_hours: null,
  website: null,
  osm: null,
  distance_m: null,
  provider: 'google',
  google_place_id: id,
  rating: 4.5,
  user_rating_count: 100,
  open_now: true,
  business_status: 'operational',
  maps_url: null,
  hours: null,
});
const HOME: [number, number] = [-50.33, -26.37];
// as cachoeiras (o passo 1, procurado pela IA) e os cafés (o passo 2, que o app procura)
const WIEGAND = gplace('g-wiegand', 'Cachoeira Wiegand', -49.65, -26.95, 'José Boiteux', [
  'natural_feature',
  'tourist_attraction',
]);
const PERTO = gplace('g-cafe-perto', 'Café da Serra', -49.6, -26.9, 'José Boiteux');
const LONGE = gplace('g-cafe-longe', 'Café do Vale', -50.4, -26.2, 'Canoinhas');
const step = (ordem: number, o_que: string, over: Partial<PlanStep> = {}): PlanStep => ({
  ordem,
  o_que,
  relacao: 'perto_do_anterior',
  cidade: '',
  hora_do_dia: '',
  candidatos: [],
  achou: false,
  fora_da_cidade: false,
  busca: { palavras: o_que, tipo_google: '', aberto_agora: false, nota_minima: 0 },
  ...over,
});
const outing = (passos: PlanStep[], over: Partial<Outing> = {}): Outing => ({
  passos,
  pendentes: [],
  perguntas: [],
  destino: '',
  origem: '',
  ...over,
});
const found = (places: Place[]): FoundPlace[] =>
  places.map((place, i) => ({ ref: `p${String(i + 1)}`, place }));
const ORIGIN = { label: 'Major Vieira, SC', at: HOME };
/** A `find-places` do Google de mentira: devolve os dois cafés a toda busca e guarda os pedidos. */
function googleDeps(answer: (q: string) => Place[] = () => [PERTO, LONGE]) {
  const requests: Extract<FindPlacesRequest, { provider: 'google' }>[] = [];
  const d: FlowDeps = {
    ...deps().d,
    findPlaces: (r) => {
      if ('provider' in r) {
        requests.push(r);
        return Promise.resolve(answer(r.query));
      }
      return Promise.resolve([]);
    },
  };
  return { d, requests };
}

describe('o passeio um passo de cada vez (fase 26): os grupos do passo a passo', () => {
  it('a IA procurou só o passo 1: o passo 2 nasce por procurar, o da vez é o 1, e o destino vira a parada de cidade', () => {
    const { stage, dropped } = stageFromOuting(
      {
        lugares: found([WIEGAND]),
        passeio: outing(
          [
            step(1, 'cachoeira', {
              relacao: 'perto_de_casa',
              candidatos: ['p1'],
              achou: true,
              buscado: true,
            }),
            step(2, 'café'),
          ],
          { destino: 'Joinville', destino_centro: { lat: -26.3, lng: -48.85 } },
        ),
      },
      ORIGIN,
      HOME,
    );
    expect(dropped).toBe(0);
    expect(stage.groups.map((g) => g.status)).toEqual(['ok', 'unsearched']);
    expect(currentStep(stage)).toBe(0);
    expect(nextStep(stage)).toBe(1);
    expect(stage.destination).toEqual({ name: 'Joinville', at: [-48.85, -26.3] });
    // sem escolha, não dá para continuar nem traçar
    expect(canContinue(stage)).toBe(false);
    expect(stepsDone(stage)).toBe(false);
  });

  it('um passo seguinte numa cidade que a IA já procurou fica com o que ela achou; um que depende do anterior é sempre procurado pelo app', () => {
    const { stage } = stageFromOuting(
      {
        lugares: found([WIEGAND, PERTO, LONGE]),
        passeio: outing([
          step(1, 'cachoeira', { relacao: 'perto_de_casa', candidatos: ['p1'], achou: true }),
          step(2, 'café', {
            relacao: 'na_cidade',
            cidade: 'Canoinhas',
            candidatos: ['p3'],
            achou: true,
            buscado: true,
          }),
          step(3, 'sorvete', { relacao: 'perto_do_anterior', candidatos: ['p2'], achou: true }),
        ]),
      },
      ORIGIN,
      HOME,
    );
    expect(stage.groups.map((g) => g.status)).toEqual(['ok', 'ok', 'unsearched']);
    expect(stage.groups[2]?.options).toEqual([]);
    // sem o passo a passo (a conversa de antes): tudo como a IA entregou, e nenhum passo da vez
    const legacy = stageFromOuting(
      {
        lugares: found([WIEGAND, PERTO]),
        passeio: outing([
          step(1, 'a', { candidatos: ['p1'], achou: true }),
          step(2, 'b', { candidatos: ['p2'], achou: true }),
        ]),
      },
      ORIGIN,
      HOME,
      { stepwise: false },
    ).stage;
    expect(legacy.groups.map((g) => g.status)).toEqual(['ok', 'ok']);
    expect(currentStep(legacy)).toBeNull();
    expect(stepsDone(legacy)).toBe(true);
  });
});

describe('o passeio um passo de cada vez (fase 26): a busca do passo seguinte pela relação', () => {
  const base = (relacao: PlanStep['relacao'], over: Partial<PlanStep> = {}) => {
    const { stage } = stageFromOuting(
      {
        lugares: found([WIEGAND]),
        passeio: outing([
          step(1, 'cachoeira', {
            relacao: 'perto_de_casa',
            candidatos: ['p1'],
            achou: true,
            buscado: true,
          }),
          step(2, 'café', { relacao, ...over }),
        ]),
      },
      ORIGIN,
      HOME,
    );
    return toggleChoice(stage, WIEGAND.id);
  };

  it('perto_do_anterior: um círculo de 15 km em volta do escolhido, por distância; cada cartão diz a distância dele e o desvio', async () => {
    const { d, requests } = googleDeps();
    const stage = base('perto_do_anterior');
    expect(stepSearchPlan(stage, 1)?.where).toBe('perto de Cachoeira Wiegand');
    const next = await searchStep(stage, 1, d);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      provider: 'google',
      query: 'café',
      bias: { lat: -26.95, lng: -49.65, radius_m: 15_000 },
      rank: 'distance',
      limit: 20,
    });
    const g = next.groups[1];
    expect(g?.status).toBe('ok');
    expect(g?.where).toBe('perto de Cachoeira Wiegand');
    // o mais perto da cachoeira primeiro, com o que acrescenta ao passeio
    expect(g?.options.map((o) => o.place.id)).toEqual(['g-cafe-perto', 'g-cafe-longe']);
    expect(g?.options[0]?.fromPrevious).toMatchObject({ name: 'Cachoeira Wiegand' });
    expect(g?.options[0]?.fromPrevious?.minutes).toBeLessThan(
      g?.options[1]?.fromPrevious?.minutes ?? 0,
    );
    expect(g?.options[0]?.detour).toBeDefined();
    expect(next.notice ?? null).toBeNull();
  });

  it('no_caminho: os círculos entre o escolhido e o destino (ou casa), juntos sem repetir', async () => {
    const { d, requests } = googleDeps();
    const home = base('no_caminho');
    await searchStep(home, 1, d);
    // Wiegand → casa: ~80 km em linha reta, dois círculos
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(stepSearchPlan(home, 1)?.where).toBe('no caminho de volta');
    const toCity = {
      ...home,
      destination: { name: 'Joinville', at: [-48.85, -26.3] as [number, number] },
    };
    const plan = stepSearchPlan(toCity, 1);
    expect(plan?.where).toBe('no caminho até Joinville');
    expect(plan?.next).toEqual([-48.85, -26.3]);
    const { d: d2, requests: r2 } = googleDeps(() => [PERTO, PERTO]);
    const next = await searchStep(toCity, 1, d2);
    expect(r2.length).toBeGreaterThanOrEqual(2);
    expect(next.groups[1]?.options.map((o) => o.place.id)).toEqual(['g-cafe-perto']);
  });

  it('na_cidade: o círculo de 25 km no centro da cidade, as palavras com a cidade, o filtro no app e os vizinhos ditos', async () => {
    const { d, requests } = googleDeps(() => [LONGE, PERTO]);
    const stage = base('na_cidade', { cidade: 'Canoinhas', centro: { lat: -26.18, lng: -50.39 } });
    const next = await searchStep(stage, 1, d);
    expect(requests[0]).toMatchObject({
      query: 'café em Canoinhas',
      bias: { lat: -26.18, lng: -50.39, radius_m: 25_000 },
      rank: 'relevance',
    });
    // só o de Canoinhas fica; o de José Boiteux sai
    expect(next.groups[1]?.options.map((o) => o.place.id)).toEqual(['g-cafe-longe']);
    expect(next.groups[1]?.step?.fora_da_cidade).toBe(false);
    expect(next.groups[1]?.where).toBe('em Canoinhas');
    // nada dentro: os vizinhos valem, ditos
    const { d: d2 } = googleDeps(() => [PERTO]);
    const neighbors = await searchStep(stage, 1, d2);
    expect(neighbors.groups[1]?.options.map((o) => o.place.id)).toEqual(['g-cafe-perto']);
    expect(neighbors.groups[1]?.step?.fora_da_cidade).toBe(true);
  });

  it('perto_de_casa: 15 km em volta de onde se sai; sem_relacao: em volta do anterior e no caminho de volta', async () => {
    const { d, requests } = googleDeps();
    await searchStep(base('perto_de_casa'), 1, d);
    expect(requests[0]).toMatchObject({
      bias: { lat: -26.37, lng: -50.33, radius_m: 15_000 },
      rank: 'distance',
    });
    const { d: d2, requests: r2 } = googleDeps();
    const loose = base('sem_relacao');
    expect(stepSearchPlan(loose, 1)?.where).toBe(
      'perto de Cachoeira Wiegand e no caminho de volta',
    );
    await searchStep(loose, 1, d2);
    expect(r2.length).toBeGreaterThanOrEqual(2);
    // com mais de uma escolha no passo anterior, o centro é a última escolhida
    const two = {
      ...loose,
      groups: loose.groups.map((g, i) =>
        i === 0
          ? {
              ...g,
              options: [...g.options, { place: LONGE, km: 1, minutes: 5, kind: 'food' as const }],
            }
          : g,
      ),
    };
    const both = toggleChoice(two, LONGE.id);
    expect(stepSearchPlan(both, 1)?.previous?.name).toBe('Café do Vale');
  });

  it('a busca que falha não some: o grupo diz o estado, como na busca por tipo', async () => {
    const d: FlowDeps = {
      ...deps().d,
      findPlaces: () => Promise.reject(Object.assign(new Error('x'), { code: 'daily_limit' })),
    };
    const next = await searchStep(base('perto_do_anterior'), 1, d);
    expect(next.groups[1]?.status).toBe('limit');
    expect(stepsDone(next)).toBe(false);
  });
});

describe('o passeio um passo de cada vez (fase 26): continuar, voltar, a ordem e a conta', () => {
  const twoSteps = (): MapStage => {
    const { stage } = stageFromOuting(
      {
        lugares: found([WIEGAND]),
        passeio: outing([
          step(1, 'cachoeira', {
            relacao: 'perto_de_casa',
            candidatos: ['p1'],
            achou: true,
            buscado: true,
          }),
          step(2, 'café'),
        ]),
      },
      ORIGIN,
      HOME,
    );
    return toggleChoice(stage, WIEGAND.id);
  };

  it('escolhido o passo 1, dá para continuar; o passo 2 procurado e escolhido fecha o passeio; a ordem final é a dos passos', async () => {
    const chosen1 = twoSteps();
    expect(canContinue(chosen1)).toBe(true);
    const { d } = googleDeps();
    const searched = await searchStep({ ...chosen1, step: 1 }, 1, d);
    expect(stepsDone(searched)).toBe(false);
    const done = toggleChoice(searched, LONGE.id);
    expect(stepsDone(done)).toBe(true);
    expect(canBuild(done)).toBe(true);
    // a ordem é a dos passos (a cachoeira, depois o café), mesmo que o café fique mais perto de casa
    expect(orderedPicks(done, HOME).map((p) => p.place.id)).toEqual(['g-wiegand', 'g-cafe-longe']);
    expect(picksOf(done).map((p) => p.ref)).toEqual(['e1', 'e2']);
    const prepared = await prepare(done, { interests: [], learned: [] }, d);
    expect(prepared.picks.map((p) => p.place.id)).toEqual(['g-wiegand', 'g-cafe-longe']);
    // duas escolhas no mesmo passo: entre si, pelo caminho mais curto a partir do anterior
    const twoCafes = toggleChoice(done, PERTO.id);
    expect(orderedPicks(twoCafes, HOME).map((p) => p.place.id)).toEqual([
      'g-wiegand',
      'g-cafe-perto',
      'g-cafe-longe',
    ]);
  });

  it('"Voltar um passo" desfaz as escolhas dos seguintes, os que dependem do anterior voltam a ser procurados, e a tela avisa', async () => {
    const { d } = googleDeps();
    const searched = await searchStep({ ...twoSteps(), step: 1 }, 1, d);
    const done = toggleChoice(searched, LONGE.id);
    const back = backTo(done, 0);
    expect(back.step).toBe(0);
    expect(back.chosen).toEqual(['g-wiegand']);
    expect(back.groups[1]?.status).toBe('unsearched');
    expect(back.groups[1]?.options).toEqual([]);
    expect(back.notice).toBe('As opções de café vão ser procuradas de novo depois da sua escolha.');
    // um passo seguinte numa cidade não depende do anterior: as opções ficam, só a escolha sai
    const { stage } = stageFromOuting(
      {
        lugares: found([WIEGAND, LONGE]),
        passeio: outing([
          step(1, 'cachoeira', {
            relacao: 'perto_de_casa',
            candidatos: ['p1'],
            achou: true,
            buscado: true,
          }),
          step(2, 'café', {
            relacao: 'na_cidade',
            cidade: 'Canoinhas',
            candidatos: ['p2'],
            achou: true,
            buscado: true,
          }),
        ]),
      },
      ORIGIN,
      HOME,
    );
    const both = toggleChoice(toggleChoice({ ...stage, step: 1 }, WIEGAND.id), LONGE.id);
    const kept = backTo(both, 0);
    expect(kept.groups[1]?.status).toBe('ok');
    expect(kept.chosen).toEqual(['g-wiegand']);
    expect(kept.notice ?? null).toBeNull();
  });

  it('o destino entra como parada de cidade: depois do último passo "no caminho"; sem um, antes do passo na cidade dele; senão no fim', () => {
    const { stage } = stageFromOuting(
      {
        lugares: found([PERTO, WIEGAND]),
        passeio: outing(
          [
            step(1, 'café', {
              relacao: 'no_caminho',
              candidatos: ['p1'],
              achou: true,
              buscado: true,
            }),
            step(2, 'cachoeira', {
              relacao: 'na_cidade',
              cidade: 'Joinville',
              candidatos: ['p2'],
              achou: true,
              buscado: true,
            }),
          ],
          { destino: 'Joinville', destino_centro: { lat: -26.3, lng: -48.85 } },
        ),
      },
      ORIGIN,
      HOME,
    );
    expect(destinationPosition(stage)).toBe(1);
    const chosen = toggleChoice(toggleChoice({ ...stage, step: 1 }, PERTO.id), WIEGAND.id);
    expect(orderedPicks(chosen, HOME).map((p) => p.place.name)).toEqual([
      'Café da Serra',
      'Joinville',
      'Cachoeira Wiegand',
    ]);
    // o destino é uma `e` (a plan-trip só aceita e, n e s) do tipo cidade, e não conta como escolha
    const picks = picksOf(chosen);
    expect(picks.map((p) => [p.ref, p.kind])).toEqual([
      ['e1', 'food'],
      ['e2', 'nature'],
      ['e3', 'city'],
    ]);
    expect(summaryOf(chosen)).toMatchObject({ chosen: 2, destination: 'Joinville' });
    // sem passo no caminho: antes do primeiro passo na cidade do destino
    const inCity = {
      ...stage,
      groups: stage.groups.map((g, i) =>
        i === 0 && g.step ? { ...g, step: { ...g.step, relacao: 'perto_de_casa' as const } } : g,
      ),
    };
    expect(destinationPosition(inCity)).toBe(1);
    // só o destino dito, sem escolha: já dá para traçar ("vou pra Joinville")
    const onlyCity = {
      ...stage,
      step: 1,
      chosen: [] as string[],
      groups: stage.groups.map((g) => ({ ...g, removed: true })),
    };
    expect(canBuild(onlyCity)).toBe(true);
    expect(picksOf(onlyCity).map((p) => p.kind)).toEqual(['city']);
  });

  it('a conta do passeio para o que está escolhido: a estrada, a permanência e a hora do dia do passo', async () => {
    const { d } = googleDeps();
    const { stage } = stageFromOuting(
      {
        lugares: found([WIEGAND]),
        passeio: outing([
          step(1, 'cachoeira', {
            relacao: 'perto_de_casa',
            candidatos: ['p1'],
            achou: true,
            buscado: true,
            hora_do_dia: 'noite',
          }),
          step(2, 'café'),
        ]),
      },
      ORIGIN,
      HOME,
    );
    const chosen = toggleChoice(stage, WIEGAND.id);
    const acc = stageAccount(chosen, { start: '08:00', date: '2026-12-05' });
    expect(acc.dwell).toBe(90);
    expect(acc.road).toBeGreaterThan(60);
    expect(acc.arrivals[0]?.outsideWindow).toMatch(/vocês queriam à noite$/);
    const more = toggleChoice(await searchStep({ ...chosen, step: 1 }, 1, d), LONGE.id);
    expect(stageAccount(more, { start: '08:00', date: '2026-12-05' }).dwell).toBe(165);
  });
});
