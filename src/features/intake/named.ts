// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import { haversineM } from '../../../supabase/functions/_shared/geo.ts';
import type { PlanNamed } from '../../../supabase/functions/_shared/plan-protocol.ts';
import { plain } from './places.ts';

/**
 * O lugar que a pessoa nomeou (fase 24, a regra de ouro: o único que entra direto na rota), conferido
 * no mapa pelo Nominatim (a fila de uma por vez, com cache, D31), sem os defeitos de 15/11:
 * - **a segunda tentativa** com as palavras que distinguem, sem preposição e sem repetir a cidade:
 *   "zoológico de pomerode, pomerode, sc" devolve zero; "zoologico pomerode" acha o Bioparque;
 * - **a cidade fora da conta** do quanto o nome do mapa cobre o nome dito: "Museu Pomerode" casava
 *   com o Museu do Brinquedo só pela palavra "pomerode";
 * - as classes que faltavam (`tourism=zoo`; `boundary=administrative` para "centro de <cidade>", que é
 *   o centro da cidade), e o nome exato vale em qualquer classe;
 * - com mais de um candidato, **a escolha** na tela, nunca o chute; sem nenhum, "não achei", nunca o
 *   sumiço em silêncio. Um nome que é só um tipo numa cidade ("Museu Pomerode") não é um lugar: vira
 *   a busca das opções daquele tipo ali.
 * Puro: a rede entra por `search`.
 */
export type LatLng = { lat: number; lng: number };

/** Um resultado do `/search` do Nominatim, como `lib/geocode/nominatim.ts` devolve. */
export type SearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: string;
  type?: string;
  /** a importância do Nominatim (fase 25, D283), quando vem */
  importance?: number;
};

export type NamedHit = { name: string; address: string; lat: number; lng: number };
export type NamedState =
  | { kind: 'found'; hit: NamedHit }
  | { kind: 'choice'; options: NamedHit[] }
  | { kind: 'none' }
  /** o mapa não respondeu: dá para tentar de novo */
  | { kind: 'offline' }
  /** só um tipo numa cidade ("Museu Pomerode"): vira a busca das opções */
  | { kind: 'type' };

// ------------------------------------------------------------------------------ os nomes
const tokensOf = (s: string) =>
  plain(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);

/** O mesmo lugar dito de dois jeitos: "zoológico" e "zoo", "bioparque". */
const SYNONYMS: Readonly<Record<string, string>> = { zoologico: 'zoo', bioparque: 'zoo' };
const canon = (t: string) => SYNONYMS[t] ?? t;

/**
 * As palavras que não distinguem um lugar de outro: artigos, preposições e o tipo do lugar ("Cascata
 * do Caracol" se distingue por "caracol"; "Parque Estadual do Caracol" também).
 */
const GENERIC = new Set(
  (
    'a o as os de da do das dos e em no na nos nas para por com ' +
    'parque estadual nacional municipal cascata cachoeira salto queda trilha mirante vista ' +
    'vinicola vinhos vinho cantina adega restaurante churrascaria cafe cafeteria bar pizzaria ' +
    'lanchonete padaria hotel pousada hostel chale resort casa centro historico historica ' +
    'museu igreja catedral capela praca rua avenida estrada rodovia ponte lago lagoa rio ' +
    'praia ilha morro serra vale cidade sao santa santo nossa senhora posto ponto colonial'
  ).split(' '),
);

/** As palavras que distinguem o lugar, sem acento e sem as da cidade: "Casa Valduga" → ["valduga"]. */
export function distinctive(name: string, city: string | null = null): string[] {
  const cityTokens = new Set(city ? tokensOf(city) : []);
  return tokensOf(name)
    .filter((t) => t.length >= 3 && !GENERIC.has(t) && !cityTokens.has(t))
    .map(canon);
}

/**
 * Quanto o nome do mapa cobre o nome dito: a fração das palavras que distinguem o dito (sem a cidade)
 * que aparecem no do mapa (de 0 a 1). Sem palavra que distinga, 0: não dá para conferir pelo nome.
 */
export function nameScore(said: string, mapName: string, city: string | null = null): number {
  const want = distinctive(said, city);
  if (want.length === 0) return 0;
  const have = new Set(tokensOf(mapName).map(canon));
  return want.filter((t) => have.has(t)).length / want.length;
}
/** A partir daqui, o nome do mapa é o do lugar dito. */
export const NAME_MATCH = 0.6;

// ---------------------------------------------------------------------- as classes do OSM
type TagRule = { key: string; values?: readonly string[] };
/**
 * As classes do OSM em que cada tipo se confere, pela classe do resultado do Nominatim (a `category`,
 * a chave principal do objeto, e o `type`, o valor dela). O Lago Negro volta como `water`/`lake`
 * (D207); o Bioparque Zoo Pomerode, como `tourism`/`zoo`; o bairro Centro, como
 * `boundary`/`administrative`.
 */
