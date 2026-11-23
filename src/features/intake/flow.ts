// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo, com a rede dela
import type { Interest, StopKind } from '../../../supabase/functions/_shared/constants.ts';
import {
  DRIVE_MAX_PAIRS,
  driveKey,
  measuredMinutes,
  missingPairs,
  samePoint,
  tableAmong,
  tableOf,
  type DriveTable,
  type DriveTime,
} from '../../../supabase/functions/_shared/drive-schema.ts';
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import { filled } from '../../lib/text/filled.ts';
import { inCity, withinCity } from '../../../supabase/functions/_shared/google-places.ts';
import { kindOfGoogleTypes } from '../../../supabase/functions/_shared/google-types.ts';
import {
  GOOGLE_MAX_RADIUS_M,
  isGooglePlace,
  type FindPlacesRequest,
  type GooglePlacesRequest,
  type Place,
  type PlacesProvider,
  type PlacesRequest,
} from '../../../supabase/functions/_shared/places-schema.ts';
import type {
  DayTime,
  Outing,
  PlanSearchResult,
  StepRelation,
  StepSearch,
} from '../../../supabase/functions/_shared/plan-search-protocol.ts';
import {
  cityCircle,
  nearCircle,
  routeCircles,
  type Circle,
  type Point,
} from '../../../supabase/functions/_shared/search-circles.ts';
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
import { dwellOf, placesForAi, type Legs, type PlacePick } from './assemble.ts';
import { placeKey, resolvePlace, type PlaceHit, type PlaceQuestion } from './locate.ts';
import { outingAccount, type OutingAccount } from './outing-time.ts';
import { confirmNamed, type NamedState, type SearchResult } from './named.ts';
import { radiusFor, readReach, REACH_QUESTION_TEXT, spanOfReach } from './reach.ts';
import {
  AREA_RADIUS_KM,
  bestOrder,
  corridorArea,
  cuisineRequest,
  DESTINATION_RADIUS_M,
  MAX_DETOUR_MIN,
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
export type GroupStatus =
  | 'ok'
  | 'none'
  | 'no_source'
  | 'offline'
  | 'failed'
  | 'limit'
  /** o passo seguinte ainda não foi procurado (fase 26): a busca roda quando chega a vez dele */
  | 'unsearched';

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
  /** como procurar este passo (fase 26): as palavras, o tipo, o aberto agora, a nota mínima */
  busca?: StepSearch;
  /** o centro que não depende da escolha anterior: a cidade resolvida, ou o destino (fase 26) */
  centro?: Point | null;
  /** quantos candidatos a IA deixou de fora por não serem do tipo pedido (fase 26) */
  descartados?: number;
  /** a hora exata que a pessoa disse para estar no lugar deste passo, "HH:MM" (D311) */
  hora?: string;
  /** os minutos no lugar que a pessoa disse ou deixou claro ("buscar" são 15), D312; 0: não disse */
  permanencia?: number;
};

/** Por que a medição do tempo de carro não respondeu (a tela diz, e oferece tentar de novo). */
export type DriveStatus = 'offline' | 'limit' | 'no_source' | 'failed';

/** A relação depende do lugar escolhido no passo anterior: a busca só pode rodar quando chegar a vez. */
export const dependsOnPrevious = (relacao: StepRelation): boolean =>
  relacao === 'perto_do_anterior' || relacao === 'no_caminho' || relacao === 'sem_relacao';

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
  /**
   * o passo da vez (fase 26): o índice em `groups` do passo que a tela mostra; os seguintes só aparecem
   * depois da escolha dele. Ausente numa conversa de antes (todos os grupos à vista)
   */
  step?: number;
  /** a cidade de destino dita ("vou pra Joinville"), com a coordenada: entra como parada (fase 26, a 3.4) */
  destination?: { name: string; at: LngLat } | null;
  /** o aviso de "Voltar um passo": as opções do passo seguinte vão ser procuradas de novo */
  notice?: string | null;
  /**
   * os tempos de carro medidos pelo Google (D310), por par de pontos, em segundos (`null`: sem estrada).
   * É de onde saem o "X min de carro" dos cartões e a estrada da conta; o par que não está aqui não foi
   * medido, e a tela não mostra tempo para ele
   */
  drive?: Record<string, number | null>;
  /** a medição não respondeu: por quê; a tela diz e oferece tentar de novo (null: respondeu) */
  driveStatus?: DriveStatus | null;
  /** os minutos em cada lugar que a pessoa mudou na tela, pelo id do lugar (D312) */
  dwell?: Record<string, number>;
  /** a hora de sair de casa que a pessoa disse, "HH:MM" (D311); null quando não disse */
  departure?: string | null;
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
  /**
   * a `drive-times` (D310): o tempo de carro que o Google mediu em cada par, na ordem dos pares (`null`
   * no par sem estrada); o erro traz o `code`, como o da `find-places`
   */
  drive: (pairs: readonly (readonly [LngLat, LngLat])[]) => Promise<(DriveTime | null)[]>;
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

/** Um lugar que vai para a viagem e de onde ele veio: a escolha de um passo, o nomeado, ou o destino. */
export type PickSlot = {
  pick: PlacePick;
  /** o índice do grupo do passo (as escolhas); null nos nomeados e no destino */
  group: number | null;
  /** a posição do passo na ordem dita; null no que não tem passo */
  position: number | null;
  kind: 'choice' | 'named' | 'destination';
};

