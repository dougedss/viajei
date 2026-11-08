import { isDepartureKind, type AchievementKey } from '@shared/constants.ts';
import { haversineM } from '@shared/geo.ts';
import { toCents } from '@/features/expenses/rules.ts';
import { activeStops, isWaypoint } from '@/features/itinerary/rules.ts';
import type {
  Attachment,
  ChecklistItem,
  DayRoute,
  Expense,
  LngLat,
  RouteLeg,
  Stop,
  StopMemory,
  Trip,
  TripDay,
  TripTrack,
} from '@/lib/db/schema.ts';
import { parseTrackPoints } from '@/features/travel-mode/track.ts';
import { splitAtStops } from '@/lib/geo/split.ts';

/**
 * A retrospectiva "Viajei!", pura: quando ela abre, os números do card final, a emenda das rotas dos
 * dias num caminho só, as fotos que aparecem nos nós e o roteiro de 15 s do filme (`planFilm`). A
 * cena, o player e a exportação só desenham o que sai daqui.
 */

// ------------------------------------------------------------------ quando abre
export type RetroState =
  | { status: 'ready' }
  /** a viagem ainda não terminou: abre no dia seguinte ao fim */
  | { status: 'soon'; opensOn: string }
  /** a viagem terminou sem nenhuma parada concluída: não há filme */
  | { status: 'empty' };

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Do dia seguinte ao fim em diante (o mesmo momento do aviso `retro_ready`), se a viagem aconteceu. */
export function retroState(
  trip: Pick<Trip, 'end_date'>,
  stops: readonly Pick<Stop, 'done_at' | 'deleted_at'>[],
  today: string,
): RetroState {
  if (today <= trip.end_date) return { status: 'soon', opensOn: nextDate(trip.end_date) };
  return stops.some((s) => s.deleted_at === null && s.done_at)
    ? { status: 'ready' }
    : { status: 'empty' };
}

// ------------------------------------------------------------------ os trechos rodados
/**
 * Os trechos da rota de um dia, um por par de pontos de passagem (as paradas do roteiro com
 * coordenada; a automática não é ponto de passagem), com as paradas das pontas.
 */
export function dayLegs(
  stops: readonly Stop[],
  route: Pick<DayRoute, 'legs'> | null,
): { from: Stop; to: Stop; leg: RouteLeg }[] {
  const wps = activeStops(stops).filter(isWaypoint);
  if (route?.legs.length !== wps.length - 1) return [];
  return route.legs.flatMap((leg, k) => {
    const from = wps[k];
    const to = wps[k + 1];
    return from && to ? [{ from, to, leg }] : [];
  });
}

/**
 * Rodado: as duas pontas do trecho concluídas. Os números do card saem só desses trechos da rota
 * real, nunca de horário inventado. O trecho da noite (do último nó de um dia ao primeiro do
 * seguinte) não está em rota nenhuma e não conta.
 */
export function drivenLegs(stops: readonly Stop[], route: Pick<DayRoute, 'legs'> | null) {
  return dayLegs(stops, route).filter((l) => l.from.done_at && l.to.done_at);
}

export type FilmNumbers = {
  days: number;
  /** paradas concluídas */
  stops: number;
  /** km e horas dos trechos rodados, pela rota real; null quando nenhum dia rodado tem rota */
  km: number | null;
  hours: number | null;
  /** algum dia com parada concluída não tem a rota guardada: km e horas contam só o que se sabe */
  partial: boolean;
  spentCents: number;
  budgetCents: number | null;
  /** null sem orçamento */
  onBudget: boolean | null;
};

export function filmNumbers(input: {
  trip: Pick<Trip, 'start_date' | 'end_date' | 'budget'>;
  days: readonly { day: TripDay; stops: Stop[] }[];
  routes: readonly DayRoute[];
  expenses: readonly Pick<Expense, 'amount' | 'deleted_at'>[];
}): FilmNumbers {
  let meters = 0;
  let seconds = 0;
  let known = false;
  let partial = false;
  let done = 0;
  for (const { day, stops } of input.days) {
    const active = activeStops(stops);
    done += active.filter((s) => s.done_at).length;
    const route = input.routes.find((r) => r.trip_day_id === day.id) ?? null;
    const legs = drivenLegs(active, route);
    const rodeSomething = active.filter((s) => s.done_at).length >= 2;
    if (rodeSomething && dayLegs(active, route).length === 0) partial = true;
    for (const l of legs) {
      meters += l.leg.distance_m;
      seconds += l.leg.duration_s;
      known = true;
    }
  }
  const spentCents = input.expenses
    .filter((e) => e.deleted_at === null)
    .reduce((acc, e) => acc + toCents(e.amount), 0);
  const budgetCents = input.trip.budget !== null ? toCents(input.trip.budget) : null;
  return {
    days: input.days.length,
    stops: done,
    km: known ? Math.round(meters / 1000) : null,
    hours: known ? Math.round(seconds / 3600) : null,
    partial,
    spentCents,
    budgetCents,
    onBudget: budgetCents !== null && budgetCents > 0 ? spentCents <= budgetCents : null,
  };
}