export const KIND_TAGS: Readonly<Record<StopKind, readonly TagRule[]>> = {
  nature: [
    { key: 'natural' },
    { key: 'water' },
    { key: 'waterway', values: ['waterfall'] },
    { key: 'leisure', values: ['park', 'nature_reserve', 'garden'] },
    {
      key: 'tourism',
      values: ['viewpoint', 'attraction', 'picnic_site', 'zoo', 'theme_park', 'aquarium'],
    },
    { key: 'boundary', values: ['protected_area', 'national_park'] },
  ],
  winery: [
    { key: 'craft', values: ['winery'] },
    { key: 'shop', values: ['wine'] },
    { key: 'landuse', values: ['vineyard'] },
    { key: 'tourism', values: ['attraction', 'wine_cellar'] },
  ],
  food: [
    {
      key: 'amenity',
      values: ['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'bar', 'pub'],
    },
    { key: 'shop', values: ['bakery', 'confectionery'] },
  ],
  hotel: [
    {
      key: 'tourism',
      values: ['hotel', 'motel', 'guest_house', 'hostel', 'chalet', 'apartment', 'camp_site'],
    },
  ],
  city: [
    { key: 'place', values: ['city', 'town', 'village', 'suburb', 'neighbourhood', 'hamlet'] },
    { key: 'boundary', values: ['administrative'] },
    { key: 'historic' },
    { key: 'tourism', values: ['attraction', 'museum', 'gallery', 'artwork', 'zoo'] },
  ],
  event: [
    { key: 'tourism' },
    { key: 'amenity', values: ['theatre', 'arts_centre', 'events_venue', 'place_of_worship'] },
    { key: 'leisure', values: ['stadium', 'sports_centre'] },
  ],
  fuel: [{ key: 'amenity', values: ['fuel'] }],
  other: [{ key: 'tourism' }, { key: 'amenity' }, { key: 'historic' }, { key: 'leisure' }],
  origin: [],
  transit: [],
};

/** O resultado do mapa é do tipo do lugar dito? */
export function fitsKind(kind: StopKind, tags: Readonly<Record<string, string>>): boolean {
  return KIND_TAGS[kind].some((rule) => {
    const value = tags[rule.key];
    return value !== undefined && (!rule.values || rule.values.includes(value));
  });
}

// --------------------------------------------------------------------------- as buscas
/** "Centro de Pomerode", "centro histórico de Blumenau": o centro da cidade, que é a própria cidade. */
export function cityCenterOf(named: Pick<PlanNamed, 'name' | 'city'>): string | null {
  const m = /^centro( historico)?( (de|da|do))? (.+)$/.exec(plain(named.name));
  return m?.[4] ? (named.city ?? m[4]) : null;
}

/**
 * As buscas de um lugar dito, em ordem: o nome com a cidade quando o nome não a tem; depois, as
 * palavras que distinguem com a cidade, sem preposição e sem repetir ("zoologico pomerode"). Sem
 * repetir a mesma consulta.
 */
export function namedQueries(named: Pick<PlanNamed, 'name' | 'city'>): string[] {
  const name = named.name.trim();
  const city = named.city?.trim() ?? '';
  const hasCity = city !== '' && plain(name).includes(plain(city));
  const first = city && !hasCity ? `${name}, ${city}` : name;
  const words = tokensOf(name).filter(
    (t) => t.length >= 3 && !['de', 'da', 'do', 'das', 'dos'].includes(t),
  );
  const cityWords = new Set(tokensOf(city));
  const second = [...words.filter((t) => !cityWords.has(t)), ...tokensOf(city)].join(' ');
  const seen = new Set<string>();
  return [first, second].filter((q) => {
    const key = plain(q);
    if (key.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Os resultados que são o lugar dito: o nome que o cobre (sem contar a cidade) e a classe do tipo;
 * o nome exato vale em qualquer classe.
 */
export function matchHits(
  named: Pick<PlanNamed, 'name' | 'city' | 'kind'>,
  results: readonly SearchResult[],
): NamedHit[] {
  const exact = plain(named.name);
  return results
    .filter((r) => {
      if (plain(r.name) === exact) return true;
      const score = Math.max(
        nameScore(named.name, r.name, named.city),
        nameScore(named.name, r.address.split(',')[0] ?? '', named.city),
      );
      if (score < NAME_MATCH) return false;
      return !r.category || !r.type || fitsKind(named.kind, { [r.category]: r.type });
    })
    .map((r) => ({ name: r.name, address: r.address, lat: r.lat, lng: r.lng }));
}

/** Candidatos a até 2 km um do outro são o mesmo lugar (a entrada e o estacionamento do parque). */
export const SAME_PLACE_M = 2_000;
export const MAX_CHOICES = 3;

export function classifyHits(hits: readonly NamedHit[]): NamedState {
  const first = hits[0];
  if (!first) return { kind: 'none' };
  const together = hits.every(
    (h) => haversineM([first.lng, first.lat], [h.lng, h.lat]) <= SAME_PLACE_M,
  );
  return together
    ? { kind: 'found', hit: first }
    : { kind: 'choice', options: hits.slice(0, MAX_CHOICES) };
}

/**
 * Confere um lugar dito: o centro de uma cidade é a cidade; um tipo numa cidade vira a busca das
 * opções; senão, as buscas em ordem, e a primeira que acha alguma coisa decide. O mapa fora do ar é
 * `offline`, nunca "não achei".
 */
export async function confirmNamed(
  named: PlanNamed,
  search: (query: string) => Promise<SearchResult[]>,
): Promise<NamedState> {
  try {
    const city = cityCenterOf(named);
    if (city) {
      const results = await search(city);
      const town = results.find(
        (r) => r.category === 'place' || r.category === 'boundary' || !r.category,
      );
      return town
        ? {
            kind: 'found',
            hit: { name: town.name, address: town.address, lat: town.lat, lng: town.lng },
          }
        : { kind: 'none' };
    }
    if (distinctive(named.name, named.city).length === 0) return { kind: 'type' };
    for (const query of namedQueries(named)) {
      const state = classifyHits(matchHits(named, await search(query)));
      if (state.kind !== 'none') return state;
    }
    return { kind: 'none' };
  } catch {
    return { kind: 'offline' };
  }
}
