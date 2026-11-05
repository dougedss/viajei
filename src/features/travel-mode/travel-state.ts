import { db, type TravelState } from '@/lib/db/schema.ts';

/** `travel_state` por dia, só neste aparelho (cache recalculável, nunca sincronizado). */
export async function loadTravelState(dayId: string): Promise<TravelState | null> {
  return (await db.travel_state.get(dayId)) ?? null;
}

export async function saveTravelState(state: TravelState): Promise<void> {
  await db.travel_state.put(state);
}

/** Marca eventos como vistos sem mexer no resto do snapshot. */
export async function markEventsSeen(dayId: string, ids: readonly string[]): Promise<void> {
  const current = await db.travel_state.get(dayId);
  if (!current) return;
  await db.travel_state.put({
    ...current,
    seen_event_ids: [...new Set([...current.seen_event_ids, ...ids])],
  });
}
