import { differenceInCalendarDays, parseISO } from 'date-fns';
import { RESERVATION_TYPES, type ReservationType } from '@shared/constants.ts';
import type { Reservation, Stop, TripDay } from '@/lib/db/schema.ts';
import { formatDayShort, hhmm, isoToWall } from '@/lib/time/index.ts';

/**
 * As regras puras das reservas: de que dia é cada uma, a ordem da lista, o texto do horário, o
 * prazo de cancelamento e quais importam agora (o "Ver reserva" no balcão). Horários sempre em
 * hora de parede de São Paulo, nunca o fuso do aparelho.
 */
/** O tipo gravado como um dos quatro conhecidos (dado velho ou estranho vira `other`). */
export function asReservationType(type: string): ReservationType {
  return Object.hasOwn(RESERVATION_TYPES, type) ? (type as ReservationType) : 'other';
}

export function typeLabel(type: string): string {
  return RESERVATION_TYPES[asReservationType(type)].label;
}

export type ReservationContext = {
  stops: ReadonlyMap<string, Pick<Stop, 'id' | 'name' | 'time' | 'trip_day_id' | 'deleted_at'>>;
  days: ReadonlyMap<string, Pick<TripDay, 'id' | 'date' | 'deleted_at'>>;
};

export function makeContext(
  stops: readonly Pick<Stop, 'id' | 'name' | 'time' | 'trip_day_id' | 'deleted_at'>[],
  days: readonly Pick<TripDay, 'id' | 'date' | 'deleted_at'>[],
): ReservationContext {
  return {
    stops: new Map(stops.filter((s) => s.deleted_at === null).map((s) => [s.id, s])),
    days: new Map(days.filter((d) => d.deleted_at === null).map((d) => [d.id, d])),
  };
}

/** O dia da reserva: o da parada, senão o dia ligado, senão a data do início; null sem nada. */
export function reservationDate(r: Reservation, ctx: ReservationContext): string | null {
  const stop = r.stop_id ? ctx.stops.get(r.stop_id) : undefined;
  const viaStop = stop ? ctx.days.get(stop.trip_day_id)?.date : undefined;
  if (viaStop) return viaStop;
  const day = r.trip_day_id ? ctx.days.get(r.trip_day_id)?.date : undefined;
  if (day) return day;
  return r.start_at ? isoToWall(r.start_at).date : null;
}

/** Hora de ordenar dentro do dia: o início, senão o horário da parada, senão o fim do dia. */
function sortTime(r: Reservation, ctx: ReservationContext): string {
  if (r.start_at) return isoToWall(r.start_at).time;
  const stop = r.stop_id ? ctx.stops.get(r.stop_id) : undefined;
  return stop?.time ? hhmm(stop.time) : '99:99';
}

export type ReservationGroup = { date: string | null; items: Reservation[] };

/** Agrupadas por dia, em ordem de data e de hora; as sem dia por último. */
export function groupReservations(
  reservations: readonly Reservation[],
  ctx: ReservationContext,
): ReservationGroup[] {
  const groups = new Map<string, ReservationGroup>();
  for (const r of reservations) {
    if (r.deleted_at !== null) continue;
    const date = reservationDate(r, ctx);
    const key = date ?? '';
    const g = groups.get(key) ?? { date, items: [] };
    g.items.push(r);
    groups.set(key, g);
  }
  // datas ISO se ordenam como texto; o "sem dia" vai por último
  return [...groups.values()]
    .sort((a, b) =>
      a.date === null ? 1 : b.date === null ? -1 : a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    )
    .map((g) => ({
      date: g.date,
      items: g.items.sort(
        (a, b) =>
          sortTime(a, ctx).localeCompare(sortTime(b, ctx)) || a.name.localeCompare(b.name, 'pt-BR'),
      ),
    }));
}

/** Noites de hospedagem pelas datas de parede (13/12 → 14/12 = 1 noite). */
export function nightsOf(r: Pick<Reservation, 'type' | 'start_at' | 'end_at'>): number | null {
  if (r.type !== 'hotel' || !r.start_at || !r.end_at) return null;
  const n = differenceInCalendarDays(
    parseISO(isoToWall(r.end_at).date),
    parseISO(isoToWall(r.start_at).date),
  );
  return n > 0 ? n : null;
}

