// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import {
  aboutMinutes,
  driveMinutes,
  radiusForHours,
  ROAD_FACTOR,
  round5,
} from '../../../supabase/functions/_shared/drive.ts';
import {
  cumulativeM,
  haversineM,
  projectOntoLine,
  simplify,
  type LngLat,
} from '../../../supabase/functions/_shared/geo.ts';
import type {
  FindPlacesRequest,
  Place,
  PlacesArea,
  PlacesRequest,
} from '../../../supabase/functions/_shared/places-schema.ts';
import { PLACES_MAX_LINE_POINTS } from '../../../supabase/functions/_shared/places-schema.ts';
import {
  inFamily,
  kindOfCategories,
  LANDMARK_CATEGORIES,
  NOT_SUGGESTED,
  placeFits,
  plain,
  type PlaceSearch,
} from './places.ts';

/**
 * As contas da busca no mapa (fase 24), puras: o alcance, o tempo de carro estimado das opções, a
 * ordem do caminho entre as escolhas, o corredor da rota e as sugestões ordenadas pelo desvio. Tudo é
 * estimativa e a tela diz "cerca de"; a rota real (a `route-day`) só para o que foi escolhido.
 */

// ----------------------------------------------------------------- o tempo de carro estimado
// a conta mora em `_shared/drive.ts` desde a fase 27: a ferramenta `tempo_de_carro` do planejador usa
// a mesma estimativa dos cartões
export { aboutMinutes, driveMinutes, radiusForHours, ROAD_FACTOR };

/** "2 h", "40 min": o alcance de uma busca, para "Não achei café colonial a até 2 h de Pomerode". */
export function reachLabel(radiusKm: number): string {
  const minutes = driveMinutes(radiusKm);
  if (minutes < 60) return `${String(minutes)} min`;
  const h = Math.round(minutes / 30) / 2;
  return `${String(h).replace('.', ',')} h`;
}

// ------------------------------------------------------------------------------ o alcance
/** A área que a pessoa disse ("em Pomerode"): procura em volta dela, não do estado inteiro. */
export const AREA_RADIUS_KM = 30;
/** "Procurar mais longe": o dobro, até o teto da função. */
export const MAX_RADIUS_KM = 400;
export const widerRadius = (km: number): number => Math.min(MAX_RADIUS_KM, km * 2);

// ------------------------------------------------------------------------------ as opções
/**
 * Uma opção do mapa num cartão: o lugar como está no mapa, a distância e o tempo estimado de onde se
 * sai e, num passo seguinte (fase 26), o que o lugar acrescenta ao passeio: a distância do lugar
 * escolhido no passo anterior e o desvio (ir do anterior ao candidato e dele ao próximo ponto fixo,
 * menos ir direto), em minutos, pela mesma estimativa.
 */
export type MapOption = {
  place: Place;
  km: number;
  minutes: number;
  kind: StopKind;
  fromPrevious?: { name: string; km: number; minutes: number };
  detour?: number;
};

/** Quantas opções a tela mostra de cada vez; "Mais opções" mostra as seguintes. */
export const OPTIONS_SHOWN = 6;
/** Dois resultados com o mesmo nome a menos disto são o mesmo lugar (o restaurante e o prédio). */
const SAME_PLACE_M = 300;

/**
 * As opções de uma vontade: só os lugares cujo nome tem a palavra que se buscou (a Places filtra por
 * nome de um jeito que pode ser largo), sem repetir o mesmo lugar, os mais perto de onde se sai
 * primeiro, com o tempo de carro estimado.
 */
