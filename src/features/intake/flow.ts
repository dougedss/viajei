// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo, com a rede dela
import type { Interest, StopKind } from '../../../supabase/functions/_shared/constants.ts';
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import type { Place, PlacesRequest } from '../../../supabase/functions/_shared/places-schema.ts';
import type {
  PlanContext,
  PlanIntent,
  PlanNamed,
  PlanPlaces,
  PlanQuestion,
  PlanWant,
  QuestionTopic,
  Reach,
} from '../../../supabase/functions/_shared/plan-protocol.ts';
import { placesForAi, type Legs, type PlacePick } from './assemble.ts';
import { confirmNamed, type NamedState, type SearchResult } from './named.ts';
import {
  CLASSIC_CATEGORIES,
  searchFor,
  suggestionCategories,
  wantsInText,
  type PlaceSearch,
} from './places.ts';
import {
  AREA_RADIUS_KM,
  bestOrder,
  corridorArea,
  DESTINATION_RADIUS_M,
  nightOptions,
  OPTIONS_SHOWN,
  optionsFor,
  optionsRequest,
  radiusForHours,
  suggestionsFor,
  widerRadius,
  type MapOption,
} from './search.ts';

/**
 * A conversa nova (fase 24), passo a passo, com a rede por injeção (o app liga a `find-places`, o
 * Nominatim e a `route-day`; a medição do laboratório liga as dela): as opções do mapa a partir da
 * vontade, a escolha, o caminho entre as escolhas e as sugestões no corredor dele. A IA não entra
 * aqui: ela leu a vontade antes e escreve a viagem depois, sobre o que este módulo achou.
 */
export type GroupStatus = 'ok' | 'none' | 'no_source' | 'offline' | 'failed' | 'limit';

/** As opções de uma vontade ("café colonial"): os cartões, e o que aconteceu com a busca. */
export type OptionGroup = {
  label: string;
  search: PlaceSearch;
  status: GroupStatus;
  center: LngLat;
  /** "Pomerode": onde se procurou, para "Não achei café colonial a até 2 h de Pomerode" */
  centerLabel: string | null;
  radiusKm: number;
  options: MapOption[];
  /** quantas a tela mostra ("Mais opções" mostra as seguintes) */
  shown: number;
};

/** Um lugar que a pessoa nomeou: o que o mapa achou, e a escolha dela quando há mais de um. */
export type NamedEntry = { named: PlanNamed; state: NamedState; pick: number | 'skip' | null };

export type MapStage = {
  /** de onde sai e para onde volta: a origem dita, a de antes ou a posição */
  origin: { label: string; at: LngLat } | null;
  groups: OptionGroup[];
  named: NamedEntry[];
  /** os lugares escolhidos, pelo id do mapa */
  chosen: string[];
  /** não deu para saber onde procurar (sem origem, sem área e sem posição) */
  nowhere: boolean;
};

export type FlowDeps = {
  /** a `find-places`; o erro traz o `code` (`no_source`, `offline`, `daily_limit`…) */
  findPlaces: (request: PlacesRequest) => Promise<Place[]>;
  geocode: (query: string) => Promise<SearchResult[]>;
  searchNear: (
    query: string,
    center: { lat: number; lng: number },
    radiusKm: number,
  ) => Promise<SearchResult[]>;
  /** a `route-day`; null quando não deu (sem rede, sem cota, sem estrada) */
  route: (
    waypoints: LngLat[],
  ) => Promise<{ geometry: LngLat[]; legs: { distance_m: number; duration_s: number }[] } | null>;
  onProgress?: (done: number, total: number) => void;
};

/** O que a conversa sabe para buscar: a vontade, as respostas, o que o aparelho sabe. */
export type SearchInput = {
  kind: 'plan' | 'today';
  text: string;
  intent: PlanIntent | null;
  questions: readonly PlanQuestion[];
  answers: readonly string[];
  context: Pick<PlanContext, 'origin' | 'position' | 'place'>;
  /** a posição na saída de hoje (só com a permissão do mapa), ou a origem de antes, geocodificada */
  center: { lat: number; lng: number } | null;
};
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

