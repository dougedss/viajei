import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { kickMedia, mediaQueue, type Prepared } from '@/lib/media/index.ts';

/**
 * As escritas das memórias. Uma linha por pessoa e parada, id `v5(stop_id, user_id)`: dois aparelhos
 * da mesma pessoa sem sinal escrevem a mesma linha, e duas pessoas nunca se sobrescrevem. As fotos
 * vão pela fila de envio e aparecem na hora, pelo Blob local.
 */
export function memoryId(stopId: string, uid: string): Promise<string> {
  return uuidV5(stopId, uid);
}

export type MemoryInput = {
  tripId: string;
  stopId: string;
  uid: string;
  rating: number | null;
  memo: string;
};

/** Grava a nota e o texto (a linha nasce mesmo só com fotos: é o "respondido" em todo aparelho). */
export async function saveMemory(input: MemoryInput): Promise<void> {
  const id = await memoryId(input.stopId, input.uid);
  const memo = input.memo.trim() === '' ? null : input.memo.trim().slice(0, 500);
  const existing = await db.stop_memories.get(id);
  if (!existing) {
    const now = new Date().toISOString();
    await mutate.insert('stop_memories', {
      id,
      trip_id: input.tripId,
      stop_id: input.stopId,
      user_id: input.uid,
      rating: input.rating,
      memo,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    return;
  }
  const changes: { rating?: number | null; memo?: string | null; deleted_at?: null } = {};
  if (existing.rating !== input.rating) changes.rating = input.rating;
  if (existing.memo !== memo) changes.memo = memo;
  if (existing.deleted_at !== null) changes.deleted_at = null;
  await mutate.patch('stop_memories', id, changes);
}

/** As fotos já comprimidas na folha entram na fila só no "Salvar". */
export async function addMemoryPhotos(
  photos: readonly Prepared[],
  target: { tripId: string; stopId: string },
  uid: string,
): Promise<void> {
  for (const p of photos) {
    await mediaQueue.enqueueUpload(
      p,
      { tripId: target.tripId, stopId: target.stopId, reservationId: null },
      uid,
    );
  }
  if (photos.length > 0) kickMedia();
}

const dismissKey = (stopId: string) => `memory:dismissed:${stopId}`;

/** "Agora não" e o ✕ do card: neste aparelho, a parada não pede mais "Como foi?". */
export async function dismissMemoryPrompt(stopId: string): Promise<void> {
  await db.sync_state.put({ key: dismissKey(stopId), value: '1' });
}

export const DISMISS_PREFIX = 'memory:dismissed:';