export function optionsFor(
  places: readonly Place[],
  search: PlaceSearch,
  from: LngLat,
  /** de onde se ordena: a área pedida ("em Pomerode"), ou de onde se sai */
  sortFrom: LngLat = from,
): MapOption[] {
  const out: (MapOption & { order: number })[] = [];
  for (const place of places) {
    if (!placeFits(search, place)) continue;
    const dup = out.some(
      (o) =>
        plain(o.place.name) === plain(place.name) &&
        haversineM([o.place.lng, o.place.lat], [place.lng, place.lat]) < SAME_PLACE_M,
    );
    if (dup || out.some((o) => o.place.id === place.id)) continue;
    const km = haversineM(from, [place.lng, place.lat]) / 1000;
    const order = haversineM(sortFrom, [place.lng, place.lat]);
    out.push({ place, km, minutes: driveMinutes(km), kind: search.kind, order });
  }
  return out
    .sort((a, b) => a.order - b.order)
    .map((o) => ({ place: o.place, km: o.km, minutes: o.minutes, kind: o.kind }));
}

/**
 * A coordenada que sai do aparelho para a busca (fase 24): arredondada a duas casas (uns 1 km), como a
 * posição da saída de hoje (D208). Para achar os cafés de uma cidade, 1 km não muda nada; a posição
 * exata da pessoa não vai para a Geoapify.
 */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A busca a mais pela cozinha (o café colonial sem "colonial" no nome): as categorias dela, sem nome,
 * no mesmo círculo; o que vale é decidido pela cozinha (`placeFits`).
 */
export function cuisineRequest(
  search: PlaceSearch,
  center: LngLat,
  radiusKm: number,
): PlacesRequest | null {
  if (!search.cuisine) return null;
  return {
    ...optionsRequest({ ...search, names: [] }, center, radiusKm, center),
    categories: [...search.cuisine.categories],
  };
}

/** O pedido de uma busca de opções: as categorias, as palavras, o círculo e a proximidade. */
export function optionsRequest(
  search: PlaceSearch,
  center: LngLat,
  radiusKm: number,
  near: LngLat,
): PlacesRequest {
  return {
    categories: [...search.categories],
    names: search.names.slice(0, 3),
    area: {
      type: 'circle',
      lng: round2(center[0]),
      lat: round2(center[1]),
      radius_m: Math.round(radiusKm * 1000),
    },
    near: { lng: round2(near[0]), lat: round2(near[1]) },
    limit: 20,
  };
}

// ------------------------------------------------------------------------ a ordem do caminho
/**
 * A ordem das escolhas que faz o caminho mais curto, saindo de `origin` e terminando em `end` (casa,
 * por padrão; em linha reta): todas as ordens até sete lugares (5.040), e o mais perto primeiro acima
 * disso. A rota real vem depois, nessa ordem. Desde a fase 26 só ordena o que ficou sem ordem (as
 * escolhas de um mesmo passo entre si; os nomeados sem passo): a ordem dos passos é a da pessoa.
 */
export function bestOrder(
  origin: LngLat,
  points: readonly LngLat[],
  roundTrip = true,
  end: LngLat = origin,
): number[] {
  const n = points.length;
  const d = (a: LngLat, b: LngLat) => haversineM(a, b);
  const cost = (order: readonly number[]) => {
    let total = 0;
    let at = origin;
    for (const i of order) {
      const p = points[i] ?? at;
      total += d(at, p);
      at = p;
    }
    return roundTrip ? total + d(at, end) : total;
  };
  const ids = points.map((_, i) => i);
  if (n <= 1) return ids;
  if (n > 7) {
    const left = new Set(ids);
    const order: number[] = [];
    let at = origin;
    while (left.size > 0) {
      let best = -1;
      for (const i of left) {
        if (best < 0 || d(at, points[i] ?? at) < d(at, points[best] ?? at)) best = i;
      }
      order.push(best);
      left.delete(best);
      at = points[best] ?? at;
    }
    return order;
  }
  let best = ids;
  let bestCost = cost(ids);
  const permute = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) {
      const c = cost(prefix);
      if (c < bestCost - 1e-6) {
        best = prefix;
        bestCost = c;
      }
      return;
    }
    rest.forEach((x, i) => permute([...prefix, x], [...rest.slice(0, i), ...rest.slice(i + 1)]));
  };
  permute([], ids);
  return best;
}

