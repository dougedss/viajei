import { useLiveQuery } from 'dexie-react-hooks';
import { db, type StopMemory } from '@/lib/db/schema.ts';
import { useTripMedia, type MediaItem } from '@/lib/media/hooks.ts';
import { DISMISS_PREFIX } from './actions.ts';

/** As memórias vivas da viagem, de todo o time. */
export function useTripMemories(tripId: string): StopMemory[] {
  return useLiveQuery(
    async () =>
      (await db.stop_memories.where('trip_id').equals(tripId).toArray()).filter(
        (m) => m.deleted_at === null,
      ),
    [tripId],
    [],
  );
}

/** As paradas em que este aparelho já dispensou o "Como foi?". */
export function useDismissedPrompts(): Set<string> {
  const keys = useLiveQuery(
    () => db.sync_state.where('key').startsWith(DISMISS_PREFIX).primaryKeys(),
    [],
    [],
  );
  return new Set(keys.map((k) => k.slice(DISMISS_PREFIX.length)));
}

/** As fotos de memória da viagem (enviadas e esperando sinal). */
export function useTripPhotos(tripId: string): MediaItem[] {
  return useTripMedia(tripId, (row) => row.kind === 'photo' && row.stop_id !== null);
}
