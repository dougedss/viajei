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
