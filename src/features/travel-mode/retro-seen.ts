import { readLocal, useLocalValue, writeLocal } from '@/lib/storage/local.ts';

/** O cartão "Viajei!" dispensado neste aparelho (fase 14): a retrospectiva continua em Detalhes. */
export const retroSeenKey = (tripId: string): string => `viajei:retro:seen:${tripId}`;

export function useRetroSeen(tripId: string): boolean {
  return useLocalValue(retroSeenKey(tripId), (raw) => raw === '1');
}
export function markRetroSeen(tripId: string): void {
  writeLocal(retroSeenKey(tripId), '1');
}
export function readRetroSeen(tripId: string): boolean {
  return readLocal(retroSeenKey(tripId)) === '1';
}