// ----------------------------------------------------------------------------- as respostas
/** A resposta de cada assunto: a das perguntas da IA com `topic`, ou a das perguntas do app. */
export function answersByTopic(
  questions: readonly PlanQuestion[],
  answers: readonly string[],
): Partial<Record<QuestionTopic, string>> {
  const out: Partial<Record<QuestionTopic, string>> = {};
  questions.forEach((q, i) => {
    const a = (answers[i] ?? '').trim();
    const topic: QuestionTopic | undefined =
      q.topic ??
      (q.text === 'Quanto tempo vocês têm?'
        ? 'reach'
        : q.text === 'De onde vocês saem?'
          ? 'origin'
          : undefined);
    if (topic && a !== '' && out[topic] === undefined) out[topic] = a;
  });
  return out;
}

/** "2 horas", "1h30", "meia hora", "40 min": o alcance em horas; null quando não é um tempo. */
export function hoursOf(answer: string): number | null {
  const s = answer
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (s.includes('meia hora')) return 0.5;
  const hm = /(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)\s*(?:e\s*)?(\d{1,2})?/.exec(s);
  if (hm) return Number((hm[1] ?? '0').replace(',', '.')) + Number(hm[2] ?? 0) / 60;
  const m = /(\d+)\s*min/.exec(s);
  if (m) return Number(m[1]) / 60;
  const words: Record<string, number> = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5 };
  const w = /\b(uma|duas|tres|quatro|cinco)\s+horas?\b/.exec(s);
  return w ? (words[w[1] ?? ''] ?? null) : null;
}

/** O alcance da saída de hoje pela resposta à pergunta do app (a mesma regra da D208). */
function reachOfAnswer(answer: string): Reach {
  const s = answer
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (/amanha|dormir|noite fora|pernoit|fim de semana/.test(s)) return 'overnight';
  if (/manha|almoco|pouco|cedo/.test(s)) return 'morning';
  return 'day';
}

/** O raio da D207 quando a pessoa não disse área nem alcance: 50, 120 e 220 km hoje, 200 numa viagem. */
export function defaultRadius(kind: 'plan' | 'today', reach: Reach | null): number {
  if (kind === 'plan' && reach === null) return 200;
  return reach === 'morning' ? 50 : reach === 'overnight' ? 220 : reach === 'day' ? 120 : 200;
}

const at = (r: { lat: number; lng: number }): LngLat => [r.lng, r.lat];
const first = async (deps: FlowDeps, q: string | null) => {
  if (!q) return null;
  const hit = (await deps.geocode(q).catch(() => []))[0];
  return hit ?? null;
};

const statusOf = (err: unknown): GroupStatus => {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'no_source') return 'no_source';
  if (code === 'offline') return 'offline';
  if (code === 'daily_limit' || code === 'provider_quota') return 'limit';
  return 'failed';
};

/** Uma busca de opções: o pedido à função, as opções do que voltou, e o que deu errado. */
async function runGroup(
  deps: FlowDeps,
  label: string,
  search: PlaceSearch,
  center: LngLat,
  centerLabel: string | null,
  radiusKm: number,
  from: LngLat,
): Promise<OptionGroup> {
  const base = { label, search, center, centerLabel, radiusKm, options: [], shown: OPTIONS_SHOWN };
  try {
    const places = await deps.findPlaces(optionsRequest(search, center, radiusKm, from));
    const options = optionsFor(places, search, from);
    return { ...base, options, status: options.length > 0 ? 'ok' : 'none' };
  } catch (err) {
    return { ...base, status: statusOf(err) };
  }
}

/**
 * As opções do mapa: de onde se sai (a origem dita, a resposta, a de antes, ou a posição), onde se
 * procura (a área dita, num raio de 30 km; senão em volta de onde se sai, pelo alcance dito ou pelo da
 * D207), uma busca por vontade (sem vontade nem nome, o clássico de turismo), e cada lugar nomeado
 * conferido no mapa.
 */