// ------------------------------------------------------------------- o corredor e as sugestões
/** A faixa em volta da rota: uns 8 km de cada lado, cerca de 10 min de desvio numa estrada. */
export const CORRIDOR_BUFFER_M = 8_000;
/** E o que fica perto do destino, num círculo em volta dele. */
export const DESTINATION_RADIUS_M = 15_000;
/** A linha do corredor é a rota simplificada a 300 m (pouco mais de cem pontos numa viagem de um dia). */
export const CORRIDOR_TOLERANCE_M = 300;

/** A rota como linha do corredor, dentro do limite de pontos da função. */
export function corridorLine(geometry: readonly LngLat[]): LngLat[] {
  let tolerance = CORRIDOR_TOLERANCE_M;
  let line = simplify(geometry, tolerance);
  while (line.length > PLACES_MAX_LINE_POINTS) {
    tolerance *= 2;
    line = simplify(geometry, tolerance);
  }
  // a ~100 m: a faixa é de 8 km, e a ponta da linha (a saída) não leva a posição exata da pessoa
  return line.map(([lng, lat]) => [Math.round(lng * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3]);
}

export function corridorArea(geometry: readonly LngLat[]): PlacesArea {
  return { type: 'corridor', line: corridorLine(geometry), buffer_m: CORRIDOR_BUFFER_M };
}

/** O desvio do carro até um lugar fora da rota e de volta, por estimativa, em minutos. */
const DETOUR_KMH = 45;
export function detourMinutes(offRouteM: number): number {
  return round5(((2 * (offRouteM / 1000) * ROAD_FACTOR) / DETOUR_KMH) * 60);
}

/** Uma sugestão: o lugar do mapa, o desvio estimado e onde ele cai na rota (para entrar na ordem). */
export type Suggestion = {
  place: Place;
  kind: StopKind;
  detour: number;
  /** a fração da rota em que ele cai (de 0 a 1): o lugar dele na ordem do caminho */
  fraction: number;
  liked: boolean;
  /** um marco (zoológico, museu, mirante…): vale o desvio para qualquer pessoa */
  landmark: boolean;
};

/** No máximo seis sugestões, nunca uma lista para rolar; duas de cada tipo, para não serem seis museus. */
export const MAX_SUGGESTIONS = 6;
const MAX_PER_KIND = 2;
/** Mais que isto de desvio já não é "no caminho". */
export const MAX_DETOUR_MIN = 30;
/** Um lugar que a pessoa gosta vale como estar uns 10 min mais perto; um marco também. */
const LIKED_BONUS_MIN = 10;
const LANDMARK_BONUS_MIN = 10;

/**
 * As sugestões no caminho: os lugares do corredor e de perto do destino, menos o que a pessoa já
 * escolheu (e o que é o mesmo lugar dele), ordenados pelo desvio e pela semelhança com o gosto dela,
 * no máximo dois por tipo e seis no total. O desvio é a distância ao traçado vezes o fator de estrada,
 * ida e volta: uma estimativa, dita como "cerca de".
 */
export function suggestionsFor(
  places: readonly Place[],
  route: readonly LngLat[],
  chosen: readonly Pick<Place, 'id' | 'lat' | 'lng'>[],
  liked: ReadonlySet<string>,
  max = MAX_SUGGESTIONS,
): Suggestion[] {
  if (route.length < 2) return [];
  const cum = cumulativeM(route);
  const seen = new Set<string>();
  const candidates: Suggestion[] = [];
  for (const place of places) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    const at: LngLat = [place.lng, place.lat];
    const isChosen = chosen.some(
      (c) => c.id === place.id || haversineM([c.lng, c.lat], at) < SAME_PLACE_M,
    );
    if (isChosen) continue;
    // um busto ou um túmulo não é um desvio que se sugere
    if (place.categories.some((c) => NOT_SUGGESTED.some((f) => inFamily(c, f)))) continue;
    if (candidates.some((s) => plain(s.place.name) === plain(place.name))) continue;
    const p = projectOntoLine(route, cum, at);
    const detour = detourMinutes(p.distance_m);
    if (detour > MAX_DETOUR_MIN) continue;
    candidates.push({
      place,
      kind: kindOfCategories(place.categories),
      detour,
      fraction: p.fraction,
      liked: place.categories.some((c) => liked.has(c)),
      landmark: place.categories.some((c) => LANDMARK_CATEGORIES.some((f) => inFamily(c, f))),
    });
  }
  const score = (s: Suggestion) =>
    s.detour - (s.liked ? LIKED_BONUS_MIN : 0) - (s.landmark ? LANDMARK_BONUS_MIN : 0);
  const out: Suggestion[] = [];
  const perKind = new Map<StopKind, number>();
  for (const s of [...candidates].sort((a, b) => score(a) - score(b) || a.detour - b.detour)) {
    const n = perKind.get(s.kind) ?? 0;
    if (n >= MAX_PER_KIND) continue;
    perKind.set(s.kind, n + 1);
    out.push(s);
    if (out.length === max) break;
  }
  return out;
}

