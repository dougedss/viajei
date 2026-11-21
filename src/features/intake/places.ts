// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { Interest, StopKind } from '../../../supabase/functions/_shared/constants.ts';
import type { PlanWant } from '../../../supabase/functions/_shared/plan-protocol.ts';

/**
 * A tabela de tipos (fase 24): do que a pessoa disse ("café colonial", "zoológico") para as
 * categorias da Places API da Geoapify e as palavras do nome. Pequena e explicável: **a tabela, não a
 * IA, decide a categoria**, e nenhum nome de lugar sai daqui. "Café colonial" não é categoria do mapa:
 * é café ou restaurante com "colonial" no nome. A Geoapify não tem categoria de queda d'água: cascata
 * é atração, natureza ou parque com "cascata", "cachoeira" ou "salto" no nome. O que não está na
 * tabela vira "outro": a categoria larga do turismo mais as palavras do pedido no filtro de nome.
 * As categorias conferidas na especificação pública da Places API em 15/11/2026.
 */
export type PlaceSearch = {
  /** como a tela chama: "café colonial" */
  label: string;
  /** o tipo do app que a parada escolhida ganha */
  kind: StopKind;
  categories: readonly string[];
  /** cada palavra é uma busca (a Places filtra por um nome); vazio: só as categorias */
  names: readonly string[];
  /**
   * uma busca a mais, sem nome, que vale pela cozinha do OSM: o café colonial que não tem "colonial"
   * no nome (o Torten Paradies, em Pomerode, é `amenity=cafe` com `cuisine=german;…;regional`)
   */
  cuisine?: { categories: readonly string[]; match: RegExp } | undefined;
};

type TypeRow = PlaceSearch & { key: string; match: RegExp };

