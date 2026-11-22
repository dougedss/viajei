// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo, com a rede dela
import type { Interest, StopKind } from '../../../supabase/functions/_shared/constants.ts';
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import { filled } from '../../lib/text/filled.ts';
import { kindOfGoogleTypes } from '../../../supabase/functions/_shared/google-types.ts';
import {
  GOOGLE_MAX_RADIUS_M,
  isGooglePlace,
  type FindPlacesRequest,
  type Place,
  type PlacesProvider,
  type PlacesRequest,
} from '../../../supabase/functions/_shared/places-schema.ts';
import type {
  DayTime,
  Outing,
  PlanSearchResult,
  StepRelation,
} from '../../../supabase/functions/_shared/plan-search-protocol.ts';
import type {
  PlanContext,
  PlanIntent,
  PlanNamed,
  PlanPending,
  PlanPlaces,
  PlanQuestion,
  PlanWant,
  QuestionTopic,
} from '../../../supabase/functions/_shared/plan-protocol.ts';
import { placesForAi, type Legs, type PlacePick } from './assemble.ts';
import { placeKey, resolvePlace, type PlaceHit, type PlaceQuestion } from './locate.ts';
import { confirmNamed, type NamedState, type SearchResult } from './named.ts';
import { radiusFor, readReach, REACH_QUESTION_TEXT, spanOfReach } from './reach.ts';
import {
  AREA_RADIUS_KM,
  bestOrder,
  corridorArea,
  cuisineRequest,
  DESTINATION_RADIUS_M,
  driveMinutes,
  MAX_RADIUS_KM,
  nightOptions,
  OPTIONS_SHOWN,
  optionsFor,
  optionsRequest,
  suggestionsFor,
  widerRadius,
  type MapOption,
} from './search.ts';
import {
  CLASSIC_CATEGORIES,
  kindOfCategories,
  searchFor,
  suggestionCategories,
  wantsInText,
  type PlaceSearch,
} from './places.ts';

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
  /** a pessoa tirou esta vontade da viagem (fase 25, D278): "Tirar", com desfazer */
  removed?: boolean;
  /**
   * a pessoa procurou pelo nome a partir deste grupo (a busca por tipo não rodou): o desfecho é o do
   * lugar nomeado, e o grupo não fica pendente de novo (fase 25)
   */
  byName?: boolean;
  /** de onde vieram as opções (fase 27): o Google, pelo planejador; sem isto, a Geoapify por tipo */
  provider?: PlacesProvider;
  /** o passo do planejador (fase 27): a ordem e a relação com o resto do passeio (o que a 26 usa) */
  step?: StepInfo;
  /** onde se procurou, em palavras ("em Canoinhas", "perto de onde vocês saem"), no lugar do raio */
  where?: string;
  /** o pendente do planejador: o que foi pedido e não tem lugar, com a pergunta que resolve */
  question?: string;
};

/** O passo do planejador, guardado no grupo (fase 27): o que a fase 26 lê para o passo seguinte. */
export type StepInfo = {
  ordem: number;
  relacao: StepRelation;
  cidade: string;
  hora_do_dia: DayTime;
  /** os candidatos são dos vizinhos: nenhum dentro da cidade dita (a tela diz) */
  fora_da_cidade: boolean;
};

/**
 * Um lugar que a pessoa nomeou: o que o mapa achou, e a escolha dela quando há mais de um. `skip`:
 * nenhum dos candidatos (fica pendente, sem local); `remove`: ela o tirou da viagem (fase 25).
 */
export type NamedEntry = {
  named: PlanNamed;
  state: NamedState;
  pick: number | 'skip' | 'remove' | null;
};

export type MapStage = {
  /** de onde sai e para onde volta: a origem dita, a de antes ou a posição */
  origin: { label: string; at: LngLat } | null;
  groups: OptionGroup[];
  named: NamedEntry[];
  /** os lugares escolhidos, pelo id do mapa */
  chosen: string[];
  /** não deu para saber onde procurar (sem origem, sem área e sem posição) */
  nowhere: boolean;
  /**
   * a cidade dita precisa de escolha antes da busca (fase 25, D276): mais de um candidato plausível,
   * ou só candidatos longe (outro país); a busca só roda depois da escolha
   */
  ask?: PlaceQuestion | null;
};

/** O viés de uma busca pelo nome: a área preferida em volta de um ponto (D276). */
export type GeoBias = { near: { lat: number; lng: number }; radiusKm: number };