// ------------------------------------------------------------------ as fotos nos nós
export type NodePhoto = {
  stop_id: string;
  attachment_id: string;
  /** a nota da memória dona da foto (as estrelas do cartão) */
  rating: number | null;
  user_id: string;
};

/**
 * Por parada concluída, a foto da memória mais bem avaliada (D88): entre as pessoas que fotografaram
 * ali, a de maior nota; empate, a primeira foto. Só fotos que o aparelho já tem (`available`): o filme
 * nunca espera rede.
 */
export function nodePhotos(input: {
  stops: readonly Stop[];
  memories: readonly StopMemory[];
  attachments: readonly Attachment[];
  available: ReadonlySet<string>;
}): NodePhoto[] {
  const out: NodePhoto[] = [];
  for (const stop of input.stops) {
    if (!stop.done_at) continue;
    const photos = input.attachments
      .filter(
        (a) =>
          a.stop_id === stop.id &&
          a.kind === 'photo' &&
          a.deleted_at === null &&
          input.available.has(a.id),
      )
      .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    let best: NodePhoto | null = null;
    for (const p of photos) {
      const memory = input.memories.find(
        (m) => m.stop_id === stop.id && m.user_id === p.created_by,
      );
      const rating = memory?.rating ?? null;
      if (!best || (rating ?? 0) > (best.rating ?? 0)) {
        best = { stop_id: stop.id, attachment_id: p.id, rating, user_id: p.created_by };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// ------------------------------------------------------------------ a emenda das rotas
export type SplicedTrip = {
  /** as paradas ativas de todos os dias, em ordem */
  stops: Stop[];
  /** o índice, em `stops`, da primeira parada de cada dia */
  dayStarts: number[];
  /** a rota emendada (geometria, altitude e trechos); null quando algum dia não tem rota */
  route: { geometry: LngLat[]; elevation: [number, number][]; legs: RouteLeg[] } | null;
};

/** A trilha de um trecho, quando ela cobre o trecho inteiro: do Partiu! ao Chegamos!. */
function trackFor(from: Stop, to: Stop, tracks: readonly TripTrack[]): LngLat[] | null {
  if (!from.departed_at || !to.done_at) return null;
  const t0 = Date.parse(from.departed_at) / 1000;
  const t1 = Date.parse(to.done_at) / 1000;
  let best: LngLat[] | null = null;
  for (const track of tracks) {
    const pts = parseTrackPoints(track.points).sort((a, b) => a[2] - b[2]);
    const first = pts[0];
    const last = pts.at(-1);
    if (!first || !last || first[2] > t0 + 120 || last[2] < t1 - 120) continue;
    const span = pts.filter((p) => p[2] >= t0 && p[2] <= t1).map((p): LngLat => [p[0], p[1]]);
    if (span.length >= 2 && (!best || span.length > best.length)) best = span;
  }
  return best;
}

function lengthM(line: readonly LngLat[]): number {
  let m = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    if (a && b) m += haversineM(a, b);
  }
  return m;
}

export { splitAtStops } from '@/lib/geo/split.ts';

/**
 * Os dias da viagem num caminho só, para o filme sobrevoar do início ao fim (D121). Cada dia entra
 * com a rota real dele, cortada nas paradas; onde a trilha gravada cobre um trecho inteiro (do Partiu!
 * ao Chegamos!), ela substitui a geometria do trecho, e a altitude continua a da rota (a trilha não
 * tem altitude). Entre o último nó de um dia e o primeiro do seguinte, uma ponte reta (a noite), que
 * não entra nos números. Sem a rota de algum dia, o caminho é estilizado, como a maquete sem rota.
 */
export function spliceTrip(
  days: readonly { day: TripDay; stops: Stop[]; route: DayRoute | null; tracks: TripTrack[] }[],
): SplicedTrip {
  const stops: Stop[] = [];
  const dayStarts: number[] = [];
  const geometry: LngLat[] = [];
  const elevation: [number, number][] = [];
  const legs: RouteLeg[] = [];
  let offset = 0;
  let valid = true;
  let lastPoint: LngLat | null = null;
  let lastAlt = 0;
  const bridge = (to: LngLat, alt: number) => {
    if (!lastPoint) return;
    const d = haversineM(lastPoint, to);
    legs.push({ distance_m: d, duration_s: 0 });
    offset += d;
    elevation.push([offset, alt]);
  };
  for (const { stops: dayStops, route, tracks } of days) {
    const active = activeStops(dayStops);
    if (active.length === 0) continue;
    dayStarts.push(stops.length);
    stops.push(...active);
    const wps = active.filter(isWaypoint);
    const pieces = dayLegs(active, route);
    if (wps.length >= 2 && (!route || pieces.length === 0)) {
      valid = false;
      continue;
    }
    if (!route || wps.length < 2) {
      // um dia de uma parada só: entra pela ponte, sem trecho próprio
      const only = wps[0];
      if (only) {
        const at: LngLat = [only.lng, only.lat];
        bridge(at, lastAlt);
        geometry.push(at);
        lastPoint = at;
      }
      continue;
    }
    const lines = splitAtStops(
      route.geometry,
      wps.map((w): LngLat => [w.lng, w.lat]),
    );
    const startAlt = route.elevation[0]?.[1] ?? lastAlt;
    bridge(route.geometry[0] ?? [wps[0]?.lng ?? 0, wps[0]?.lat ?? 0], startAlt);
    pieces.forEach((p, k) => {
      const line = trackFor(p.from, p.to, tracks) ?? lines[k] ?? [];
      geometry.push(...line);
      legs.push(p.leg);
    });
    for (const [dist, alt] of route.elevation) elevation.push([offset + dist, alt]);
    offset += pieces.reduce((acc, p) => acc + p.leg.distance_m, 0);
    lastPoint = route.geometry.at(-1) ?? lastPoint;
    lastAlt = route.elevation.at(-1)?.[1] ?? lastAlt;
  }
  const located = stops.filter(isWaypoint).length;
  return {
    stops,
    dayStarts,
    route:
      valid && located >= 2 && legs.length === located - 1 && lengthM(geometry) > 0
        ? { geometry, elevation, legs }
        : null,
  };
}

// ------------------------------------------------------------------ o roteiro de 15 s
export const FILM_MS = 15_000;
export const OPENING_MS = 2_200;
export const FINAL_MS = 3_000;
export const FLIGHT_MS = FILM_MS - OPENING_MS - FINAL_MS;
/** cada dia tem pelo menos isto do sobrevoo, para um dia curto não passar num piscar */
export const MIN_DAY_MS = 1_200;
export const CUE_MS = 1_400;
export const MAX_PHOTO_CUES = 6;

export type FilmNode = { stop_id: string; name: string; day: number; s: number };

export type FilmCue =
  | { kind: 'day'; t: number; until: number; day: number; label: string }
  | {
      kind: 'photo';
      t: number;
      until: number;
      stop_id: string;
      name: string;
      attachment_id: string;
      rating: number | null;
    }
  | { kind: 'quest'; t: number; until: number; stop_id: string; name: string; text: string };

export type FilmPlan = {
  duration: number;
  opening: { t0: number; t1: number };
  flight: { t0: number; t1: number; from_s: number; to_s: number };
  final: { t0: number; t1: number };
  /** o caminho do sobrevoo: o `s` do carro em função do tempo, por trechos (um por dia) */
  keys: { t: number; s: number }[];
  cues: FilmCue[];
};

export function easeInOut(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** O `s` do carro num instante do filme (antes do sobrevoo, no início; depois, no fim). */
export function sAt(plan: Pick<FilmPlan, 'keys'>, t: number): number {
  const keys = plan.keys;
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return 0;
  if (t <= first.t) return first.s;
  if (t >= last.t) return last.s;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (a && b && t <= b.t) {
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      // cada dia acelera e desacelera de leve; o filme inteiro não para entre os dias
      const eased = i === 1 || i === keys.length - 1 ? easeInOut(k) : k;
      return a.s + (b.s - a.s) * eased;
    }
  }
  return last.s;
}

/** O instante em que o carro passa por um `s` (o inverso de `sAt`, por busca). */
export function tAt(plan: Pick<FilmPlan, 'keys'>, s: number): number {
  const keys = plan.keys;
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return 0;
  let lo = first.t;
  let hi = last.t;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (sAt(plan, mid) < s) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

/**
 * O roteiro de 15 s, puro: abertura com "Viajei!", o nome e as datas (2,2 s); o sobrevoo do primeiro
 * ao último nó, com o tempo dividido entre os dias pelo comprimento de cada um e no mínimo 1,2 s por
 * dia (9,8 s); o card final com o carro estacionado (3 s). No sobrevoo, o chip de cada dia, até 6
 * fotos (as de maior nota primeiro, com 1,4 s cada e sem sobrepor) e as missões feitas onde sobra
 * lugar. Sem fotos, o sobrevoo vai só com os dias.
 */
export function planFilm(input: {
  nodes: readonly FilmNode[];
  days: readonly { day: number; label: string }[];
  photos: readonly NodePhoto[];
  quests: readonly { stop_id: string; text: string }[];
}): FilmPlan {
  const t0 = OPENING_MS;
  const t1 = OPENING_MS + FLIGHT_MS;
  const nodes = [...input.nodes].sort((a, b) => a.s - b.s);
  const from = nodes[0]?.s ?? 0;
  const to = nodes.at(-1)?.s ?? from;
  // o trecho de cada dia: do primeiro nó dele ao primeiro do seguinte (o último vai ao fim)
  const dayIds = [...new Set(nodes.map((n) => n.day))];
  const spans = dayIds.map((day, i) => {
    const start = nodes.find((n) => n.day === day)?.s ?? from;
    const nextDay = dayIds[i + 1];
    const end = nextDay !== undefined ? (nodes.find((n) => n.day === nextDay)?.s ?? to) : to;
    return { day, start, end, len: Math.max(0, end - start) };
  });
  const total = spans.reduce((acc, d) => acc + d.len, 0);
  const n = Math.max(1, spans.length);
  const minEach = Math.min(MIN_DAY_MS, FLIGHT_MS / n);
  const spare = FLIGHT_MS - minEach * n;
  const keys: { t: number; s: number }[] = [{ t: t0, s: from }];
  let t = t0;
  const dayStart = new Map<number, number>();
  for (const d of spans) {
    dayStart.set(d.day, t);
    t += minEach + (total > 0 ? (spare * d.len) / total : spare / n);
    keys.push({ t: Math.round(t), s: d.end });
  }
  const last = keys.at(-1);
  if (last) last.t = t1;
  const plan: FilmPlan = {
    duration: FILM_MS,
    opening: { t0: 0, t1: t0 },
    flight: { t0, t1, from_s: from, to_s: to },
    final: { t0: t1, t1: FILM_MS },
    keys,
    cues: [],
  };

  const cues: FilmCue[] = [];
  for (const d of input.days) {
    const at = dayStart.get(d.day);
    if (at !== undefined && spans.length > 1) {
      cues.push({ kind: 'day', t: at, until: at + CUE_MS, day: d.day, label: d.label });
    }
  }
  // fotos: as de maior nota primeiro, cada uma no instante em que o carro passa pelo nó
  const byNode = new Map(nodes.map((nd) => [nd.stop_id, nd]));
  const candidates = [
    ...input.photos.flatMap((p) => {
      const nd = byNode.get(p.stop_id);
      return nd ? [{ priority: 10 + (p.rating ?? 0), nd, photo: p, text: null }] : [];
    }),
    ...input.quests.flatMap((q) => {
      const nd = byNode.get(q.stop_id);
      return nd ? [{ priority: 1, nd, photo: null, text: q.text }] : [];
    }),
  ].sort((a, b) => b.priority - a.priority || a.nd.s - b.nd.s);
  const taken: { t: number }[] = [];
  const used = new Set<string>();
  let photos = 0;
  for (const c of candidates) {
    if (used.has(c.nd.stop_id)) continue;
    if (c.photo && photos >= MAX_PHOTO_CUES) continue;
    const at = Math.min(t1 - CUE_MS, Math.max(t0, tAt(plan, c.nd.s)));
    if (taken.some((x) => Math.abs(x.t - at) < CUE_MS)) continue;
    taken.push({ t: at });
    used.add(c.nd.stop_id);
    if (c.photo) {
      photos++;
      cues.push({
        kind: 'photo',
        t: at,
        until: at + CUE_MS,
        stop_id: c.nd.stop_id,
        name: c.nd.name,
        attachment_id: c.photo.attachment_id,
        rating: c.photo.rating,
      });
    } else if (c.text) {
      cues.push({
        kind: 'quest',
        t: at,
        until: at + CUE_MS,
        stop_id: c.nd.stop_id,
        name: c.nd.name,
        text: c.text,
      });
    }
  }
  plan.cues = cues.sort((a, b) => a.t - b.t);
  return plan;
}

/** As missões feitas, por parada: as que aparecem no sobrevoo. */
export function doneQuests(items: readonly ChecklistItem[]): { stop_id: string; text: string }[] {
  return items.flatMap((i) =>
    i.kind === 'quest' && i.status === 'active' && i.deleted_at === null && i.done_at && i.stop_id
      ? [{ stop_id: i.stop_id, text: i.text }]
      : [],
  );
}

/** As conquistas da viagem (de todo o time), sem repetir, na ordem em que vieram. */
export function tripAchievements(
  rows: readonly { key: string; trip_id: string | null; unlocked_at: string }[],
  tripId: string,
  isKey: (k: string) => k is AchievementKey,
): AchievementKey[] {
  const seen = new Set<AchievementKey>();
  for (const r of [...rows].sort((a, b) => (a.unlocked_at < b.unlocked_at ? -1 : 1))) {
    if (r.trip_id === tripId && isKey(r.key)) seen.add(r.key);
  }
  return [...seen];
}

/** Os nós de saída não ganham pílula no filme; a "Chegada em" também não (é o fim do caminho). */
export function isRoadNode(stop: Pick<Stop, 'kind'>): boolean {
  return isDepartureKind(stop.kind);
}

// ------------------------------------------------------------------ os textos do card final
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** "11 a 14 de dezembro de 2026", "28 de dezembro a 2 de janeiro de 2027", sem passar por fuso. */
export function periodLong(start: string, end: string): string {
  const [ys, ms, ds] = start.split('-').map(Number);
  const [ye, me, de] = end.split('-').map(Number);
  const month = (m: number | undefined) => MONTHS[(m ?? 1) - 1] ?? '';
  if (start === end) return `${ds ?? ''} de ${month(ms)} de ${ys ?? ''}`;
  if (ys === ye && ms === me) return `${ds ?? ''} a ${de ?? ''} de ${month(me)} de ${ye ?? ''}`;
  if (ys === ye) return `${ds ?? ''} de ${month(ms)} a ${de ?? ''} de ${month(me)} de ${ye ?? ''}`;
  return `${ds ?? ''} de ${month(ms)} de ${ys ?? ''} a ${de ?? ''} de ${month(me)} de ${ye ?? ''}`;
}

const intPt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const reais = (cents: number) => `R$ ${intPt.format(Math.round(cents / 100))}`;

export type FinalTexts = {
  stats: { value: string; label: string }[];
  /** "R$ 2.741 de R$ 3.000 · dentro do orçamento"; vazio sem gasto e sem orçamento */
  budget: string;
};

/** Os números do card final como se leem: "4 dias · 17 paradas · 18 h de estrada · 1.150 km". */
export function finalTexts(n: FilmNumbers): FinalTexts {
  const stats = [
    { value: String(n.days), label: n.days === 1 ? 'dia' : 'dias' },
    { value: String(n.stops), label: n.stops === 1 ? 'parada' : 'paradas' },
  ];
  if (n.hours !== null) stats.push({ value: `${n.hours} h`, label: 'de estrada' });
  if (n.km !== null) stats.push({ value: intPt.format(n.km), label: 'km' });
  let budget = '';
  if (n.budgetCents !== null && n.budgetCents > 0) {
    const verdict = n.onBudget ? 'dentro do orçamento' : 'acima do orçamento';
    budget = `${reais(n.spentCents)} de ${reais(n.budgetCents)} · ${verdict}`;
  } else if (n.spentCents > 0) {
    budget = `${reais(n.spentCents)} de gastos`;
  }
  return { stats, budget };
}

/** "Dia 2 · sábado" a partir da data, sem fuso. */
export function dayLabel(index: number, date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y ?? 2000, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return `Dia ${index} · ${names[weekday] ?? ''}`;
}