/** sem acento e em minúsculas: "Café Colonial" → "cafe colonial" */
export const plain = (s: string): string =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Da mais específica para a mais larga: "parque temático" antes de "parque", "café colonial" antes de "café". */
export const PLACE_TYPES: readonly TypeRow[] = [
  {
    key: 'cafe_colonial',
    label: 'café colonial',
    kind: 'food',
    match: /colonia(l|is)/,
    categories: ['catering.cafe', 'catering.restaurant'],
    names: ['colonial'],
    // a medição de 16/11: o Torten Paradies não tem "colonial" no nome; a cozinha regional ou alemã diz
    cuisine: { categories: ['catering.cafe'], match: /regional|german|colonial/ },
  },
  {
    key: 'churrascaria',
    label: 'churrascaria',
    kind: 'food',
    match: /churrasc|galeto|espeto corrido/,
    categories: ['catering.restaurant'],
    names: ['churrascaria'],
  },
  {
    key: 'pizzaria',
    label: 'pizzaria',
    kind: 'food',
    match: /pizz/,
    categories: ['catering.restaurant.pizza', 'catering.fast_food.pizza'],
    names: [],
  },
  {
    key: 'japones',
    label: 'restaurante japonês',
    kind: 'food',
    match: /sushi|japon|temaki/,
    categories: ['catering.restaurant.japanese', 'catering.restaurant.sushi'],
    names: [],
  },
  {
    key: 'sorvete',
    label: 'sorveteria',
    kind: 'food',
    match: /sorvet|gelat|acai/,
    categories: ['catering.ice_cream', 'catering.cafe.ice_cream'],
    names: [],
  },
  {
    key: 'padaria',
    label: 'padaria e confeitaria',
    kind: 'food',
    match: /padari|confeitari|doceri|cucas?\b|tortas?\b|bolos?\b/,
    categories: [
      'commercial.food_and_drink.bakery',
      'commercial.food_and_drink.confectionery',
      'catering.cafe.cake',
    ],
    names: [],
  },
  {
    key: 'cervejaria',
    label: 'cervejaria',
    kind: 'food',
    match: /cervej|chopp?\b|brewpub/,
    categories: ['production.brewery', 'catering.biergarten', 'catering.taproom'],
    names: [],
  },
  {
    key: 'cafe',
    label: 'café',
    kind: 'food',
    match: /\bcafe(s|teria)?\b/,
    categories: ['catering.cafe'],
    names: [],
  },
  {
    key: 'restaurante',
    label: 'restaurante',
    kind: 'food',
    match: /restaura|almoc|jantar|comer|comida/,
    categories: ['catering.restaurant'],
    names: [],
  },
  {
    key: 'tematico',
    label: 'parque de diversões',
    kind: 'event',
    match: /tematic|diversao|parque aquatic/,
    categories: ['entertainment.theme_park', 'entertainment.water_park'],
    names: [],
  },
  {
    key: 'zoo',
    label: 'zoológico',
    kind: 'nature',
    match: /zoologic|\bzoo\b|bioparque|safari/,
    categories: ['entertainment.zoo'],
    names: [],
  },
  {
    key: 'aquario',
    label: 'aquário',
    kind: 'other',
    match: /aquario/,
    categories: ['entertainment.aquarium'],
    names: [],
  },
  {
    key: 'museu',
    label: 'museu',
    kind: 'city',
    match: /museu/,
    categories: ['entertainment.museum'],
    names: [],
  },
  {
    key: 'cascata',
    label: 'cascata',
    kind: 'nature',
    match: /cascat|cachoeir|\bsalto\b|queda d/,
    categories: ['tourism.attraction', 'natural', 'leisure.park'],
    names: ['cascata', 'cachoeira', 'salto'],
  },
  {
    key: 'mirante',
    label: 'mirante',
    kind: 'nature',
    match: /mirante|\bvista\b|panoram/,
    categories: ['tourism.attraction.viewpoint'],
    names: [],
  },
  {
    key: 'praia',
    label: 'praia',
    kind: 'nature',
    match: /praia/,
    categories: ['beach'],
    names: [],
  },
  {
    key: 'termas',
    label: 'águas termais',
    kind: 'other',
    match: /terma|aguas quentes|\bspa\b/,
    categories: ['leisure.spa', 'natural.water.hot_spring'],
    names: [],
  },
  {
    key: 'parque',
    label: 'parque',
    kind: 'nature',
    match: /parque|trilha|natureza|bosque|reserva/,
    categories: [
      'leisure.park',
      'leisure.park.nature_reserve',
      'national_park',
      'natural.protected_area',
    ],
    names: [],
  },
  {
    key: 'historico',
    label: 'centro histórico',
    kind: 'city',
    match: /historic|cidade antiga|patrimonio|arquitetura/,
    categories: ['tourism.sights', 'building.historic', 'heritage'],
    names: [],
  },
  {
    key: 'igreja',
    label: 'igreja',
    kind: 'city',
    match: /igreja|catedral|capela|santuario/,
    categories: ['tourism.sights.place_of_worship'],
    names: [],
  },
  {
    key: 'vinicola',
    label: 'vinícola',
    kind: 'winery',
    match: /vinicola|vinho|adega|vinhedo|enoturis|cantina/,
    categories: ['production.winery'],
    names: [],
  },
  {
    key: 'posto',
    label: 'posto',
    kind: 'fuel',
    match: /posto|gasolina|abastecer|combustivel/,
    categories: ['service.vehicle.fuel'],
    names: [],
  },
  {
    key: 'hospedagem',
    label: 'hospedagem',
    kind: 'hotel',
    match: /hotel|pousada|dormir|hosped|chale|hostel/,
    categories: ['accommodation'],
    names: [],
  },
  {
    key: 'camping',
    label: 'camping',
    kind: 'hotel',
    match: /camping|acampa/,
    categories: ['camping'],
    names: [],
  },
];

