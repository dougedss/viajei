// caminhos relativos: a medição do laboratório (`scripts/lab`) roda e compila este módulo sem os
// atalhos `@` e `@shared`
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import { haversineM } from '../../../supabase/functions/_shared/geo.ts';
import type { ImportData, ImportStop } from '../../../supabase/functions/_shared/import-schema.ts';
import type { OsmElement } from '../../lib/geocode/overpass.ts';

/**
 * Só lugares reais (fase 17): o que a IA da conversa propõe é conferido no OpenStreetMap antes de a
 * pessoa ver. Uma consulta ao Overpass por conversa (pelos nomes propostos, nas classes dos tipos, em
 * volta da região) e o `/search` do Nominatim, pela fila de uma por vez, **ao mesmo tempo**: o
 * Overpass acelera, nunca segura. Quando ele responde, o que achou não vai mais ao Nominatim; quando
 * o Nominatim confirma tudo antes, a consulta dele é cortada; e ele só é esperado se ainda falta
 * lugar. O servidor público dele vive cheio: no laboratório e nas medições de 15/11 ele não respondeu
 * nenhuma vez (o prazo de 25 s, 502), e a primeira versão, que esperava o Overpass antes da fila,
 * fazia a pessoa esperar o prazo inteiro antes da primeira busca. O que se confirma ganha a
 * coordenada; o que não se confirma sai. Quando o mapa não responde,
 * o lugar não se confirma também (nunca inventar), mas sai como "não deu para conferir", que a tela
 * pode tentar de novo. A saída e o deslocamento ("Saída de Canela") não são lugares propostos: ficam,
 * e a busca de lugar da revisão os localiza. Puro: a rede entra por `CheckDeps`.
 */
export type LatLng = { lat: number; lng: number };
export type Region = { center: LatLng | null; radiusKm: number };

export type PlaceCheck = {
  /** o roteiro só com as paradas confirmadas (com a coordenada) e as que não se conferem */
  data: ImportData;
  confirmed: number;
  /** procurados no mapa e não achados */
  removed: string[];
  /** o mapa não respondeu: não deu para conferir */
  unchecked: string[];
  overpass: 'ok' | 'failed' | 'skipped';
};

/** Um resultado do `/search` do Nominatim, como `lib/geocode/nominatim.ts` devolve. */
export type SearchResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  category?: string;
  type?: string;
};

export type CheckDeps = {
  /** a consulta da conversa; o `signal` a corta quando o Nominatim já confirmou tudo */
  overpass: (query: string, signal: AbortSignal) => Promise<OsmElement[]>;
  search: (query: string, region: Region) => Promise<SearchResult[]>;
  onProgress?: (done: number, total: number) => void;
};

/** Os tipos que não são um lugar proposto: a saída, a chegada e o deslocamento. */
const NOT_A_PLACE: readonly StopKind[] = ['origin', 'transit'];

// ------------------------------------------------------------------------------ os nomes
const plain = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
const tokensOf = (s: string) =>
  plain(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);

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
    'praia ilha morro serra vale cidade sao santa santo nossa senhora posto ponto'
  ).split(' '),
);

/** As palavras que distinguem o lugar, sem acento: "Casa Valduga" → ["valduga"]. */
export function distinctive(name: string): string[] {
  return tokensOf(name).filter((t) => t.length >= 3 && !GENERIC.has(t));
}

/** Uma palavra como expressão do Overpass que não liga para acento: "c(a|á|à|â|ã)r…". */
const ACCENTS: Record<string, string> = {
  a: '(a|á|à|â|ã)',
  e: '(e|é|ê)',
  i: '(i|í)',
  o: '(o|ó|ô|õ)',
  u: '(u|ú|ü)',
  c: '(c|ç)',
};
export function accentless(token: string): string {
  return token
    .replace(/[^a-z0-9]/g, (ch) => `\\${ch}`)
    .replace(/[aeiouc]/g, (ch) => ACCENTS[ch] ?? ch);
}

/**
 * Quanto o nome do mapa cobre o nome proposto: a fração das palavras que distinguem o proposto que
 * aparecem no do mapa (de 0 a 1). Sem palavra que distinga ("Mirante"), 0: não dá para conferir.
 */
export function nameScore(proposed: string, osmName: string): number {
  const want = distinctive(proposed);
  if (want.length === 0) return 0;
  const have = new Set(tokensOf(osmName));
  return want.filter((t) => have.has(t)).length / want.length;
}
/** A partir daqui, o nome do mapa é o do lugar proposto. */
export const NAME_MATCH = 0.6;

