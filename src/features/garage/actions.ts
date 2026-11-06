import { mutate } from '@/lib/db/mutate.ts';
import type { TripCarPatch } from './rules.ts';

/**
 * Grava a escolha da garagem pela mesma `mutate` de tudo: só as colunas tocadas (`car_model`,
 * `car_color` ou `car_accessories`), no Dexie e na outbox, offline. A outbox funde toques
 * seguidos na mesma coluna antes de enviar. A prévia nunca chega aqui.
 */
export async function saveCar(tripId: string, patch: TripCarPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await mutate.patch('trips', tripId, patch);
}
