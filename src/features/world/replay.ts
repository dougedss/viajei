import type { TravelEvent } from '@/features/travel-mode/events.ts';
import { isDepartureNode } from '@/features/travel-mode/rules.ts';
import type { Stop, TravelState } from '@/lib/db/schema.ts';
import type { CuriosityKind } from '@/lib/geo/index.ts';
import type { LayoutCuriosity, WorldLayout } from './layout.ts';
import { clamp } from './noise.ts';

/**
 * O plano do replay, puro: de onde o carro sai, até onde vai, quanto dura e o que dispara no
 * caminho (as deixas). Vale para o replay ao abrir (do `travel_state` anterior ao agora), para
 * "Rever o dia" (do primeiro nó ao agora) e para quem ficou em casa (o avanço curto que chega
 * pelo sync). A renderização lê o plano; nada aqui sabe de three.
 */
export type ReplayMode = 'catchup' | 'live' | 'review';

/** Uma foto de memória que já está no aparelho (o "Rever o dia" nunca espera rede). */
export type ReviewPhoto = {
  attachment_id: string;
  stop_id: string;
  created_by: string;
  created_at: string;
};

export type ReplayCue =
  | { kind: 'event'; s: number; event: TravelEvent }
  | {
      kind: 'photo';
      s: number;
      stop_id: string;
      /** a primeira foto do nó (a mais antiga) */
      attachment_id: string;
      created_by: string;
      /** quantas mais o nó tem: "+N" */
      extra: number;
    }
  | {
      kind: 'curiosity';
      s: number;
      caption: string;
      curiosity: CuriosityKind;
      duration_ms: number;
    };

export type ReplayPlan = {
  mode: ReplayMode;
  from_s: number;
  to_s: number;
  duration_ms: number;
  /** ordenadas por `s` */
  cues: ReplayCue[];
  /** eventos que não couberam no tempo: "+N paradas" ao fim */
  overflow: number;
  /** todos os eventos do plano, para `markSeen`/`dismissEvents` ao terminar */
  event_ids: string[];
};

export const REPLAY_MIN_MS = 3_000;
export const REPLAY_MAX_MS = 8_000;
export const LIVE_MIN_MS = 1_000;
export const LIVE_MAX_MS = 3_000;
export const REVIEW_MIN_MS = 4_000;
export const REVIEW_MAX_MS = 20_000;
/** curiosidade encurtada no replay ao abrir; mais calma no "Rever o dia" e ao vivo */
export const CURIOSITY_SHORT_MS = 1_500;
export const CURIOSITY_LONG_MS = 2_500;
export const MAX_CURIOSITIES = 3;
export const REVIEW_MAX_CURIOSITIES = 5;
export const LIVE_MAX_CURIOSITIES = 1;
/** avanço abaixo disto do caminho, sem eventos, não merece replay */
export const SMALL_ADVANCE = 0.03;
/** cada deixa de evento precisa deste tempo para ser lida */
export const EVENT_SLOT_MS = 600;
/** quanto o cartão de foto fica sobre a pílula no "Rever o dia" */
export const PHOTO_CARD_MS = 1200;

/** serra primeiro (descida ou subida), depois mar, ponto mais alto, entrada de cenário */
const CURIOSITY_PRIORITY: Record<CuriosityKind, number> = {
  descent: 0,
  ascent: 0,
  sea: 1,
  highest: 2,
  scenery: 3,
};