/** O "outro" pelo tipo do app, quando as palavras não estão na tabela: a categoria larga e o nome. */
const BY_KIND: Readonly<Record<StopKind, readonly string[]>> = {
  food: ['catering.restaurant', 'catering.cafe'],
  winery: ['production.winery'],
  nature: ['tourism.attraction', 'leisure.park', 'natural'],
  city: ['tourism.sights', 'tourism.attraction'],
  event: ['tourism.attraction', 'entertainment'],
  hotel: ['accommodation'],
  fuel: ['service.vehicle.fuel'],
  other: ['tourism.attraction', 'tourism.sights', 'entertainment'],
  origin: ['tourism.attraction', 'tourism.sights', 'entertainment'],
  transit: ['tourism.attraction', 'tourism.sights', 'entertainment'],
};

const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de da do das dos e em no na nos nas num numa para pra por com ir ' +
    'quero queria vamos ver conhecer visitar passar passear lugar lugares algum alguma bom boa'
  ).split(' '),
);
/** As palavras do pedido que vão no filtro de nome do "outro": as que distinguem, no máximo três. */
export function nameWords(words: string): string[] {
  return [...new Set(plain(words).split(/[^a-z0-9]+/))]
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 3);
}

/** A busca de uma vontade: pela tabela, ou o "outro" com as palavras dela. */
export function searchFor(want: Pick<PlanWant, 'words' | 'kind'>): PlaceSearch {
  const text = plain(want.words);
  const row = PLACE_TYPES.find((t) => t.match.test(text));
  if (row) {
    return {
      label: row.label,
      kind: row.kind,
      categories: row.categories,
      names: row.names,
      cuisine: row.cuisine,
    };
  }
  const kind = want.kind === 'origin' || want.kind === 'transit' ? 'other' : want.kind;
  return {
    label: want.words.trim().toLocaleLowerCase('pt-BR'),
    kind,
    categories: BY_KIND[kind],
    names: nameWords(want.words),
  };
}

/**
 * As vontades num texto, sem IA (a saída de hoje, D208): cada tipo da tabela que aparece nele, **na
 * ordem em que a pessoa escreveu** (fase 25, D277: "ver uma cachoeira e depois tomar um café" lista a
 * cachoeira antes; até a fase 24 a ordem era a da tabela, e o café vinha antes), no máximo dois.
 * "quero sair hoje para um café colonial" → café colonial.
 */