/** O destino dito ("vou pra Joinville") como lugar do mapa: a parada de cidade (fase 26, a 3.4). */
function destinationPlace(d: NonNullable<MapStage['destination']>): Place {
  return {
    id: `destination:${d.name}`,
    name: d.name,
    lat: d.at[1],
    lng: d.at[0],
    categories: ['locality'],
    city: d.name,
    address: null,
    opening_hours: null,
    website: null,
    osm: null,
    distance_m: null,
  };
}

/** Os índices dos grupos que são passos do planejador, na ordem dita. */
export function stepGroups(stage: Pick<MapStage, 'groups'>): number[] {
  return stage.groups
    .map((g, i) => (g.step ? { i, ordem: g.step.ordem } : null))
    .filter((x): x is { i: number; ordem: number } => x !== null)
    .sort((a, b) => a.ordem - b.ordem)
    .map((x) => x.i);
}

const sameName = (a: string, b: string) =>
  a
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') ===
  b
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/**
 * Onde a parada do destino entra entre os passos: depois do último passo "no caminho" (o caminho é
 * até ele); sem um, antes do primeiro passo que é na cidade do destino; sem nenhum dos dois, depois de
 * todos os passos. Devolve a posição (0 = antes de tudo).
 */
export function destinationPosition(stage: Pick<MapStage, 'groups' | 'destination'>): number {
  const steps = stepGroups(stage).map((i) => stage.groups[i]?.step);
  const lastOnRoute = steps.reduce((at, st, i) => (st?.relacao === 'no_caminho' ? i + 1 : at), -1);
  if (lastOnRoute >= 0) return lastOnRoute;
  const inCity = steps.findIndex(
    (st) => st !== undefined && stage.destination && sameName(st.cidade, stage.destination.name),
  );
  return inCity >= 0 ? inCity : steps.length;
}

/**
 * A cidade de destino dita vira parada? Só quando **nenhum lugar escolhido fica nela** (a correção de
 * 22/11/2026, revê a D304): "vou pra Joinville" sem lugar em Joinville tem a cidade como parada; em
 * "buscar sushi em Canoinhas" a cidade é só onde o sushi fica, e uma parada "Canoinhas" de 1 h 30 antes
 * dele era um lugar que a pessoa não pediu. A cidade do lugar é a do endereço dele no mapa.
 */
export function destinationIsStop(
  stage: Pick<MapStage, 'groups' | 'named' | 'chosen' | 'destination'>,
): boolean {
  const destination = stage.destination;
  if (!destination) return false;
  const inside = (place: Pick<Place, 'city'>) => inCity(place, destination.name);
  const chosenThere = stage.groups.some((g) =>
    g.options.some((o) => stage.chosen.includes(o.place.id) && inside(o.place)),
  );
  const namedThere = stage.named.some((n, i) => {
    const place = namedPlace(n, i);
    return place !== null && inside(place);
  });
  return !chosenThere && !namedThere;
}

/** "Mudar" o tempo num lugar (D312): os minutos que a pessoa escolheu valem acima do dito e do padrão. */
export function setDwell(stage: MapStage, placeId: string, minutes: number): MapStage {
  return { ...stage, dwell: { ...stage.dwell, [placeId]: Math.max(0, Math.round(minutes)) } };
}

/**
 * Os lugares que vão para a viagem, com a origem de cada um: as escolhas (`e1`…, pelos passos na ordem
 * dita quando o planejador os deu, senão na ordem do toque), o destino como parada de cidade quando
 * nenhuma escolha fica nele (também uma `e`: a `plan-trip` só aceita `e`, `n` e `s`) e os nomeados
 * confirmados (`n1`…). Cada um leva o tempo no lugar que a pessoa disse ou mudou (D312) e, nas escolhas
 * de um passo com hora dita, a hora (D311).
 */
export function pickSlots(stage: MapStage): PickSlot[] {
  // os minutos no lugar: o que a pessoa mudou na tela, senão o que ela disse no pedido (0: não disse)
  const stay = (id: string, said?: number): { dwell?: number } => {
    const minutes = stage.dwell?.[id] ?? (said !== undefined && said > 0 ? said : undefined);
    return minutes === undefined ? {} : { dwell: minutes };
  };
  const options = new Map(
    stage.groups.flatMap((g, i) => g.options.map((o) => [o.place.id, { o, group: i }] as const)),
  );
  const steps = stepGroups(stage);
  const positionOf = (group: number) => {
    const at = steps.indexOf(group);
    return at >= 0 ? at : null;
  };
  // as escolhas: pelos passos quando há passos (a ordem dita), senão na ordem do toque
  const chosenIds =
    steps.length > 0
      ? [
          ...steps.flatMap((gi) => stage.chosen.filter((id) => options.get(id)?.group === gi)),
          ...stage.chosen.filter((id) => {
            const g = options.get(id)?.group;
            return g === undefined || !steps.includes(g);
          }),
        ]
      : stage.chosen;
  const choices: PickSlot[] = chosenIds.flatMap((id, i) => {
    const hit = options.get(id);
    if (!hit) return [];
    const step = stage.groups[hit.group]?.step;
    const dayTime = step?.hora_do_dia;
    return [
      {
        pick: {
          ref: `e${String(i + 1)}`,
          place: hit.o.place,
          kind: hit.o.kind,
          ...(dayTime ? { dayTime } : {}),
          ...stay(id, step?.permanencia),
          ...(step?.hora ? { atTime: step.hora } : {}),
        },
        group: hit.group,
        position: positionOf(hit.group),
        kind: 'choice' as const,
      },
    ];
  });
  const destination: PickSlot[] =
    stage.destination && destinationIsStop(stage)
      ? [
          {
            pick: {
              ref: `e${String(choices.length + 1)}`,
              place: destinationPlace(stage.destination),
              kind: 'city',
              ...stay(`destination:${stage.destination.name}`),
            },
            group: null,
            position: destinationPosition(stage),
            kind: 'destination' as const,
          },
        ]
      : [];
  const named: PickSlot[] = stage.named.flatMap((n, i) => {
    const place = namedPlace(n, i);
    return place
      ? [
          {
            pick: { ref: `n${String(i + 1)}`, place, kind: n.named.kind, ...stay(place.id) },
            group: null,
            position: null,
            kind: 'named' as const,
          },
        ]
      : [];
  });
  return [...named, ...choices, ...destination];
}