// ---------------------------------------------------------------------- as classes do OSM
type TagRule = { key: string; values?: readonly string[] };
/**
 * As classes do OSM em que cada tipo de parada se procura (e se confere). A mesma regra vale para os
 * elementos do Overpass (as tags) e para os resultados do Nominatim (a `category`, que é a chave
 * principal do objeto, e o `type`, o valor dela). As duas leituras nem sempre usam a mesma chave: o
 * Lago Negro de Gramado, no Overpass `natural=water` com `water=lake`, volta do Nominatim como
 * `water`/`lake`, e saía da viagem como "não encontrado" (o laboratório do preview da fase 17).
 */
export const KIND_TAGS: Readonly<Record<StopKind, readonly TagRule[]>> = {
  nature: [
    { key: 'natural' },
    // lagos, lagoas, represas: no Nominatim, a classe é a `water`
    { key: 'water' },
    { key: 'waterway', values: ['waterfall'] },
    { key: 'leisure', values: ['park', 'nature_reserve', 'garden'] },
    { key: 'tourism', values: ['viewpoint', 'attraction', 'picnic_site'] },
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
    { key: 'historic' },
    { key: 'tourism', values: ['attraction', 'museum', 'gallery', 'artwork'] },
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

const fitsRule = (tags: Readonly<Record<string, string>>, rule: TagRule) => {
  const value = tags[rule.key];
  return value !== undefined && (!rule.values || rule.values.includes(value));
};
/** O elemento do mapa é do tipo da parada? */
export function fitsKind(kind: StopKind, tags: Readonly<Record<string, string>>): boolean {
  return KIND_TAGS[kind].some((rule) => fitsRule(tags, rule));
}

// ------------------------------------------------------------------------- a consulta
type Target = { day: number; index: number; stop: ImportStop };

/**
 * A consulta do Overpass da conversa inteira: os elementos com nome que tenham alguma das palavras
 * que distinguem os lugares propostos (sem ligar para acento), nas classes dos tipos deles, em volta
 * do centro. Sem palavra que distinga, null (não há o que perguntar).
 */
export function overpassQuery(
  stops: readonly Pick<ImportStop, 'name' | 'kind'>[],
  center: LatLng,
  radiusKm: number,
): string | null {
  const words = [...new Set(stops.flatMap((s) => distinctive(s.name)))].sort();
  if (words.length === 0) return null;
  const regex = words.map(accentless).join('|');
  const rules = new Map<string, TagRule>();
  for (const kind of new Set(stops.map((s) => s.kind))) {
    for (const rule of KIND_TAGS[kind]) {
      rules.set(`${rule.key}=${rule.values?.join('|') ?? '*'}`, rule);
    }
  }
  const around = `(around:${String(Math.round(radiusKm * 1000))},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  const lines = [...rules.values()].map((rule) => {
    const tag = rule.values ? `["${rule.key}"~"^(${rule.values.join('|')})$"]` : `["${rule.key}"]`;
    return `  nwr["name"~"${regex}",i]${tag}${around};`;
  });
  return `[out:json][timeout:20];\n(\n${lines.join('\n')}\n);\nout center tags 400;`;
}

/** Os nomes de um elemento do mapa (o nome, o oficial, o alternativo, o curto). */
const namesOf = (tags: Readonly<Record<string, string>>) =>
  ['name', 'official_name', 'alt_name', 'short_name', 'name:pt']
    .map((k) => tags[k])
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '');

/**
 * O elemento do mapa que é o lugar proposto: do tipo dele, com o nome que o cobre, e, entre os que
 * cobrem igual, o de nome mais parecido e o mais perto do centro.
 */
export function matchElement(
  stop: Pick<ImportStop, 'name' | 'kind'>,
  elements: readonly OsmElement[],
  center: LatLng | null,
): OsmElement | null {
  let best: { el: OsmElement; score: number; exact: boolean; dist: number } | null = null;
  for (const el of elements) {
    if (!fitsKind(stop.kind, el.tags)) continue;
    const names = namesOf(el.tags);
    const score = Math.max(0, ...names.map((n) => nameScore(stop.name, n)));
    if (score < NAME_MATCH) continue;
    const exact = names.some((n) => plain(n).trim() === plain(stop.name).trim());
    const dist = center ? haversineM([center.lng, center.lat], [el.lng, el.lat]) : 0;
    const better =
      !best ||
      score > best.score ||
      (score === best.score && exact && !best.exact) ||
      (score === best.score && exact === best.exact && dist < best.dist);
    if (better) best = { el, score, exact, dist };
  }
  return best?.el ?? null;
}

/** O resultado do Nominatim que é o lugar proposto: o nome que cobre e, quando vem, a classe certa. */
export function matchResult(
  stop: Pick<ImportStop, 'name' | 'kind'>,
  results: readonly SearchResult[],
): SearchResult | null {
  return (
    results.find((r) => {
      if (nameScore(stop.name, r.name) < NAME_MATCH && nameScore(stop.name, r.address) < NAME_MATCH)
        return false;
      return !r.category || !r.type || fitsKind(stop.kind, { [r.category]: r.type });
    }) ?? null
  );
}

// ------------------------------------------------------------------------- a conferência
export async function checkPlaces(
  data: ImportData,
  region: Region,
  deps: CheckDeps,
): Promise<PlaceCheck> {
  const targets: Target[] = data.days.flatMap((day, d) =>
    day.stops.flatMap((stop, index) =>
      NOT_A_PLACE.includes(stop.kind) ? [] : [{ day: d, index, stop }],
    ),
  );
  const found = new Map<Target, LatLng>();
  /** os que já se conferiram, por um ou pelo outro (o progresso) */
  const settled = new Set<Target>();
  const unchecked = new Set<Target>();
  const progress = () => deps.onProgress?.(settled.size, targets.length);
  const confirm = (t: Target, at: LatLng) => {
    if (!found.has(t)) found.set(t, at);
    settled.add(t);
  };
  progress();

  // 1. uma consulta ao Overpass por conversa, que sai já e corre ao lado da fila do Nominatim
  const cut = new AbortController();
  const query = region.center
    ? overpassQuery(
        targets.map((t) => t.stop),
        region.center,
        region.radiusKm,
      )
    : null;
  const overpassRun: Promise<PlaceCheck['overpass']> = query
    ? deps.overpass(query, cut.signal).then(
        (elements) => {
          for (const t of targets) {
            const el = found.has(t) ? null : matchElement(t.stop, elements, region.center);
            if (el) confirm(t, { lat: el.lat, lng: el.lng });
          }
          progress();
          return 'ok';
        },
        // cortado porque o Nominatim confirmou tudo: não fez falta
        () => (cut.signal.aborted ? 'skipped' : 'failed'),
      )
    : Promise.resolve('skipped');

  // 2. o Nominatim, um por vez, para o que nenhum dos dois achou ainda; sem rede, o resto fica sem
  // conferir (o Overpass ainda pode achar)
  let mapDown = false;
  for (const t of targets) {
    if (found.has(t)) continue;
    if (mapDown) {
      unchecked.add(t);
      continue;
    }
    try {
      const query2 = t.stop.address ? `${t.stop.name}, ${t.stop.address}` : t.stop.name;
      const result = matchResult(t.stop, await deps.search(query2, region));
      if (result) confirm(t, { lat: result.lat, lng: result.lng });
    } catch {
      mapDown = true;
      unchecked.add(t);
    }
    settled.add(t);
    progress();
  }

  // 3. com tudo confirmado, o Overpass não faz falta; faltando lugar, ele é esperado (até o prazo)
  if (targets.every((t) => found.has(t))) cut.abort();
  const overpassState = await overpassRun;

  // 4. o roteiro só com o que existe; a missão de um lugar que saiu sai junto
  const gone = new Set(targets.filter((t) => !found.has(t)).map((t) => t.stop));
  const goneNames = new Set([...gone].map((s) => plain(s.name)));
  const days = data.days.map((day, d) => ({
    ...day,
    stops: day.stops.flatMap((stop, index) => {
      if (gone.has(stop)) return [];
      const t = targets.find((x) => x.day === d && x.index === index);
      const at = t ? found.get(t) : undefined;
      return [at ? { ...stop, lat: at.lat, lng: at.lng } : stop];
    }),
  }));
  return {
    data: {
      ...data,
      days,
      quests: data.quests.filter((q) => !q.stop_ref || !goneNames.has(plain(q.stop_ref))),
      reservations: data.reservations.filter(
        (r) => !r.stop_ref || !goneNames.has(plain(r.stop_ref)),
      ),
    },
    confirmed: found.size,
    removed: targets.filter((t) => !found.has(t) && !unchecked.has(t)).map((t) => t.stop.name),
    unchecked: targets.filter((t) => unchecked.has(t) && !found.has(t)).map((t) => t.stop.name),
    overpass: overpassState,
  };
}

/** O centro da região quando não há posição: a cidade que mais aparece nas paradas propostas. */
export function regionCity(data: ImportData): string | null {
  const counts = new Map<string, number>();
  for (const day of data.days) {
    for (const s of day.stops) {
      if (NOT_A_PLACE.includes(s.kind) || !s.address) continue;
      // "Via Trento, 2355, Bento Gonçalves, RS" → "Bento Gonçalves, RS"
      const parts = s.address
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      const city = parts.slice(-2).join(', ');
      if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