export type FlowDeps = {
  /** a `find-places` (por tipo, ou por texto no Google desde a fase 27); o erro traz o `code` */
  findPlaces: (request: FindPlacesRequest) => Promise<Place[]>;
  /** o Nominatim pelo nome; com o viés, a área preferida (um `viewbox` sem `bounded`) */
  geocode: (query: string, bias?: GeoBias) => Promise<SearchResult[]>;
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
  /** o ponto de referência: a posição (com a permissão), ou a origem de antes, geocodificada */
  center: { lat: number; lng: number } | null;
  /** "mudar" em "Saindo de X" (fase 25): a origem que a pessoa escreveu vale acima de tudo */
  originOverride?: string | null;
  /** as cidades que a pessoa escolheu na pergunta da cidade (D276), pela chave do que disse */
  places?: Readonly<Record<string, PlaceHit>>;
  /** a cidade que ela escreveu no lugar do que tinha dito (D283); '' = seguir sem (só a área) */
  renamed?: Readonly<Record<string, string>>;
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
      (q.text === REACH_QUESTION_TEXT
        ? 'reach'
        : q.text === 'De onde vocês saem?'
          ? 'origin'
          : undefined);
    if (topic && a !== '' && out[topic] === undefined) out[topic] = a;
  });
  return out;
}

const at = (r: { lat: number; lng: number }): LngLat => [r.lng, r.lat];

/**
 * A cidade (ou a origem) dita, conferida (fase 25, D276): a escolha que a pessoa já fez vale; senão o
 * geocodificador, com o viés do ponto de referência, e `resolvePlace` decide: um plausível é o lugar;
 * mais de um, ou só candidatos longe, vira a pergunta na tela; nada, null (como `first()` fazia).
 */