export async function searchMap(input: SearchInput, deps: FlowDeps): Promise<MapStage> {
  const intent: PlanIntent = input.intent ?? {
    wants: input.kind === 'today' ? wantsInText(input.text) : [],
    named: [],
    area: null,
    reach: null,
    reach_hours: null,
    when: null,
    origin: null,
  };
  const byTopic = answersByTopic(input.questions, input.answers);
  const originLabel =
    intent.origin ?? byTopic.origin ?? input.context.origin ?? input.context.place;
  // a posição vale na saída de hoje; numa viagem, sai-se da origem
  const position = input.kind === 'today' && input.context.position ? input.center : null;
  const originHit = position ? null : await first(deps, originLabel);
  const originAt = position ? at(position) : originHit ? at(originHit) : null;
  const origin = originAt && originLabel ? { label: originLabel, at: originAt } : null;

  const areaLabel = intent.area ?? byTopic.area ?? null;
  const areaHit = await first(deps, areaLabel);
  const hours = intent.reach_hours ?? (byTopic.reach ? hoursOf(byTopic.reach) : null);
  const reach =
    intent.reach ?? (input.kind === 'today' && byTopic.reach ? reachOfAnswer(byTopic.reach) : null);
  const center = areaHit ? at(areaHit) : (originAt ?? (input.center ? at(input.center) : null));
  const centerLabel = areaHit ? areaLabel : originLabel;
  const radiusKm = areaHit
    ? AREA_RADIUS_KM
    : hours
      ? radiusForHours(hours)
      : defaultRadius(input.kind, reach);
  const from = originAt ?? center;
  if (!center || !from) return { origin, groups: [], named: [], chosen: [], nowhere: true };

  const wants: PlanWant[] = [...intent.wants];
  const named: NamedEntry[] = [];
  const total = wants.length + intent.named.length;
  let done = 0;
  const tick = () => deps.onProgress?.(++done, Math.max(total, 1));
  deps.onProgress?.(0, Math.max(total, 1));

  // os nomeados primeiro: um "Museu Pomerode" que é só um tipo numa cidade vira uma vontade a mais
  for (const n of intent.named) {
    const city = n.city ?? areaLabel;
    const withCity = { ...n, city };
    const state = await confirmNamed(withCity, (q) =>
      deps.searchNear(q, { lat: center[1], lng: center[0] }, Math.max(radiusKm, 60)),
    );
    if (state.kind === 'type') wants.push({ words: n.name, kind: n.kind });
    else named.push({ named: withCity, state, pick: state.kind === 'found' ? 0 : null });
    tick();
  }

  const groups: OptionGroup[] = [];
  for (const want of wants) {
    const search = searchFor(want);
    groups.push(await runGroup(deps, search.label, search, center, centerLabel, radiusKm, from));
    tick();
  }
  if (groups.length === 0 && named.length === 0) {
    // sem tipo e sem nome ("quero passear pela serra"): o clássico de turismo de onde se procura
    const search: PlaceSearch = {
      label: areaLabel ? `o que ver em ${areaLabel}` : 'passeios por perto',
      kind: 'other',
      categories: CLASSIC_CATEGORIES,
      names: [],
    };
    groups.push(await runGroup(deps, search.label, search, center, centerLabel, radiusKm, from));
  }
  return { origin, groups, named, chosen: [], nowhere: false };
}

// ------------------------------------------------------------------------------- a escolha
export function toggleChoice(stage: MapStage, id: string): MapStage {
  const chosen = stage.chosen.includes(id)
    ? stage.chosen.filter((c) => c !== id)
    : [...stage.chosen, id];
  return { ...stage, chosen };
}
export function pickNamed(stage: MapStage, index: number, pick: number | 'skip'): MapStage {
  return { ...stage, named: stage.named.map((n, i) => (i === index ? { ...n, pick } : n)) };
}
export function showMore(stage: MapStage, group: number): MapStage {
  return {
    ...stage,
    groups: stage.groups.map((g, i) =>
      i === group ? { ...g, shown: g.shown + OPTIONS_SHOWN } : g,
    ),
  };
}

/** "Procurar mais longe": a mesma busca com o dobro do raio. */
export async function widen(stage: MapStage, group: number, deps: FlowDeps): Promise<MapStage> {
  const g = stage.groups[group];
  if (!g) return stage;
  const from = stage.origin?.at ?? g.center;
  const next = await runGroup(
    deps,
    g.label,
    g.search,
    g.center,
    g.centerLabel,
    widerRadius(g.radiusKm),
    from,
  );
  return { ...stage, groups: stage.groups.map((x, i) => (i === group ? next : x)) };
}