export function wantsInText(text: string): PlanWant[] {
  const t = plain(text);
  const found: { row: TypeRow; at: number }[] = [];
  for (const row of PLACE_TYPES) {
    const m = row.match.exec(t);
    if (!m) continue;
    // "café colonial" já cobre "café"; "parque temático" já cobre "parque"
    if (row.key === 'cafe' && found.some((f) => f.row.key === 'cafe_colonial')) continue;
    if (row.key === 'parque' && found.some((f) => f.row.key === 'tematico')) continue;
    found.push({ row, at: m.index });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .slice(0, 2)
    .map(({ row }) => ({ words: row.label, kind: row.kind }));
}

// --------------------------------------------------------------- o que vale a pena no caminho
/**
 * Os marcos: o que vale um desvio para qualquer pessoa (zoológico, museu, parque temático, aquário,
 * mirante, reserva, parque nacional). Numa busca própria e com vantagem na ordem: na medição de 16/11,
 * a busca única em volta de Pomerode trouxe os 20 lugares mais perto (bustos, casas, uma praça) e o
 * Bioparque Zoo Pomerode ficou de fora.
 */
export const LANDMARK_CATEGORIES: readonly string[] = [
  'entertainment.zoo',
  'entertainment.museum',
  'entertainment.theme_park',
  'entertainment.aquarium',
  'tourism.attraction.viewpoint',
  'leisure.park.nature_reserve',
  'national_park',
];

/**
 * O clássico de turismo: o resto do que se sugere no caminho de qualquer pessoa (atração, centro
 * histórico, parque, patrimônio). Cascata entra pela atração e pelo parque (não há categoria própria).
 */
export const CLASSIC_CATEGORIES: readonly string[] = [
  'tourism.attraction',
  'tourism.sights',
  'leisure.park',
  'heritage',
  'building.historic',
];

/** O que não é sugestão: bustos, túmulos, marcos de estrada (a família dos memoriais). */
export const NOT_SUGGESTED: readonly string[] = ['tourism.sights.memorial'];

/** A categoria é desta família ("tourism.sights.memorial.tomb" é da "tourism.sights.memorial")? */
export const inFamily = (category: string, family: string): boolean =>
  category === family || category.startsWith(`${family}.`);

/** O que cada gosto do perfil (D209) acrescenta às sugestões. */
export const LIKE_CATEGORIES: Readonly<Record<Interest, readonly string[]>> = {
  nature: ['leisure.park.nature_reserve', 'national_park', 'tourism.attraction.viewpoint'],
  wineries: ['production.winery'],
  food: ['catering.cafe'],
  historic: ['tourism.sights', 'building.historic', 'heritage'],
  beach: ['beach'],
  museums: ['entertainment.museum'],
  no_dirt_road: [],
};

/** O que as notas 4 e 5 (D209), pelo tipo da parada, acrescentam. */
export const LEARNED_CATEGORIES: Readonly<Partial<Record<StopKind, readonly string[]>>> = {
  nature: ['leisure.park.nature_reserve', 'tourism.attraction.viewpoint'],
  winery: ['production.winery'],
  food: ['catering.cafe'],
  city: ['tourism.sights', 'entertainment.museum'],
  event: ['entertainment'],
};

/**
 * As categorias das sugestões, em duas buscas: os marcos mais o que a pessoa gosta (os gostos do
 * perfil e o aprendido pelas notas), e o clássico de turismo; sem repetir, até 20 em cada.
 */
export function suggestionCategories(
  interests: readonly Interest[],
  learned: readonly { kind: StopKind }[],
): { landmarks: string[]; classic: string[]; liked: Set<string> } {
  const liked = new Set<string>([
    ...interests.flatMap((i) => LIKE_CATEGORIES[i]),
    ...learned.flatMap((l) => LEARNED_CATEGORIES[l.kind] ?? []),
  ]);
  return {
    landmarks: [...new Set([...LANDMARK_CATEGORIES, ...liked])].slice(0, 20),
    classic: [...CLASSIC_CATEGORIES],
    liked,
  };
}

/** O tipo do app de um lugar do mapa, pelas categorias dele (a escolha e a sugestão nascem com ele). */
export function kindOfCategories(categories: readonly string[]): StopKind {
  const has = (prefix: string) =>
    categories.some((c) => c === prefix || c.startsWith(`${prefix}.`));
  if (has('accommodation') || has('camping')) return 'hotel';
  if (has('production.winery')) return 'winery';
  if (has('service.vehicle.fuel')) return 'fuel';
  if (has('catering') || has('commercial.food_and_drink') || has('production.brewery'))
    return 'food';
  if (
    has('natural') ||
    has('leisure.park') ||
    has('national_park') ||
    has('beach') ||
    has('entertainment.zoo') ||
    has('tourism.attraction.viewpoint')
  )
    return 'nature';
  if (
    has('entertainment.museum') ||
    has('tourism.sights') ||
    has('heritage') ||
    has('building.historic')
  )
    return 'city';
  if (has('entertainment')) return 'event';
  return 'other';
}

/** A categoria mais específica de um lugar, para a IA ler ("catering.cafe", não "catering"). */
export function mainCategory(categories: readonly string[]): string | null {
  return [...categories].sort((a, b) => b.split('.').length - a.split('.').length)[0] ?? null;
}

/** A busca é por palavra do nome: o lugar só vale se o nome dele tem alguma delas. */
export function nameFits(search: Pick<PlaceSearch, 'names'>, name: string): boolean {
  if (search.names.length === 0) return true;
  const n = plain(name);
  return search.names.some((w) => n.includes(plain(w)));
}

/** O lugar é desta busca: pelo nome, ou pela cozinha do OSM quando a busca diz qual. */
export function placeFits(
  search: Pick<PlaceSearch, 'names' | 'cuisine'>,
  place: { name: string; cuisine?: string | null | undefined },
): boolean {
  if (nameFits(search, place.name)) return true;
  return search.cuisine?.match.test(plain(place.cuisine ?? '')) ?? false;
}