/** Onde dormir: até duas hospedagens perto do destino, as mais perto (a pernoite vira sugestão). */
export const NIGHT_OPTIONS = 2;
export function nightOptions(places: readonly Place[], destination: LngLat): Place[] {
  return [...places]
    .sort(
      (a, b) => haversineM(destination, [a.lng, a.lat]) - haversineM(destination, [b.lng, b.lat]),
    )
    .slice(0, NIGHT_OPTIONS);
}

// ------------------------------------------------------------------------------- o cache
/** Uma busca guardada vale uns dias: os lugares mudam devagar, e reabrir a conversa não gasta crédito. */
export const PLACES_CACHE_DAYS = 7;
const r2 = (n: number) => n.toFixed(2);

/**
 * A chave do cache de uma busca: as categorias e as palavras em ordem, o círculo e a proximidade
 * arredondados a ~1 km, e a linha do corredor a ~100 m. A mesma busca de outra hora cai na mesma
 * chave; a posição exata da pessoa nunca é a chave (é arredondada). A busca por texto no Google
 * (fase 27) tem a chave pelas palavras e pelo círculo, com o mesmo arredondamento.
 */
export function placesKey(req: FindPlacesRequest, hash: (s: string) => string): string {
  if ('provider' in req) {
    const bias = req.bias
      ? `c:${r2(req.bias.lng)},${r2(req.bias.lat)},${String(Math.round(req.bias.radius_m / 1000))}`
      : '-';
    return [
      'google',
      plain(req.query),
      bias,
      req.type ?? '-',
      req.open_now ? 'aberto' : '-',
      String(req.min_rating ?? 0),
      req.rank ?? 'relevance',
      String(req.limit ?? 20),
    ].join('|');
  }
  const area =
    req.area.type === 'circle'
      ? `c:${r2(req.area.lng)},${r2(req.area.lat)},${String(Math.round(req.area.radius_m / 1000))}`
      : `l:${hash(req.area.line.map(([lng, lat]) => `${lng.toFixed(3)},${lat.toFixed(3)}`).join(';'))},${String(req.area.buffer_m)}`;
  const near = req.near ? `${r2(req.near.lng)},${r2(req.near.lat)}` : '-';
  return [
    'places',
    [...req.categories].sort().join(','),
    [...(req.names ?? [])].map(plain).sort().join(','),
    area,
    near,
    String(req.limit ?? 20),
  ].join('|');
}

export function placesFresh(fetchedAt: string, now: number): boolean {
  return now - Date.parse(fetchedAt) < PLACES_CACHE_DAYS * 86_400_000;
}
