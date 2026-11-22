import type { Place } from '../../../supabase/functions/_shared/places-schema.ts';

/**
 * Os textos dos cartões do Google (fase 27), puros: a nota com o número de avaliações e o que o lugar
 * diz de si agora (aberto, fechado, fechado por um tempo, fechado de vez, ainda por abrir).
 */
/** "4,6 · 212 avaliações": a nota do Google com o número de avaliações (fase 27). */
export function ratingText(place: Pick<Place, 'rating' | 'user_rating_count'>): string | null {
  if (place.rating === null || place.rating === undefined) return null;
  const nota = place.rating.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const n = place.user_rating_count ?? 0;
  return n > 0 ? `${nota} · ${String(n)} ${n === 1 ? 'avaliação' : 'avaliações'}` : nota;
}

/** O que o lugar diz de si agora: aberto, fechado, fechado por um tempo, fechado de vez, ainda por abrir. */
export function statusText(
  place: Pick<Place, 'open_now' | 'business_status'>,
): { text: string; tone: 'ok' | 'warn' | 'off' } | null {
  if (place.business_status === 'closed_permanently')
    return { text: 'Fechado de vez', tone: 'off' };
  if (place.business_status === 'closed_temporarily')
    return { text: 'Fechado por um tempo', tone: 'warn' };
  if (place.business_status === 'future_opening') return { text: 'Ainda não abriu', tone: 'warn' };
  if (place.open_now === true) return { text: 'Aberto agora', tone: 'ok' };
  if (place.open_now === false) return { text: 'Fechado agora', tone: 'warn' };
  return null;
}