/** O nomeado que a pessoa escolheu (ou que o mapa achou sozinho), como lugar do mapa. */
function namedPlace(entry: NamedEntry, i: number): Place | null {
  const s = entry.state;
  const hit =
    s.kind === 'found'
      ? s.hit
      : s.kind === 'choice' && typeof entry.pick === 'number'
        ? s.options[entry.pick]
        : null;
  if (!hit) return null;
  return {
    id: `named:${String(i)}`,
    name: hit.name,
    lat: hit.lat,
    lng: hit.lng,
    categories: [],
    city: entry.named.city,
    address: hit.address,
    opening_hours: null,
    website: null,
    osm: null,
    distance_m: null,
  };
}

/** Os lugares que vão para a viagem: as escolhas (`e1`…) e os nomeados confirmados (`n1`…). */
export function picksOf(stage: MapStage): PlacePick[] {
  const options = new Map(
    stage.groups.flatMap((g) => g.options.map((o) => [o.place.id, o] as const)),
  );
  const chosen = stage.chosen.flatMap((id, i): PlacePick[] => {
    const o = options.get(id);
    return o ? [{ ref: `e${String(i + 1)}`, place: o.place, kind: o.kind }] : [];
  });
  const named = stage.named.flatMap((n, i): PlacePick[] => {
    const place = namedPlace(n, i);
    return place ? [{ ref: `n${String(i + 1)}`, place, kind: n.named.kind }] : [];
  });
  return [...named, ...chosen];
}

/** Os nomeados que ficaram sem lugar no mapa: entram na viagem sem coordenada, e a tela diz. */
export function missingNamed(stage: MapStage): PlanNamed[] {
  return stage.named.flatMap((n, i) => (namedPlace(n, i) ? [] : [n.named]));
}

/** Dá para seguir: pelo menos um lugar escolhido, ou um nomeado decidido. */
export function canBuild(stage: MapStage): boolean {
  return (
    picksOf(stage).length > 0 &&
    stage.named.every((n) => n.state.kind !== 'choice' || n.pick !== null)
  );
}

// ---------------------------------------------------------------------------- o caminho
/** O caminho pronto para a leitura que escreve: a ordem, a rota, as sugestões, o que vai para a IA. */
export type Prepared = {
  picks: PlacePick[];
  chosenFractions: number[];
  suggestions: (PlacePick & { detour: number; fraction: number })[];
  legs: Legs | null;
  places: PlanPlaces;
  missing: PlanNamed[];
  /** o destino principal (o mais longe de casa): onde procurar onde dormir, se for preciso */
  destination: LngLat;
  /** a rota real respondeu (senão, linha reta) */
  routed: boolean;
};

/**
 * Da escolha ao caminho: a ordem mais curta, a rota real (a `route-day`) da saída pelas escolhas até
 * casa, ou a linha reta quando ela não responde, e as sugestões no corredor dela e perto do destino
 * (o que a pessoa gosta mais o clássico de turismo), ordenadas pelo desvio.
 */
export async function prepare(
  stage: MapStage,
  likes: { interests: readonly Interest[]; learned: readonly { kind: StopKind }[] },
  deps: FlowDeps,
): Promise<Prepared> {
  const all = picksOf(stage);
  const origin = stage.origin?.at ?? null;
  const start = origin ?? (all[0] ? at(all[0].place) : [0, 0]);
  const order = bestOrder(
    start,
    all.map((p) => at(p.place)),
    origin !== null,
  );
  const picks = order.map((i) => all[i]).filter((p): p is PlacePick => p !== undefined);
  const waypoints: LngLat[] = [
    ...(origin ? [origin] : []),
    ...picks.map((p) => at(p.place)),
    ...(origin ? [origin] : []),
  ];
  const route = waypoints.length >= 2 ? await deps.route(waypoints).catch(() => null) : null;
  const geometry = route?.geometry ?? waypoints;

  // onde cada escolha cai na rota, pelos trechos (a saída no começo e a volta no fim)
  const legs = route?.legs ?? null;
  const total = legs?.reduce((n, l) => n + l.distance_m, 0) ?? 0;
  let acc = 0;
  const chosenFractions = picks.map((_, i) => {
    if (!legs || total === 0) return (i + 1) / (picks.length + 1);
    acc += legs[origin ? i : i - 1]?.distance_m ?? 0;
    return acc / total;
  });

  const destination = picks.reduce<LngLat>(
    (best, p) => (haversineM(start, at(p.place)) > haversineM(start, best) ? at(p.place) : best),
    at(picks[0]?.place ?? { lat: start[1], lng: start[0] }),
  );
  const { categories, liked } = suggestionCategories(likes.interests, likes.learned);
  const found: Place[] = [];
  if (geometry.length >= 2) {
    const runs = await Promise.allSettled([
      deps.findPlaces({ categories, area: corridorArea(geometry), limit: 20 }),
      deps.findPlaces({
        categories,
        area: {
          type: 'circle',
          lng: destination[0],
          lat: destination[1],
          radius_m: DESTINATION_RADIUS_M,
        },
        near: { lng: destination[0], lat: destination[1] },
        limit: 20,
      }),
    ]);
    for (const r of runs) if (r.status === 'fulfilled') found.push(...r.value);
  }
  const suggestions = suggestionsFor(
    found,
    geometry,
    picks.map((p) => p.place),
    liked,
  ).map((s, i) => ({
    ref: `s${String(i + 1)}`,
    place: s.place,
    kind: s.kind,
    detour: s.detour,
    fraction: s.fraction,
  }));
  return {
    picks,
    chosenFractions,
    suggestions,
    legs,
    places: placesForAi(picks, suggestions, legs, origin !== null),
    missing: missingNamed(stage),
    destination,
    routed: route !== null,
  };
}

