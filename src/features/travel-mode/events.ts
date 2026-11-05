import { activeStops } from '@/features/itinerary/rules.ts';
import type { Stop, TravelState } from '@/lib/db/schema.ts';
import { isDepartureNode } from './rules.ts';

/**
 * O que aconteceu desde a última vez que este aparelho viu a maquete. Puro. A fase 5 anima a lista
 * (o carrinho anda e cada evento dispara no ponto certo); nesta fase ela aparece no card "Desde a
 * última vez", que também é o fallback definitivo de prefers-reduced-motion.
 */
export type TravelEventKind = 'arrived' | 'departed' | 'skipped' | 'team_arrived' | 'passed';

export type TravelEvent = {
  /** determinístico (`kind:stop_id`), para `seen_event_ids` */
  id: string;
  kind: TravelEventKind;
  stop_id: string;
  stop_name: string;
  /** hora real, quando veio de botão, notificação ou modo painel; null em `passed` */
  at: string | null;
  /** quem marcou (`done_by`), quando há */
  by: string | null;
};

/** O estado a guardar agora, para comparar na próxima abertura. */
export function snapshotTravelState(
  dayId: string,
  tripId: string,
  stops: readonly Stop[],
  at: Stop | null,
  fraction: number | null,
  seen: readonly string[],
  now: Date,
): TravelState {
  const ordered = activeStops(stops);
  return {
    trip_day_id: dayId,
    trip_id: tripId,
    fraction,
    at: at?.id ?? null,
    done_stop_ids: ordered.filter((s) => s.done_at !== null).map((s) => s.id),
    skipped_stop_ids: ordered.filter((s) => s.skipped && s.done_at === null).map((s) => s.id),
    seen_event_ids: [...new Set(seen)],
    updated_at: now.toISOString(),
  };
}

/**
 * Eventos novos entre `prev` e o estado atual das paradas. Sem `prev` (primeira abertura do dia
 * neste aparelho) não há "desde a última vez": a abertura do dia é da fase 5.
 */
export function eventsSince(
  prev: TravelState | null,
  stops: readonly Stop[],
  uid: string,
  passed: readonly Stop[] = [],
): TravelEvent[] {
  if (!prev) return [];
  const done = new Set(prev.done_stop_ids);
  const skipped = new Set(prev.skipped_stop_ids);
  const seen = new Set(prev.seen_event_ids);
  const events: TravelEvent[] = [];
  const push = (kind: TravelEventKind, stop: Stop) => {
    const id = `${kind}:${stop.id}`;
    if (seen.has(id)) return;
    events.push({
      id,
      kind,
      stop_id: stop.id,
      stop_name: stop.name,
      at: kind === 'passed' ? null : (stop.done_at ?? null),
      by: kind === 'passed' ? null : stop.done_by,
    });
  };
  for (const stop of activeStops(stops)) {
    if (stop.done_at !== null && !done.has(stop.id)) {
      if (isDepartureNode(stop)) push('departed', stop);
      else push(stop.done_by === uid ? 'arrived' : 'team_arrived', stop);
    } else if (stop.skipped && stop.done_at === null && !skipped.has(stop.id)) {
      push('skipped', stop);
    }
  }
  for (const stop of passed) push('passed', stop);
  return events;
}