/** Os lugares que vão para a viagem: as escolhas (`e1`…), o destino e os nomeados confirmados (`n1`…). */
export function picksOf(stage: MapStage): PlacePick[] {
  return pickSlots(stage).map((s) => s.pick);
}

const withoutTime = (pick: PlacePick): PlacePick => {
  const rest = { ...pick };
  delete rest.atTime;
  return rest;
};

/**
 * A ordem final (fase 26, revê a D230): a dos passos, como a pessoa disse; `bestOrder` só ordena o que
 * ficou sem ordem (as escolhas de um mesmo passo entre si, do ponto anterior ao próximo ponto fixo; os
 * nomeados sem passo, no fim, do último ponto a casa). Sem passos (a conversa de antes), o caminho
 * mais curto de tudo, como a D230.
 */
export function orderedPicks(stage: MapStage, start: LngLat | null): PlacePick[] {
  const slots = pickSlots(stage);
  const home = stage.origin?.at ?? null;
  const from = start ?? home ?? (slots[0] ? at(slots[0].pick.place) : null);
  if (!from) return slots.map((s) => s.pick);
  const steps = stepGroups(stage);
  if (steps.length === 0) {
    const all = slots.map((s) => s.pick);
    const order = bestOrder(
      from,
      all.map((p) => at(p.place)),
      home !== null,
    );
    return order.map((i) => all[i]).filter((p): p is PlacePick => p !== undefined);
  }
  const out: PlacePick[] = [];
  let cursor = from;
  const destinationAt = destinationPosition(stage);
  const destination = slots.find((s) => s.kind === 'destination');
  const nextFixed = (position: number): LngLat =>
    destination && destinationAt > position ? at(destination.pick.place) : (home ?? cursor);
  for (let position = 0; position <= steps.length; position++) {
    if (destination && destinationAt === position) {
      out.push(destination.pick);
      cursor = at(destination.pick.place);
    }
    if (position === steps.length) break;
    const mine = slots.filter((s) => s.kind === 'choice' && s.position === position);
    if (mine.length === 0) continue;
    const order =
      mine.length > 1
        ? bestOrder(
            cursor,
            mine.map((s) => at(s.pick.place)),
            true,
            nextFixed(position),
          )
        : [0];
    for (const [n, i] of order.entries()) {
      const slot = mine[i];
      if (!slot) continue;
      // a hora dita é a de chegar ao passo: vale para o primeiro lugar dele, não para os seguintes
      out.push(n === 0 ? slot.pick : withoutTime(slot.pick));
      cursor = at(slot.pick.place);
    }
  }
  // o que ficou sem ordem (os nomeados sem passo): do último ponto a casa, pelo caminho mais curto
  const loose = slots.filter((s) => s.kind === 'named');
  if (loose.length > 0) {
    const order = bestOrder(
      cursor,
      loose.map((s) => at(s.pick.place)),
      home !== null,
      home ?? cursor,
    );
    for (const i of order) {
      const slot = loose[i];
      if (slot) out.push(slot.pick);
    }
  }
  return out;
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
  destination: string | null;
} {
  const fates = [
    ...stage.named.map((n, i) => [namedFate(n, i), n.named.name] as const),
    ...stage.groups.map((g) => [groupFate(g, stage.chosen), capital(g.label)] as const),
  ];
  const of = (fate: Fate) => fates.filter(([f]) => f === fate).map(([, name]) => name);
  return {
    // o destino não é uma escolha: vai dito à parte, e só quando é uma parada (nenhuma escolha nele)
    chosen: pickSlots(stage).filter((s) => s.kind !== 'destination').length,
    unchosen: of('unchosen'),
    pending: of('pending'),
    removed: of('removed'),
    destination: destinationIsStop(stage) ? (stage.destination?.name ?? null) : null,
  };
}

/**
 * Dá para seguir: pelo menos um lugar escolhido (ou o destino dito), os nomeados decididos e, no passo
 * a passo (fase 26), o último passo feito (escolhido, pendente ou tirado): o resumo e "Traçar o
 * caminho" só no fim.
 */
export function canBuild(stage: MapStage): boolean {
  return (
    picksOf(stage).length > 0 &&
    stage.named.every((n) => n.state.kind !== 'choice' || n.pick !== null) &&
    stepsDone(stage)
  );
}

// ---------------------------------------------------------------------------- o caminho
/** O caminho pronto para a leitura que escreve: a ordem, a rota, as sugestões, o que vai para a IA. */
export type Prepared = {
  picks: PlacePick[];
  chosenFractions: number[];
  /** o desvio é o medido (D310); null quando a medição não respondeu: a revisão não mostra número */
  suggestions: (PlacePick & { detour: number | null; fraction: number })[];
  /** os trechos por índice: só num caminho guardado antes da D310 (o novo traz `drive`) */
  legs: Legs | null;
  /**
   * os tempos de carro medidos, por par de pontos (D310): os trechos do caminho e os de cada sugestão
   * (para o desvio, e para a revisão refazer os horários quando a pessoa liga uma). O trecho que só
   * aparece na revisão (duas sugestões ligadas juntas, uma escolha desmarcada) é medido lá, na hora
   */
  drive?: Record<string, number | null>;
  places: PlanPlaces;
  missing: PlanNamed[];
  /** o destino principal (o mais longe de casa): onde procurar onde dormir, se for preciso */
  destination: LngLat;
  /** a rota real respondeu (senão, linha reta) */
  routed: boolean;
};