/** Onde dormir, numa viagem de mais de um dia: as hospedagens perto do destino, como sugestão. */
export async function nightsNear(destination: LngLat, deps: FlowDeps): Promise<PlacePick[]> {
  const places = await deps
    .findPlaces({
      categories: ['accommodation'],
      area: {
        type: 'circle',
        lng: destination[0],
        lat: destination[1],
        radius_m: DESTINATION_RADIUS_M,
      },
      near: { lng: destination[0], lat: destination[1] },
      limit: 20,
    })
    .catch(() => []);
  return nightOptions(places, destination).map((place, i) => ({
    ref: `h${String(i + 1)}`,
    place,
    kind: 'hotel',
  }));
}

/** Onde as buscas acrescentadas procuram: as da primeira vontade, ou em volta de onde se sai. */
function searchArea(
  stage: MapStage,
): { center: LngLat; label: string | null; radiusKm: number } | null {
  const g = stage.groups[0];
  if (g) return { center: g.center, label: g.centerLabel, radiusKm: g.radiusKm };
  return stage.origin
    ? { center: stage.origin.at, label: stage.origin.label, radiusKm: 200 }
    : null;
}

/**
 * "Procurar pelo tipo": o lugar que a pessoa nomeou e o mapa não achou vira a busca das opções do tipo
 * dele ("Café Frohsinn" → os cafés de lá), e ele sai da lista dos nomeados.
 */
export async function addWant(
  stage: MapStage,
  namedIndex: number,
  deps: FlowDeps,
): Promise<MapStage> {
  const entry = stage.named[namedIndex];
  const where = searchArea(stage);
  if (!entry || !where) return stage;
  const search = searchFor({ words: entry.named.name, kind: entry.named.kind });
  // sem o nome no filtro: o nome dito não achou; o tipo dele é o que se busca
  const byType = {
    ...search,
    names: search.names.filter((n) => !entry.named.name.toLowerCase().includes(n)),
  };
  const from = stage.origin?.at ?? where.center;
  const group = await runGroup(
    deps,
    byType.label,
    byType,
    where.center,
    where.label,
    where.radiusKm,
    from,
  );
  return {
    ...stage,
    named: stage.named.filter((_, i) => i !== namedIndex),
    groups: [...stage.groups, group],
  };
}

/** A busca pelo nome, no Nominatim, quando a do mapa por tipo não está ligada (`no_source`). */
export async function addNamed(
  stage: MapStage,
  name: string,
  kind: StopKind,
  deps: FlowDeps,
): Promise<MapStage> {
  const where = searchArea(stage);
  const trimmed = name.trim();
  if (!where || trimmed.length < 3) return stage;
  const named: PlanNamed = { name: trimmed, city: where.label, kind };
  const state = await confirmNamed(named, (q) =>
    deps.searchNear(
      q,
      { lat: where.center[1], lng: where.center[0] },
      Math.max(where.radiusKm, 60),
    ),
  );
  const entry: NamedEntry = {
    named,
    state: state.kind === 'type' ? { kind: 'none' } : state,
    pick: state.kind === 'found' ? 0 : null,
  };
  return { ...stage, named: [...stage.named, entry] };
}