async function locate(
  deps: FlowDeps,
  said: string | null,
  role: PlaceQuestion['role'],
  reference: LngLat | null,
  answers: {
    chosen?: Readonly<Record<string, PlaceHit>>;
    renamed?: Readonly<Record<string, string>>;
  },
  depth = 0,
): Promise<{ hit: PlaceHit | null; ask: PlaceQuestion | null }> {
  if (!said) return { hit: null, ask: null };
  const key = placeKey(said);
  const picked = answers.chosen?.[key];
  if (picked) return { hit: picked, ask: null };
  // a pessoa escreveu a cidade no lugar do que tinha dito ("Serra Gaúcha" → "Gramado"), ou disse que
  // segue sem ela (só para onde vai: procurar perto de onde sai), D283
  const renamed = answers.renamed?.[key];
  if (renamed !== undefined && depth < 2) {
    if (renamed.trim() === '') return { hit: null, ask: null };
    return locate(deps, renamed, role, reference, answers, depth + 1);
  }
  const bias = reference
    ? { near: { lat: reference[1], lng: reference[0] }, radiusKm: MAX_RADIUS_KM }
    : undefined;
  const results = await deps.geocode(said, bias).catch(() => null);
  // o mapa fora do ar não é "não existe": segue sem a cidade, como a busca sem rede segue (D228)
  if (results === null) return { hit: null, ask: null };
  const resolved = resolvePlace(results, reference);
  if (resolved.kind === 'found') return { hit: resolved.hit, ask: null };
  return {
    hit: null,
    ask: {
      said,
      role,
      options: resolved.kind === 'unknown' ? [] : resolved.options,
      kind: resolved.kind,
    },
  };
}

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
    // a ordem dos resultados é a da área pedida (os cafés de Pomerode, não os mais perto de casa)
    const byName = deps.findPlaces(optionsRequest(search, center, radiusKm, center));
    const extra = cuisineRequest(search, center, radiusKm);
    const [named, cuisine] = await Promise.all([
      byName,
      extra ? deps.findPlaces(extra).catch(() => []) : Promise.resolve([]),
    ]);
    const options = optionsFor([...named, ...cuisine], search, from, center);
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
  // de onde se sai (fase 25, D271): o que a pessoa disse (no "mudar", no pedido ou na resposta) vale
  // sempre; senão, onde ela está (a posição, nos dois caminhos, com a cidade do reverso); senão a
  // origem de antes. A posição é o ponto de referência de tudo nesta conversa.
  const said = filled(input.originOverride) ?? filled(intent.origin) ?? filled(byTopic.origin);
  const position = !said && input.context.position ? input.center : null;
  const originLabel =
    said ?? (position ? (input.context.place ?? 'onde vocês estão') : input.context.origin);
  const empty = { origin: null, groups: [], named: [], chosen: [], nowhere: false };
  const cityAnswers = {
    ...(input.places ? { chosen: input.places } : {}),
    ...(input.renamed ? { renamed: input.renamed } : {}),
  };
  // a origem pelo nome, conferida com o viés da posição (quando há); a cidade dita, com o viés da
  // origem já resolvida (D276): nunca outro país em silêncio
  const originFound =
    position || !originLabel
      ? { hit: null, ask: null }
      : await locate(
          deps,
          originLabel,
          'origin',
          input.context.position ? at(input.context.position) : null,
          cityAnswers,
        );
  if (originFound.ask) return { ...empty, ask: originFound.ask };
  const originAt = position ? at(position) : originFound.hit ? at(originFound.hit) : null;
  // o nome é o que a pessoa escreveu no lugar do que tinha dito, quando escreveu (D283)
  const renamedTo = (label: string | null) =>
    label === null ? undefined : input.renamed?.[placeKey(label)];
  const originName = filled(renamedTo(originLabel)) ?? originLabel;
  const origin = originAt && originName ? { label: originName, at: originAt } : null;

  const saidArea = intent.area ?? byTopic.area ?? null;
  const areaFound = await locate(
    deps,
    saidArea,
    'area',
    originAt ?? (input.center ? at(input.center) : null),
    cityAnswers,
  );
  if (areaFound.ask) return { ...empty, origin, ask: areaFound.ask };
  const areaHit = areaFound.hit;
  // "sem cidade" ('') tira a área; a cidade escrita é o nome dela
  const renamedArea = renamedTo(saidArea);
  const areaLabel = renamedArea === undefined ? saidArea : filled(renamedArea);
  // o alcance, numa regra só (fase 25, `reach.ts`): o que a IA leu do pedido, ou a resposta à pergunta
  const read = byTopic.reach ? readReach(byTopic.reach) : null;
  const reach = {
    hours: intent.reach_hours ?? read?.hours ?? null,
    span: read?.span ?? spanOfReach(intent.reach),
  };
  const center = areaHit ? at(areaHit) : (originAt ?? (input.center ? at(input.center) : null));
  const centerLabel = areaHit ? areaLabel : originName;
  const radiusKm = areaHit ? AREA_RADIUS_KM : radiusFor(input.kind, reach);
  const from = originAt ?? center;
  if (!center || !from) return { ...empty, origin, nowhere: true };

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
export function pickNamed(stage: MapStage, index: number, pick: NamedEntry['pick']): MapStage {
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

/**
 * "Procurar mais longe": a mesma busca com o dobro do raio. Num grupo do planejador (fase 27), a busca
 * por texto no Google num círculo maior (até os 50 km do Google), sem o filtro da cidade: é o que
 * "mais longe" quer dizer.
 */
export async function widen(stage: MapStage, group: number, deps: FlowDeps): Promise<MapStage> {
  const g = stage.groups[group];
  if (!g) return stage;
  const from = stage.origin?.at ?? g.center;
  if (g.step) {
    const radiusKm = Math.min(GOOGLE_MAX_RADIUS_M / 1000, widerRadius(g.radiusKm));
    const base = {
      ...g,
      radiusKm,
      options: [],
      where: `a até ${String(radiusKm)} km${g.centerLabel ? ` de ${g.centerLabel}` : ''}`,
    };
    let next: OptionGroup;
    try {
      const places = await deps.findPlaces({
        provider: 'google',
        query: g.centerLabel ? `${g.label} em ${g.centerLabel}` : g.label,
        bias: { lng: g.center[0], lat: g.center[1], radius_m: Math.round(radiusKm * 1000) },
        limit: 20,
      });
      const options = optionsFromPlaces(places, from);
      next = { ...base, options, status: options.length > 0 ? 'ok' : 'none' };
    } catch (err) {
      next = { ...base, status: statusOf(err) };
    }
    return { ...stage, groups: stage.groups.map((x, i) => (i === group ? next : x)) };
  }
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

// ------------------------------------------------------------ os três estados (fase 25, D278)
/**
 * Cada coisa que a pessoa pediu (cada vontade e cada nomeado) termina num de três estados, visível na
 * tela: **escolhida** (um lugar do mapa entrou), **pendente** (o mapa não achou, ou ela ainda vai marcar
 * o local: entra na viagem sem coordenada, e a revisão procura de novo) ou **tirada** por ela. Uma
 * vontade com opções em que ela não escolheu nada é "sem escolha": a tela diz, e a viagem não a leva.
 * Nada some em silêncio.
 */
export type Fate = 'chosen' | 'unchosen' | 'pending' | 'removed';

export function groupFate(group: OptionGroup, chosen: readonly string[]): Fate {
  if (group.removed) return 'removed';
  // procurado pelo nome: quem conta é o nomeado (escolhido, pendente ou tirado), não o grupo
  if (group.byName) return 'chosen';
  if (group.status !== 'ok' || group.options.length === 0) return 'pending';
  return group.options.some((o) => chosen.includes(o.place.id)) ? 'chosen' : 'unchosen';
}

export function namedFate(entry: NamedEntry, i: number): Fate {
  if (entry.pick === 'remove') return 'removed';
  return namedPlace(entry, i) ? 'chosen' : 'pending';
}

/** "Tirar" uma vontade da viagem (ou desfazer): o grupo fica, marcado; nada some em silêncio. */
export function removeWant(stage: MapStage, group: number, removed: boolean): MapStage {
  return {
    ...stage,
    groups: stage.groups.map((g, i) => (i === group ? { ...g, removed } : g)),
  };
}

const capital = (s: string) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

/**
 * O que ficou pendente: os nomeados sem lugar no mapa (a D229) e, desde a fase 25, as vontades sem
 * opção que a pessoa não tirou. Entram na viagem sem coordenada, e a tela diz.
 */
export function pendingOf(stage: MapStage): PlanNamed[] {
  const named = stage.named.flatMap((n, i) => (namedFate(n, i) === 'pending' ? [n.named] : []));
  const wants = stage.groups.flatMap((g) =>
    groupFate(g, stage.chosen) === 'pending'
      ? [{ name: capital(g.label), city: g.centerLabel, kind: g.search.kind }]
      : [],
  );
  return [...named, ...wants];
}

/** Os pendentes como dado para a leitura que escreve: o nome, o tipo e por quê. */
export function pendingForAi(stage: MapStage): PlanPending[] {
  const named = stage.named.flatMap((n, i): PlanPending[] => {
    if (namedFate(n, i) !== 'pending') return [];
    const why =
      n.state.kind === 'none' ? 'not_found' : n.state.kind === 'offline' ? 'no_search' : 'unplaced';
    return [{ name: n.named.name, kind: n.named.kind, why }];
  });
  const wants = stage.groups.flatMap((g): PlanPending[] =>
    groupFate(g, stage.chosen) === 'pending'
      ? [
          {
            name: capital(g.label),
            kind: g.search.kind,
            why: g.status === 'none' || g.status === 'ok' ? 'not_found' : 'no_search',
          },
        ]
      : [],
  );
  return [...named, ...wants];
}

/** O resumo antes de seguir ("2 escolhidos · 1 pendente: Feirinha"): cada coisa pedida, num estado. */
export function summaryOf(stage: MapStage): {
  chosen: number;
  unchosen: string[];
  pending: string[];
  removed: string[];
} {
  const fates = [
    ...stage.named.map((n, i) => [namedFate(n, i), n.named.name] as const),
    ...stage.groups.map((g) => [groupFate(g, stage.chosen), capital(g.label)] as const),
  ];
  const of = (fate: Fate) => fates.filter(([f]) => f === fate).map(([, name]) => name);
  return {
    chosen: picksOf(stage).length,
    unchosen: of('unchosen'),
    pending: of('pending'),
    removed: of('removed'),
  };
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
  const { landmarks, classic, liked } = suggestionCategories(likes.interests, likes.learned);
  const found: Place[] = [];
  if (geometry.length >= 2) {
    // os marcos numa busca própria: na de todos juntos, os 20 mais perto do destino eram bustos e
    // casas, e o zoológico ficava de fora (a medição de 16/11)
    const near: PlacesRequest['area'] = {
      type: 'circle',
      lng: destination[0],
      lat: destination[1],
      radius_m: DESTINATION_RADIUS_M,
    };
    const around = { near: { lng: destination[0], lat: destination[1] }, limit: 20 };
    const runs = await Promise.allSettled([
      deps.findPlaces({ categories: landmarks, area: corridorArea(geometry), limit: 20 }),
      deps.findPlaces({ categories: classic, area: corridorArea(geometry), limit: 20 }),
      deps.findPlaces({ categories: landmarks, area: near, ...around }),
      deps.findPlaces({ categories: classic, area: near, ...around }),
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
    places: placesForAi(picks, suggestions, legs, origin !== null, pendingForAi(stage)),
    missing: pendingOf(stage),
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
  /** o grupo de onde a busca pelo nome saiu: o desfecho dele passa a ser o do nomeado (fase 25) */
  group?: number,
): Promise<MapStage> {
  const where = searchArea(stage);
  const trimmed = name.trim();
  if (!where || trimmed.length < 3) return stage;
  // a cidade do lugar a pessoa não disse: a caixa da busca (o raio em volta de onde se procura) já
  // localiza, e a origem não é a cidade dele
  const named: PlanNamed = { name: trimmed, city: null, kind };
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
  return {
    ...stage,
    named: [...stage.named, entry],
    groups: stage.groups.map((g, i) => (i === group ? { ...g, byName: true } : g)),
  };
}

// ------------------------------------------------------------- o planejador (fase 27)
/**
 * Os cartões dos lugares que o planejador achou: na ordem em que a IA os pôs (os melhores primeiro),
 * sem repetir, com o tempo de carro de onde se sai; o tipo do app pelos tipos do Google (ou pelas
 * categorias da Geoapify, na fonte de reserva).
 */
export function optionsFromPlaces(places: readonly Place[], from: LngLat): MapOption[] {
  const seen = new Set<string>();
  const out: MapOption[] = [];
  for (const place of places) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    const km = haversineM(from, [place.lng, place.lat]) / 1000;
    const kind = isGooglePlace(place)
      ? kindOfGoogleTypes(place.categories)
      : kindOfCategories(place.categories);
    out.push({ place, km, minutes: driveMinutes(km), kind });
  }
  return out;
}

/** Onde se procurou, em palavras, pela relação do passo. */
export function whereOf(step: Pick<StepInfo, 'relacao' | 'cidade'>): string {
  switch (step.relacao) {
    case 'na_cidade':
      return step.cidade ? `em ${step.cidade}` : 'na cidade';
    case 'perto_de_casa':
      return 'perto de onde vocês saem';
    case 'perto_do_anterior':
      return 'perto do passo anterior';
    case 'no_caminho':
      return 'no caminho';
    case 'sem_relacao':
      return step.cidade ? `em ${step.cidade}` : '';
  }
}

/**
 * **O app julga** (fase 27): os grupos nascem do passeio que o planejador entregou, um por passo e na
 * ordem dos passos, **só com as referências que existem** nos lugares que as ferramentas devolveram
 * nesta rodada (a referência desconhecida sai e conta em `dropped`); os pendentes entram como grupos
 * sem opção, com a pergunta (os três estados da D278 valem para eles). A IA não acrescenta lugar.
 */
export function stageFromOuting(
  result: Pick<PlanSearchResult, 'lugares' | 'passeio'>,
  origin: MapStage['origin'],
  reference: LngLat | null,
): { stage: MapStage; dropped: number } {
  const from = origin?.at ?? reference;
  const byRef = new Map(result.lugares.map((f) => [f.ref, f.place] as const));
  let dropped = 0;
  const steps = [...result.passeio.passos].sort((a, b) => a.ordem - b.ordem);
  const groups: OptionGroup[] = steps.map((p) => {
    const places = p.candidatos.flatMap((ref) => {
      const place = byRef.get(ref);
      if (!place) dropped += 1;
      return place ? [place] : [];
    });
    const center: LngLat = places[0] ? [places[0].lng, places[0].lat] : (from ?? [0, 0]);
    const options = from ? optionsFromPlaces(places, from) : optionsFromPlaces(places, center);
    const step: StepInfo = {
      ordem: p.ordem,
      relacao: p.relacao,
      cidade: p.cidade,
      hora_do_dia: p.hora_do_dia,
      fora_da_cidade: p.fora_da_cidade,
    };
    const search: PlaceSearch = {
      label: p.o_que,
      kind: options[0]?.kind ?? 'other',
      categories: [],
      names: [],
    };
    return {
      label: p.o_que,
      search,
      status: options.length > 0 ? 'ok' : 'none',
      center,
      centerLabel: p.cidade || null,
      radiusKm: AREA_RADIUS_KM,
      options,
      shown: OPTIONS_SHOWN,
      provider: options[0]?.place.provider ?? 'google',
      step,
      where: whereOf(step),
    };
  });
  for (const pend of result.passeio.pendentes) {
    groups.push({
      label: pend.o_que,
      search: { label: pend.o_que, kind: 'other', categories: [], names: [] },
      status: 'none',
      center: from ?? [0, 0],
      centerLabel: null,
      radiusKm: AREA_RADIUS_KM,
      options: [],
      shown: OPTIONS_SHOWN,
      question: pend.pergunta || `Onde fica ${pend.o_que}?`,
    });
  }
  return {
    stage: { origin, groups, named: [], chosen: [], nowhere: !from && groups.length === 0 },
    dropped,
  };
}

/** As perguntas do planejador que o app ainda vai fazer, dentro do teto, depois das que já tem. */
export function questionsAfter(
  current: readonly PlanQuestion[],
  outing: Pick<Outing, 'perguntas'>,
  max = 3,
): PlanQuestion[] {
  const room = Math.max(0, max - current.length);
  return [...current, ...outing.perguntas.slice(0, room)];
}
