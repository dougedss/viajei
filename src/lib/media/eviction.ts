/**
 * Quem sai do cache de arquivos quando passa do orçamento do aparelho. Puro. Nunca sai anexo de
 * viagem em andamento ou futura (é o que se abre no balcão, sem sinal); das passadas, primeiro as
 * fotos menos usadas, depois os documentos. Quem sai volta pelo `storage.download` quando a pessoa
 * abrir com rede: o arquivo continua no servidor.
 */
export type CachedBlobMeta = {
  attachment_id: string;
  trip_id: string;
  kind: 'photo' | 'document';
  size: number;
  last_used_at: string;
};

export const MB = 1024 * 1024;
/** teto do orçamento */
export const BUDGET_MAX = 1024 * MB;
/** piso: abaixo disto nem vale despejar */
export const BUDGET_MIN = 200 * MB;
/** parte da cota que o navegador dá ao app */
export const BUDGET_SHARE = 0.4;
/** sem `navigator.storage.estimate()` */
export const BUDGET_UNKNOWN = 500 * MB;

/** O orçamento: o menor entre 1 GB e 40% da cota, nunca abaixo de 200 MB. */
export function budgetFor(quota: number | null | undefined): number {
  if (!quota || !Number.isFinite(quota) || quota <= 0) return BUDGET_UNKNOWN;
  return Math.max(BUDGET_MIN, Math.min(BUDGET_MAX, Math.floor(quota * BUDGET_SHARE)));
}

/** Os ids a despejar, na ordem, até o total caber no orçamento. */
export function planEviction(
  blobs: readonly CachedBlobMeta[],
  protectedTrips: ReadonlySet<string>,
  budget: number,
): string[] {
  let total = blobs.reduce((sum, b) => sum + b.size, 0);
  if (total <= budget) return [];
  const rank = (b: CachedBlobMeta) => (b.kind === 'photo' ? 0 : 1);
  const candidates = blobs
    .filter((b) => !protectedTrips.has(b.trip_id))
    .sort((a, b) => rank(a) - rank(b) || a.last_used_at.localeCompare(b.last_used_at));
  const out: string[] = [];
  for (const b of candidates) {
    if (total <= budget) break;
    out.push(b.attachment_id);
    total -= b.size;
  }
  return out;
}

/** Viagem em andamento ou futura: protegida. `today` em 'yyyy-MM-dd'. */
export function isProtectedTrip(trip: { end_date: string }, today: string): boolean {
  return trip.end_date >= today;
}

/** `last_used_at` só é regravado uma vez por dia por anexo. */
export const TOUCH_EVERY_MS = 24 * 60 * 60 * 1000;
export function needsTouch(lastUsedAt: string, now: number): boolean {
  return now - new Date(lastUsedAt).getTime() >= TOUCH_EVERY_MS;
}