/**
 * Da escolha ao caminho: a ordem dos passos, a rota traçada (a `route-day`: o desenho e o corredor das
 * sugestões) da saída pelas escolhas até casa, ou a linha reta quando ela não responde, e as sugestões
 * no corredor dela e perto do destino (o que a pessoa gosta mais o clássico de turismo).
 *
 * **O tempo de carro de cada trecho é o medido pelo Google** (D310), o mesmo que a tela das opções
 * mostrou; o trecho que o Google não mediu fica com o tempo da rota traçada (também é estrada de
 * verdade), e sem os dois fica sem tempo: a revisão mostra a parada sem horário, nunca uma estimativa.
 * O desvio de cada sugestão também é medido: ir do ponto anterior a ela e dela ao seguinte, menos ir
 * direto. A estimativa em linha reta só escolhe quais sugestões vale medir.
 */
export async function prepare(
  stage: MapStage,
  likes: { interests: readonly Interest[]; learned: readonly { kind: StopKind }[] },
  deps: FlowDeps,
): Promise<Prepared> {
  const origin = stage.origin?.at ?? null;
  // a ordem é a dos passos (fase 26); o caminho mais curto só no que ficou sem ordem
  const picks = orderedPicks(stage, origin);
  const start = origin ?? (picks[0] ? at(picks[0].place) : [0, 0]);
  const waypoints: LngLat[] = [
    ...(origin ? [origin] : []),
    ...picks.map((p) => at(p.place)),
    ...(origin ? [origin] : []),
  ];
  const chain = waypoints.flatMap((p, i): [LngLat, LngLat][] => {
    const next = waypoints[i + 1];
    return next ? [[p, next]] : [];
  });
  const [route, chainTimes] = await Promise.all([
    waypoints.length >= 2 ? deps.route(waypoints).catch(() => null) : Promise.resolve(null),
    measurePairs(stage.drive, chain, deps),
  ]);
  const table: Record<string, number | null> = { ...stage.drive, ...chainTimes.added };
  // o trecho que o Google não mediu fica com o tempo da rota traçada
  chain.forEach(([a, b], i) => {
    const leg = route?.legs[i];
    const key = driveKey(a, b);
    if (leg && typeof table[key] !== 'number' && !samePoint(a, b)) table[key] = leg.duration_s;
  });
  const minutes = (a: LngLat | null, b: LngLat | null) =>
    a && b ? measuredMinutes(table, a, b) : null;
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

  // as sugestões: escolhidas pelo desvio em linha reta (o critério), com o desvio de verdade medido.
  // Cada uma entra depois da última escolha que vem antes dela no caminho (a regra da montagem): o
  // desvio é ir desse ponto a ela e dela ao ponto seguinte, menos ir direto
  const candidates = suggestionsFor(
    found,
    geometry,
    picks.map((p) => p.place),
    liked,
  ).map((s) => {
    const anchor = picks.reduce(
      (index, _, i) => ((chosenFractions[i] ?? 0) <= s.fraction ? i : index),
      -1,
    );
    const before = picks[anchor];
    const after = picks[anchor + 1];
    return {
      s,
      here: at(s.place),
      anchor,
      before: before ? at(before.place) : origin,
      after: after ? at(after.place) : origin,
    };
  });
  const detourPairs: [LngLat, LngLat][] = [];
  for (const c of candidates) {
    if (c.before) detourPairs.push([c.before, c.here]);
    if (c.after) detourPairs.push([c.here, c.after]);
  }
  if (detourPairs.length > 0) {
    Object.assign(table, (await measurePairs(table, detourPairs, deps)).added);
  }
  const suggestions = candidates
    .map((c) => {
      const to = minutes(c.before, c.here);
      const onward = minutes(c.here, c.after);
      const direct = minutes(c.before, c.after);
      const detour =
        to !== null && onward !== null && direct !== null
          ? Math.max(0, to + onward - direct)
          : null;
      return { place: c.s.place, kind: c.s.kind, detour, fraction: c.s.fraction };
    })
    // o desvio medido que passa do teto já não é "no caminho"; o que não se mediu fica, sem número
    .filter((s) => s.detour === null || s.detour <= MAX_DETOUR_MIN)
    .map((s, i) => ({ ref: `s${String(i + 1)}`, ...s }));

  const last = picks.at(-1);
  return {
    picks,
    chosenFractions,
    suggestions,
    legs: null,
    drive: tableAmong(table, [...waypoints, ...candidates.map((c) => c.here)]),
    places: placesForAi(
      picks,
      suggestions,
      picks.map((p, i) => {
        const previous = picks[i - 1];
        return minutes(previous ? at(previous.place) : origin, at(p.place));
      }),
      origin && last ? minutes(at(last.place), origin) : null,
      pendingForAi(stage),
    ),
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
 * sem repetir, com a distância em linha reta de onde se sai; o tipo do app pelos tipos do Google (ou
 * pelas categorias da Geoapify, na fonte de reserva). O tempo de carro não é calculado aqui: é medido
 * (`measureStage`) e lido da tabela na hora de pintar (`optionDrive`, D310).
 */
export function optionsFromPlaces(
  places: readonly Place[],
  from: LngLat,
  /**
   * num passo seguinte (fase 26): o lugar escolhido no passo anterior e o próximo ponto fixo (o
   * destino, ou casa), para cada cartão dizer o que o lugar acrescenta ao passeio
   */
  around?: { previous: { name: string; at: LngLat }; next: LngLat | null },
): MapOption[] {
  const seen = new Set<string>();
  const out: MapOption[] = [];
  for (const place of places) {
    if (seen.has(place.id)) continue;
    seen.add(place.id);
    const here: LngLat = [place.lng, place.lat];
    const km = haversineM(from, here) / 1000;
    const kind = isGooglePlace(place)
      ? kindOfGoogleTypes(place.categories)
      : kindOfCategories(place.categories);
    const option: MapOption = { place, km, kind };
    if (around) {
      option.fromPrevious = {
        name: around.previous.name,
        km: haversineM(around.previous.at, here) / 1000,
        at: around.previous.at,
      };
      option.next = around.next;
    }
    out.push(option);
  }
  return out;
}

/**
 * O desvio em linha reta de um candidato de um passo seguinte, em km (ir do anterior a ele e dele ao
 * próximo ponto fixo, menos ir direto): **só para ordenar os cartões**, nunca mostrado; o desvio que a
 * tela mostra é o medido (`optionDrive`).
 */
function straightDetourKm(option: MapOption): number {
  const previous = option.fromPrevious;
  if (!previous?.at || !option.next) return previous?.km ?? option.km;
  const here: LngLat = [option.place.lng, option.place.lat];
  const via = haversineM(previous.at, here) + haversineM(here, option.next);
  return Math.max(0, via - haversineM(previous.at, option.next)) / 1000;
}

// ---------------------------------------------------- o tempo de carro medido (D310)
/** O que o cartão de uma opção mostra do tempo de carro, lido da tabela dos tempos medidos. */
export type OptionDrive = {
  /** de onde se sai até o lugar, em minutos; null sem medida (o cartão mostra a distância em linha reta) */
  minutes: number | null;
  /** do lugar escolhido no passo anterior até este; null sem medida ou sem passo anterior */
  fromPrevious: number | null;
  /**
   * o que o lugar acrescenta de estrada: ir do anterior a ele e dele ao próximo ponto fixo, menos ir
   * direto; null sem medida ou sem próximo ponto
   */
  detour: number | null;
};

export function optionDrive(
  stage: Pick<MapStage, 'origin' | 'drive'>,
  option: MapOption,
): OptionDrive {
  const here: LngLat = [option.place.lng, option.place.lat];
  const minutes = (a: LngLat | null | undefined, b: LngLat | null | undefined) =>
    a && b ? measuredMinutes(stage.drive, a, b) : null;
  const previous = option.fromPrevious?.at;
  const fromPrevious = minutes(previous, here);
  const onward = minutes(here, option.next);
  const direct = minutes(previous, option.next);
  return {
    minutes: minutes(stage.origin?.at, here),
    fromPrevious,
    detour:
      fromPrevious !== null && onward !== null && direct !== null
        ? Math.max(0, fromPrevious + onward - direct)
        : null,
  };
}

/**
 * Os pares de pontos cujo tempo de carro a tela das opções precisa agora: os trechos do passeio com o
 * que já está escolhido (de casa, entre as escolhas na ordem, a volta); o cartão de cada candidato à
 * vista (de casa até ele; num passo seguinte, do lugar anterior até ele, dele ao próximo ponto fixo e o
 * caminho direto, para o desvio); e, no passo a passo, o passeio com cada candidato do passo da vez
 * escolhido ("Daria 1 h 20 no total").
 */
export function neededPairs(stage: MapStage): [LngLat, LngLat][] {
  const home = stage.origin?.at ?? null;
  const pairs: [LngLat, LngLat][] = [];
  const chain = (s: MapStage) => {
    const points = [
      ...(home ? [home] : []),
      ...orderedPicks(s, home).map((p) => at(p.place)),
      ...(home ? [home] : []),
    ];
    points.forEach((p, i) => {
      const next = points[i + 1];
      if (next) pairs.push([p, next]);
    });
  };
  chain(stage);
  const current = currentStep(stage);
  const groups = current === null ? stage.groups : [stage.groups[current]];
  for (const g of groups) {
    if (g?.status !== 'ok' || g.removed) continue;
    for (const o of g.options.slice(0, g.shown)) {
      const here = at(o.place);
      const previous = o.fromPrevious?.at;
      if (previous) {
        pairs.push([previous, here]);
        if (o.next) pairs.push([here, o.next], [previous, o.next]);
      } else if (home) pairs.push([home, here]);
      // "Daria X no total": só o passo a passo mostra a conta por cartão
      if (current !== null && !stage.chosen.includes(o.place.id)) {
        chain(toggleChoice(stage, o.place.id));
      }
    }
  }
  return pairs;
}

const driveStatusOf = (err: unknown): DriveStatus => {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'offline') return 'offline';
  if (code === 'no_source') return 'no_source';
  if (code === 'daily_limit' || code === 'provider_quota') return 'limit';
  return 'failed';
};

/**
 * Mede no Google os pares que a tabela ainda não tem (em pedidos de até `DRIVE_MAX_PAIRS`): devolve o
 * que entrou e, se a medição não respondeu, por quê. Nunca lança: o que não se mediu fica sem tempo.
 */
export async function measurePairs(
  table: DriveTable | null | undefined,
  pairs: readonly (readonly [LngLat, LngLat])[],
  deps: Pick<FlowDeps, 'drive'>,
): Promise<{ added: Record<string, number | null>; status: DriveStatus | null }> {
  const missing = missingPairs(table, pairs);
  const added: Record<string, number | null> = {};
  try {
    for (let i = 0; i < missing.length; i += DRIVE_MAX_PAIRS) {
      const chunk = missing.slice(i, i + DRIVE_MAX_PAIRS);
      Object.assign(added, tableOf(chunk, await deps.drive(chunk)));
    }
    return { added, status: null };
  } catch (err) {
    return { added, status: driveStatusOf(err) };
  }
}

/** A tela das opções com o tempo de carro medido: o que falta medir entra na tabela dela. */
export async function measureStage(
  stage: MapStage,
  deps: Pick<FlowDeps, 'drive'>,
): Promise<MapStage> {
  const { added, status } = await measurePairs(stage.drive, neededPairs(stage), deps);
  if (Object.keys(added).length === 0 && status === (stage.driveStatus ?? null)) return stage;
  return { ...stage, drive: { ...stage.drive, ...added }, driveStatus: status };
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
 *
 * **Um passo de cada vez** (fase 26, `stepwise`): a IA procurou só o passo 1; os passos seguintes
 * nascem `unsearched` e o app os procura em volta da escolha anterior quando chega a vez (`searchStep`).
 * Um passo cuja relação depende da escolha anterior é sempre procurado pelo app (os candidatos que a IA
 * tenha posto nele foram medidos do ponto de referência, não da escolha); um passo numa cidade ou
 * perto de casa que a IA já procurou fica com o que ela achou. O destino dito, com a coordenada que a
 * função resolveu, vira a parada de cidade (a 3.4).
 */
export function stageFromOuting(
  result: Pick<PlanSearchResult, 'lugares' | 'passeio'>,
  origin: MapStage['origin'],
  reference: LngLat | null,
  options: { stepwise?: boolean } = {},
): { stage: MapStage; dropped: number } {
  const stepwise = options.stepwise ?? true;
  const from = origin?.at ?? reference;
  const byRef = new Map(result.lugares.map((f) => [f.ref, f.place] as const));
  let dropped = 0;
  const steps = [...result.passeio.passos].sort((a, b) => a.ordem - b.ordem);
  const groups: OptionGroup[] = steps.map((p, index) => {
    const places = p.candidatos.flatMap((ref) => {
      const place = byRef.get(ref);
      if (!place) dropped += 1;
      return place ? [place] : [];
    });
    const center: LngLat = places[0] ? [places[0].lng, places[0].lat] : (from ?? [0, 0]);
    const step: StepInfo = {
      ordem: p.ordem,
      relacao: p.relacao,
      cidade: p.cidade,
      hora_do_dia: p.hora_do_dia,
      fora_da_cidade: p.fora_da_cidade,
      ...(p.busca ? { busca: p.busca } : {}),
      ...(p.centro !== undefined ? { centro: p.centro } : {}),
      ...(p.descartados !== undefined ? { descartados: p.descartados } : {}),
      ...(p.hora ? { hora: p.hora } : {}),
      ...(p.permanencia_min ? { permanencia: p.permanencia_min } : {}),
    };
    // o app procura este passo quando chegar a vez: a relação depende da escolha anterior (depois do
    // passo 1), ou a IA não o procurou (o passo a passo)
    const toSearch =
      stepwise &&
      index > 0 &&
      (dependsOnPrevious(p.relacao) || (places.length === 0 && p.buscado !== true));
    const options = toSearch
      ? []
      : from
        ? optionsFromPlaces(places, from)
        : optionsFromPlaces(places, center);
    const search: PlaceSearch = {
      label: p.o_que,
      kind: options[0]?.kind ?? 'other',
      categories: [],
      names: [],
    };
    return {
      label: p.o_que,
      search,
      status: toSearch ? 'unsearched' : options.length > 0 ? 'ok' : 'none',
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
  const destination =
    result.passeio.destino !== '' && result.passeio.destino_centro
      ? {
          name: result.passeio.destino,
          at: [result.passeio.destino_centro.lng, result.passeio.destino_centro.lat] as LngLat,
        }
      : null;
  const first = stepGroups({ groups })[0];
  return {
    stage: {
      origin,
      groups,
      named: [],
      chosen: [],
      nowhere: !from && groups.length === 0,
      ...(stepwise && first !== undefined ? { step: first } : {}),
      ...(destination ? { destination } : {}),
      ...(result.passeio.saida ? { departure: result.passeio.saida } : {}),
    },
    dropped,
  };
}

// ------------------------------------------------- o passeio um passo de cada vez (fase 26)
/** O índice do grupo do passo da vez; null numa conversa sem passos (ou de antes). */
export function currentStep(stage: Pick<MapStage, 'groups' | 'step'>): number | null {
  return stage.step !== undefined && stage.groups[stage.step]?.step ? stage.step : null;
}

/** O passo depois do da vez, na ordem dita; null no último. */
export function nextStep(stage: Pick<MapStage, 'groups' | 'step'>): number | null {
  const current = currentStep(stage);
  if (current === null) return null;
  const steps = stepGroups(stage);
  return steps[steps.indexOf(current) + 1] ?? null;
}

/** O passo antes do da vez; null no primeiro. */
export function previousStep(stage: Pick<MapStage, 'groups' | 'step'>): number | null {
  const current = currentStep(stage);
  if (current === null) return null;
  const steps = stepGroups(stage);
  const at = steps.indexOf(current);
  return at > 0 ? (steps[at - 1] ?? null) : null;
}

/** Um passo está decidido: escolhido, pendente (procurado e sem lugar) ou tirado; "sem escolha" não. */
export function stepDecided(stage: MapStage, group: number): boolean {
  const g = stage.groups[group];
  if (!g) return false;
  if (g.status === 'unsearched') return false;
  return groupFate(g, stage.chosen) !== 'unchosen';
}

/** Dá para continuar ao passo seguinte: o da vez está decidido. */
export function canContinue(stage: MapStage): boolean {
  const current = currentStep(stage);
  return current !== null && stepDecided(stage, current);
}

/** Todos os passos foram feitos: o resumo e "Traçar o caminho" aparecem (sem passos, sempre). */
export function stepsDone(stage: MapStage): boolean {
  const current = currentStep(stage);
  if (current === null) return true;
  return nextStep(stage) === null && stepDecided(stage, current);
}

/** O último lugar escolhido antes de um passo (a última escolha do passo anterior com escolha). */
export function lastChosenBefore(
  stage: MapStage,
  group: number,
): { name: string; at: LngLat } | null {
  const steps = stepGroups(stage);
  const position = steps.indexOf(group);
  for (let i = position - 1; i >= 0; i--) {
    const g = stage.groups[steps[i] ?? -1];
    if (!g) continue;
    const ids = stage.chosen.filter((id) => g.options.some((o) => o.place.id === id));
    const last = ids.at(-1);
    const option = g.options.find((o) => o.place.id === last);
    if (option) return { name: option.place.name, at: [option.place.lng, option.place.lat] };
  }
  return null;
}

/** O passo seguinte vira o da vez (depois de procurado); o aviso de "voltar" sai. */
export function advanceStep(stage: MapStage, to: number): MapStage {
  return { ...stage, step: to, notice: null };
}

/**
 * "Voltar um passo" (ou "mudar" num passo feito): o passo pedido vira o da vez e os seguintes
 * recomeçam: as escolhas deles saem, o "tirar" também, e os que dependem da escolha anterior voltam a
 * `unsearched` (as opções vão ser procuradas de novo); a tela avisa.
 */
export function backTo(stage: MapStage, group: number): MapStage {
  const steps = stepGroups(stage);
  const position = steps.indexOf(group);
  if (position < 0) return stage;
  const later = new Set(steps.slice(position + 1));
  const redo: string[] = [];
  const groups = stage.groups.map((g, i) => {
    if (!later.has(i) || !g.step) return g;
    // o "tirar" e o "pelo nome" do passo seguinte recomeçam junto com a escolha
    const rest: OptionGroup = { ...g };
    delete rest.removed;
    delete rest.byName;
    if (dependsOnPrevious(g.step.relacao)) {
      redo.push(g.label);
      return { ...rest, status: 'unsearched' as const, options: [], shown: OPTIONS_SHOWN };
    }
    return rest;
  });
  const laterIds = new Set(
    stage.groups.flatMap((g, i) => (later.has(i) ? g.options.map((o) => o.place.id) : [])),
  );
  return {
    ...stage,
    groups,
    chosen: stage.chosen.filter((id) => !laterIds.has(id)),
    step: group,
    notice:
      redo.length > 0
        ? `As opções de ${redo.join(' e ')} vão ser procuradas de novo depois da sua escolha.`
        : null,
  };
}

/** Onde se procura o passo seguinte, pela relação dele: os círculos, as palavras e o texto da tela. */
export function stepSearchPlan(
  stage: MapStage,
  group: number,
): {
  circles: Circle[];
  query: string;
  rank: 'relevance' | 'distance';
  cityFilter: string | null;
  previous: { name: string; at: LngLat } | null;
  next: LngLat | null;
  where: string;
} | null {
  const g = stage.groups[group];
  if (!g?.step) return null;
  const step = g.step;
  const busca = step.busca ?? {
    palavras: g.label,
    tipo_google: '',
    aberto_agora: false,
    nota_minima: 0,
  };
  const home = stage.origin?.at ?? null;
  const previous = lastChosenBefore(stage, group);
  const point = (p: LngLat): Point => ({ lat: p[1], lng: p[0] });
  const destination = stage.destination?.at ?? null;
  const anchor = previous?.at ?? home;
  if (!anchor && !step.centro) return null;
  const destinationName = stage.destination?.name ?? null;
  switch (step.relacao) {
    case 'perto_do_anterior':
      return {
        circles: [nearCircle(point(anchor ?? home ?? [0, 0]))],
        query: busca.palavras,
        rank: 'distance',
        cityFilter: null,
        previous,
        next: destination ?? home,
        where: previous ? `perto de ${previous.name}` : 'perto de onde vocês saem',
      };
    case 'no_caminho': {
      const from = anchor ?? home;
      const to: LngLat | null =
        destination ?? (step.centro ? [step.centro.lng, step.centro.lat] : home);
      const circles =
        from && to && (from[0] !== to[0] || from[1] !== to[1])
          ? routeCircles(point(from), point(to))
          : [nearCircle(point(from ?? to ?? [0, 0]))];
      return {
        circles,
        query: busca.palavras,
        rank: 'relevance',
        cityFilter: null,
        previous,
        next: to,
        where: `no caminho${destinationName ? ` até ${destinationName}` : previous ? ' de volta' : ''}`,
      };
    }
    case 'na_cidade': {
      const center = step.centro ? ([step.centro.lng, step.centro.lat] as LngLat) : anchor;
      return {
        circles: [cityCircle(point(center ?? [0, 0]))],
        query: step.cidade ? `${busca.palavras} em ${step.cidade}` : busca.palavras,
        rank: 'relevance',
        cityFilter: step.cidade || null,
        previous,
        next: destination ?? home,
        where: step.cidade ? `em ${step.cidade}` : 'na cidade',
      };
    }
    case 'perto_de_casa':
      return {
        circles: [nearCircle(point(home ?? anchor ?? [0, 0]))],
        query: busca.palavras,
        rank: 'distance',
        cityFilter: null,
        previous,
        next: home,
        where: 'perto de onde vocês saem',
      };
    case 'sem_relacao': {
      // sem relação dita: em volta do anterior e no caminho de volta para casa
      const from = previous?.at ?? home;
      const to = home;
      const circles =
        from && to && previous
          ? routeCircles(point(from), point(to))
          : [nearCircle(point(from ?? [0, 0]))];
      return {
        circles,
        query: busca.palavras,
        rank: previous ? 'relevance' : 'distance',
        cityFilter: null,
        previous,
        next: home,
        where: previous
          ? `perto de ${previous.name} e no caminho de volta`
          : 'perto de onde vocês saem',
      };
    }
  }
}

/**
 * A busca do passo seguinte, feita pelo app quando chega a vez dele (fase 26, a decisão 1 de 20/11):
 * a `find-places` do Google pelas palavras do passo, onde a relação manda (em volta do último lugar
 * escolhido no passo anterior; nos círculos do caminho até o destino ou casa; dentro da cidade dita,
 * com o filtro no app e os vizinhos ditos; perto de onde se sai). Os candidatos valem pela mesma regra
 * do julgamento: só o que a função devolveu nesta busca; o app não inventa lugar. Cada cartão diz o que
 * o lugar acrescenta ao passeio (a distância do anterior e o desvio), não a distância de casa.
 */
export async function searchStep(
  stage: MapStage,
  group: number,
  deps: FlowDeps,
): Promise<MapStage> {
  const g = stage.groups[group];
  const plan = stepSearchPlan(stage, group);
  if (!g?.step || !plan) return stage;
  const busca = g.step.busca;
  // o tipo do Google só quando há (o pedido recusa o texto vazio)
  const tipo = busca?.tipo_google.trim() ?? '';
  const first = plan.circles[0];
  const base: OptionGroup = {
    ...g,
    options: [],
    shown: OPTIONS_SHOWN,
    center: first ? [first.lng, first.lat] : g.center,
    radiusKm: first ? first.radius_m / 1000 : g.radiusKm,
    where: plan.where,
  };
  const from = stage.origin?.at ?? base.center;
  let next: OptionGroup;
  try {
    const lists = await Promise.all(
      plan.circles.map((c) => {
        const request: GooglePlacesRequest = {
          provider: 'google',
          query: plan.query,
          bias: c,
          type: tipo === '' ? null : tipo,
          open_now: busca?.aberto_agora ?? false,
          min_rating: busca?.nota_minima ?? 0,
          rank: plan.rank,
          limit: 20,
        };
        return deps.findPlaces(request);
      }),
    );
    const merged: Place[] = [];
    const seen = new Set<string>();
    for (const list of lists)
      for (const p of list)
        if (!seen.has(p.id)) {
          seen.add(p.id);
          merged.push(p);
        }
    const scoped = plan.cityFilter
      ? withinCity(merged, plan.cityFilter)
      : { places: merged, neighbors: false };
    const around = plan.previous ? { previous: plan.previous, next: plan.next } : undefined;
    // a ordem dos cartões de um passo seguinte: o menor desvio em linha reta primeiro (um critério de
    // ordem; o tempo que cada cartão mostra é o medido)
    const options = optionsFromPlaces(scoped.places, from, around).sort((a, b) =>
      around
        ? straightDetourKm(a) - straightDetourKm(b) ||
          (a.fromPrevious?.km ?? 0) - (b.fromPrevious?.km ?? 0)
        : 0,
    );
    next = {
      ...base,
      options,
      status: options.length > 0 ? 'ok' : 'none',
      provider: options[0]?.place.provider ?? 'google',
      step: {
        ...g.step,
        fora_da_cidade: scoped.neighbors && options.length > 0,
      },
    };
  } catch (err) {
    next = { ...base, status: statusOf(err) };
  }
  return { ...stage, groups: stage.groups.map((x, i) => (i === group ? next : x)), notice: null };
}

/**
 * A conta do passeio todo para o que está escolhido (fase 26, a 3.3): de casa ao passo 1, entre os
 * passos na ordem, do último a casa, mais o tempo em cada lugar e o que o horário impõe. A tela a mostra
 * desde o passo 1 e a refaz para cada candidato ("se for escolhido"). A estrada é a medida (D310): **null
 * enquanto algum trecho não foi medido**. A hora que a pessoa disse para estar num lugar fixa a chegada
 * nele, e a hora de sair dita por ela fica (D311); `earliest` é a saída de hoje (não se sai antes de agora).
 */
export function stageAccount(
  stage: MapStage,
  time: { start: string; date: string | null; earliest?: boolean },
): OutingAccount | null {
  const origin = stage.origin?.at ?? null;
  // a hora de sair que a pessoa disse fica; senão, a da tela (que uma hora dita de um lugar recalcula)
  const said = filled(stage.departure);
  return outingAccount({
    home: origin,
    stops: orderedPicks(stage, origin).map((p) => ({
      name: p.place.name,
      kind: p.kind,
      at: Number.isFinite(p.place.lat) ? ([p.place.lng, p.place.lat] as LngLat) : null,
      hours: p.place.hours ?? null,
      ...(p.dayTime ? { dayTime: p.dayTime } : {}),
      dwell: dwellOf(p),
      atTime: p.atTime ?? null,
    })),
    start: said ?? time.start,
    startRule: said ? 'said' : time.earliest ? 'earliest' : 'default',
    date: time.date,
    drive: (a, b) => measuredMinutes(stage.drive, a, b),
  });
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