export function easeInOut(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** O trecho do dia: do primeiro ao último nó (os tocos da estrada ficam de fora da conta). */
export function daySpan(layout: Pick<WorldLayout, 'nodes' | 'pathLength'>): number {
  const first = layout.nodes[0]?.s ?? 0;
  const last = layout.nodes.at(-1)?.s ?? layout.pathLength;
  return Math.max(1e-6, last - first);
}

function scaled(min: number, max: number, distance_s: number, span: number): number {
  const ratio = span > 0 ? clamp(distance_s / span, 0, 1) : 0;
  return Math.round(clamp(min + (max - min) * ratio, min, max));
}

export const replayDuration = (distance_s: number, span: number): number =>
  scaled(REPLAY_MIN_MS, REPLAY_MAX_MS, distance_s, span);

function nodeS(layout: WorldLayout, stopId: string): number | null {
  return layout.nodes.find((n) => n.stop_id === stopId)?.s ?? null;
}

/** Deixas de evento no `s` do nó, presas ao intervalo do replay; nó desconhecido vai para o fim. */
function eventCues(
  events: readonly TravelEvent[],
  layout: WorldLayout,
  from_s: number,
  to_s: number,
): ReplayCue[] {
  return events
    .map((event, order) => ({
      event,
      order,
      s: clamp(nodeS(layout, event.stop_id) ?? to_s, from_s, to_s),
    }))
    .sort((a, b) => a.s - b.s || a.order - b.order)
    .map(({ event, s }) => ({ kind: 'event', s, event }));
}

/** As curiosidades dentro do trecho, pela prioridade, no máximo `max`, devolvidas em ordem de `s`. */
export function pickCuriosities(
  curiosities: readonly LayoutCuriosity[],
  from_s: number,
  to_s: number,
  max: number,
  duration_ms: number,
): ReplayCue[] {
  return curiosities
    .filter((c) => c.s > from_s && c.s <= to_s)
    .sort((a, b) => CURIOSITY_PRIORITY[a.kind] - CURIOSITY_PRIORITY[b.kind] || a.s - b.s)
    .slice(0, max)
    .sort((a, b) => a.s - b.s)
    .map((c) => ({
      kind: 'curiosity',
      s: c.s,
      caption: c.caption,
      curiosity: c.kind,
      duration_ms,
    }));
}

function mergeCues(a: ReplayCue[], b: ReplayCue[]): ReplayCue[] {
  return [...a, ...b].sort((x, y) => x.s - y.s);
}

export type ReplayInput = {
  prev: TravelState | null;
  current_s: number;
  events: readonly TravelEvent[];
  layout: WorldLayout;
  reducedMotion: boolean;
};

/**
 * Replay ao abrir. `from_s` vem da fração anterior; sem fração, do nó da última concluída de
 * então; sem as duas, do primeiro nó (o dia ainda não tinha começado quando este aparelho viu a
 * maquete). Sem `prev` não há "desde a última vez". Avanço pequeno sem eventos: o carro só aparece.
 * Com reduzir movimento, `null`: o card "Desde a última vez" é o que aparece.
 */
export function planReplay(input: ReplayInput): ReplayPlan | null {
  const { prev, current_s, events, layout, reducedMotion } = input;
  if (reducedMotion || !prev || layout.nodes.length === 0) return null;
  let from_s: number;
  if (prev.fraction !== null && layout.realTotalKm !== null)
    from_s = layout.fractionToS(prev.fraction);
  else from_s = (prev.at ? nodeS(layout, prev.at) : null) ?? layout.nodes[0]?.s ?? 0;
  if (from_s > current_s) from_s = current_s;
  const distance = current_s - from_s;
  const span = daySpan(layout);
  if (distance < SMALL_ADVANCE * span && events.length === 0) return null;
  const duration_ms = replayDuration(distance, span);
  const slots = Math.max(3, Math.floor(duration_ms / EVENT_SLOT_MS));
  const all = eventCues(events, layout, from_s, current_s);
  const kept = all.slice(0, slots);
  return {
    mode: 'catchup',
    from_s,
    to_s: current_s,
    duration_ms,
    cues: mergeCues(
      kept,
      pickCuriosities(layout.curiosities, from_s, current_s, MAX_CURIOSITIES, CURIOSITY_SHORT_MS),
    ),
    overflow: all.length - kept.length,
    event_ids: events.map((e) => e.id),
  };
}

/**
 * Avanço ao vivo: marcações e trilhas que chegam pelo sync, ou a leitura do painel, movem o carro
 * do `s` atual ao novo com a deixa do evento e, se passar por uma, a curiosidade.
 */
export function planLiveAdvance(
  from_s: number,
  to_s: number,
  events: readonly TravelEvent[],
  layout: WorldLayout,
  opts: { duration_ms?: number } = {},
): ReplayPlan | null {
  const distance = to_s - from_s;
  if (distance <= 0 && events.length === 0) return null;
  const start = Math.min(from_s, to_s);
  const duration_ms =
    opts.duration_ms ?? scaled(LIVE_MIN_MS, LIVE_MAX_MS, distance, daySpan(layout));
  return {
    mode: 'live',
    from_s: start,
    to_s,
    duration_ms,
    cues: mergeCues(
      eventCues(events, layout, start, to_s),
      pickCuriosities(layout.curiosities, start, to_s, LIVE_MAX_CURIOSITIES, CURIOSITY_LONG_MS),
    ),
    overflow: 0,
    event_ids: events.map((e) => e.id),
  };
}

/** Os eventos do dia inteiro, construídos das paradas (não do `travel_state`). */
export function dayEvents(stops: readonly Stop[], uid: string): TravelEvent[] {
  const out: TravelEvent[] = [];
  for (const stop of stops) {
    if (stop.deleted_at !== null) continue;
    if (stop.done_at !== null) {
      const kind = isDepartureNode(stop)
        ? 'departed'
        : stop.done_by === uid
          ? 'arrived'
          : 'team_arrived';
      out.push({
        id: `${kind}:${stop.id}`,
        kind,
        stop_id: stop.id,
        stop_name: stop.name,
        at: stop.done_at,
        by: stop.done_by,
      });
    } else if (stop.skipped) {
      out.push({
        id: `skipped:${stop.id}`,
        kind: 'skipped',
        stop_id: stop.id,
        stop_name: stop.name,
        at: null,
        by: null,
      });
    }
  }
  return out;
}

/**
 * As deixas de foto: uma por nó com foto, no `s` do nó (depois do evento dele), com a primeira foto
 * e quantas mais. Só fotos de paradas dentro do trecho e que já estão no aparelho.
 */
export function photoCues(
  photos: readonly ReviewPhoto[],
  layout: WorldLayout,
  from_s: number,
  to_s: number,
): ReplayCue[] {
  const byStop = new Map<string, ReviewPhoto[]>();
  for (const p of photos) {
    const list = byStop.get(p.stop_id) ?? [];
    list.push(p);
    byStop.set(p.stop_id, list);
  }
  const out: ReplayCue[] = [];
  for (const [stopId, list] of byStop) {
    const s = nodeS(layout, stopId);
    if (s === null || s < from_s - 1e-6 || s > to_s + 1e-6) continue;
    const first = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    if (!first) continue;
    out.push({
      kind: 'photo',
      s,
      stop_id: stopId,
      attachment_id: first.attachment_id,
      created_by: first.created_by,
      extra: list.length - 1,
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/**
 * "Rever o dia": do primeiro nó ao `s` atual, com todos os eventos do dia, até 20 s, e as fotos
 * das memórias aparecendo nos nós (o replay ao abrir não mostra fotos: é sobre o que mudou).
 */
export function planReview(
  layout: WorldLayout,
  stops: readonly Stop[],
  uid: string,
  current_s: number,
  photos: readonly ReviewPhoto[] = [],
): ReplayPlan | null {
  const from_s = layout.nodes[0]?.s ?? 0;
  const distance = current_s - from_s;
  const events = dayEvents(stops, uid);
  if (distance <= 0 && events.length === 0) return null;
  const to_s = Math.max(from_s, current_s);
  const duration_ms = scaled(REVIEW_MIN_MS, REVIEW_MAX_MS, distance, daySpan(layout));
  return {
    mode: 'review',
    from_s,
    to_s,
    duration_ms,
    // a ordenação é estável: no mesmo nó, o evento vem antes da foto
    cues: mergeCues(
      mergeCues(
        eventCues(events, layout, from_s, to_s),
        pickCuriosities(
          layout.curiosities,
          from_s,
          to_s,
          REVIEW_MAX_CURIOSITIES,
          CURIOSITY_LONG_MS,
        ),
      ),
      photoCues(photos, layout, from_s, to_s),
    ),
    overflow: 0,
    event_ids: [],
  };
}