/** "16:30 → dom 13/12 07:00 · 2 noites", "19:00", "14:00 → 18:00". Vazio sem horário. */
export function timeLabel(r: Pick<Reservation, 'type' | 'start_at' | 'end_at'>): string {
  if (!r.start_at) return '';
  const start = isoToWall(r.start_at);
  let out = start.time;
  if (r.end_at) {
    const end = isoToWall(r.end_at);
    out +=
      end.date === start.date ? ` → ${end.time}` : ` → ${formatDayShort(end.date)} ${end.time}`;
  }
  const nights = nightsOf(r);
  if (nights) out += ` · ${nights} ${nights === 1 ? 'noite' : 'noites'}`;
  return out;
}

export type CancelInfo = {
  /** "Cancelamento grátis até 08/12" */
  label: string;
  /** faltam 3 dias ou menos */
  soon: boolean;
  /** o prazo já passou */
  past: boolean;
};

export function cancelInfo(r: Pick<Reservation, 'cancel_until'>, today: string): CancelInfo | null {
  if (!r.cancel_until) return null;
  const left = differenceInCalendarDays(parseISO(r.cancel_until), parseISO(today));
  const [, m, d] = r.cancel_until.split('-');
  return {
    label:
      left < 0 ? `Prazo de cancelamento passou (${d}/${m})` : `Cancelamento grátis até ${d}/${m}`,
    soon: left >= 0 && left <= 3,
    past: left < 0,
  };
}

/**
 * A política digitada diz algo além do prazo? "Cancelamento grátis até 08/12." não diz (o seed é
 * assim); "Grátis até 08/12, depois 1 diária" diz. Evita a mesma frase duas vezes na folha.
 */
export function policyAdds(policy: string | null, label: string): boolean {
  if (!policy) return false;
  const norm = (s: string) =>
    s
      .toLocaleLowerCase('pt-BR')
      .replace(/[^\p{L}\p{N}/]+/gu, ' ')
      .trim();
  return !norm(label).includes(norm(policy));
}

/**
 * As reservas que importam agora, para o "Ver reserva" no "Agora" e no card da parada: as ligadas à
 * próxima parada e à atual, e a hospedagem em curso (o check-out do hotel de ontem). A próxima vem
 * primeiro: é para onde se vai.
 */
export function reservationsForNow(
  state: { at: Pick<Stop, 'id'> | null; next: Pick<Stop, 'id'> | null },
  reservations: readonly Reservation[],
  now: Date,
): Reservation[] {
  const alive = reservations.filter((r) => r.deleted_at === null);
  const out: Reservation[] = [];
  const add = (r: Reservation | undefined) => {
    if (r && !out.includes(r)) out.push(r);
  };
  for (const stop of [state.next, state.at]) {
    if (stop) for (const r of alive.filter((x) => x.stop_id === stop.id)) add(r);
  }
  const t = now.getTime();
  for (const r of alive) {
    if (r.type !== 'hotel' || !r.start_at || !r.end_at) continue;
    if (new Date(r.start_at).getTime() <= t && t <= new Date(r.end_at).getTime()) add(r);
  }
  return out;
}

/** As reservas de uma parada, para o card dela. */
export function reservationsOfStop(
  stopId: string,
  reservations: readonly Reservation[],
): Reservation[] {
  return reservations.filter((r) => r.deleted_at === null && r.stop_id === stopId);
}

/**
 * O horário dito por extenso na folha "Ver reserva": hotel fala em check-in e saída; o resto, em
 * início e fim. "Check-in 16:30 · saída dom 13/12 07:00".
 */
export function whenLabel(r: Pick<Reservation, 'type' | 'start_at' | 'end_at'>): string {
  if (!r.start_at) return '';
  const start = isoToWall(r.start_at);
  const hotel = r.type === 'hotel';
  const parts = [`${hotel ? 'Check-in' : 'Início'} ${formatDayShort(start.date)} ${start.time}`];
  if (r.end_at) {
    const end = isoToWall(r.end_at);
    const day = end.date === start.date ? '' : `${formatDayShort(end.date)} `;
    parts.push(`${hotel ? 'saída' : 'fim'} ${day}${end.time}`);
  }
  return parts.join(' · ');
}
