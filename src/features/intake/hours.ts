import { DAY_TIME_WINDOWS } from '../../../supabase/functions/_shared/day-span.ts';
import { hoursOnDay, openStatusAt } from '../../../supabase/functions/_shared/google-places.ts';
import type { OpeningPeriod } from '../../../supabase/functions/_shared/places-schema.ts';
import type { DayTime } from '../../../supabase/functions/_shared/plan-search-protocol.ts';

/**
 * O horário na conta do passeio (fase 27, a sugestão aceita em 21/11): com os períodos de funcionamento
 * do Google, a revisão avisa quando o roteiro chega a um lugar antes de ele abrir ou depois de fechar.
 * Puro: o dia da semana sai da data da parada (a hora de parede, D86), e nada se afirma sem período.
 */
const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** O dia da semana (0 = domingo) de uma data "AAAA-MM-DD", em hora de parede. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

/**
 * O aviso do horário: null quando o lugar está aberto na hora prevista, ou quando não há período que
 * diga. "Fechado na quinta" quando o dia não tem período; senão "Fechado às 10:00: abre 13:00–19:00".
 */
export function hoursNotice(
  hours: readonly OpeningPeriod[] | null | undefined,
  date: string,
  time: string | null,
): string | null {
  if (!hours || hours.length === 0 || !time) return null;
  const day = weekdayOf(date);
  if (openStatusAt(hours, day, time) !== 'closed') return null;
  const onDay = hoursOnDay(hours, day);
  return onDay ? `Fechado às ${time}: abre ${onDay}` : `Fechado na ${DAYS[day] ?? ''}`.trimEnd();
}

/**
 * A hora do dia dita entra na conta (fase 26, a 3.3): "Pedido de manhã; o roteiro chega às 13:25"
 * quando a hora prevista da parada cai fora da janela da hora do dia que a pessoa disse para ela.
 * Null sem hora do dia, sem horário previsto, ou dentro da janela. Nada se afirma sem período.
 */
export function dayTimeNotice(
  dayTime: DayTime | null | undefined,
  time: string | null | undefined,
): string | null {
  if (!dayTime || !time) return null;
  const w = DAY_TIME_WINDOWS[dayTime];
  const [h = '0', m = '0'] = time.split(':');
  const at = Number(h) * 60 + Number(m);
  if (at >= w.from && at < w.to) return null;
  return `Pedido ${w.label}; o roteiro chega às ${time}`;
}
