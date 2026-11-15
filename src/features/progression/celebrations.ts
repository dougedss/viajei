import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/schema.ts';
import { parseQueue, parseSummary, progressKeys } from './engine.ts';
import type { Celebration, Summary } from './moments.ts';

export type CelebrationState = { queue: Celebration[]; summary: Summary | null };

/** A fila de comemorações deste aparelho e o resumo da primeira derivação, numa leitura. */
export async function readCelebrations(): Promise<CelebrationState> {
  const [queue, summary] = await Promise.all([
    db.sync_state.get(progressKeys.queue),
    db.sync_state.get(progressKeys.summary),
  ]);
  return { queue: parseQueue(queue?.value), summary: parseSummary(summary?.value) };
}

/**
 * A fila lida pela tela que hospeda o momento calmo, antes de pintar: com ela na primeira pintura, o
 * cartão do resumo nasce no lugar dele e não chega um quadro depois empurrando a página (D162, e o
 * CLS de 0,40 do perfil e de 0,34 da garagem na fase 16). `undefined` enquanto lê.
 */
export function useCelebrations(): CelebrationState | undefined {
  return useLiveQuery(readCelebrations, []);
}
