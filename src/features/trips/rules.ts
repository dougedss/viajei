import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Trip, TripMember } from '@/lib/db/schema.ts';

export type TripStatus = 'ongoing' | 'upcoming' | 'past';
type Dates = Pick<Trip, 'start_date' | 'end_date'>;

/** Data de hoje em hora de parede local, no formato das colunas `date`. */
export function todayISO(now = new Date()): string {
  return format(now, 'yyyy-MM-dd');
}

export function tripStatus(trip: Dates, today: string): TripStatus {
  if (today < trip.start_date) return 'upcoming';
  if (today > trip.end_date) return 'past';
  return 'ongoing';
}

/** Quantos dias tem a viagem, contando o primeiro e o último. */
export function tripLength(trip: Dates): number {
  return differenceInCalendarDays(parseISO(trip.end_date), parseISO(trip.start_date)) + 1;
}

/** Em andamento primeiro; depois as próximas, da mais perto para a mais longe; por fim as passadas, da mais recente. */
export function sortTrips<T extends Dates>(trips: readonly T[], today: string): T[] {
  const weight: Record<TripStatus, number> = { ongoing: 0, upcoming: 1, past: 2 };
  return [...trips].sort((a, b) => {
    const sa = tripStatus(a, today);
    const sb = tripStatus(b, today);
    if (sa !== sb) return weight[sa] - weight[sb];
    if (sa === 'past') return b.end_date.localeCompare(a.end_date);
    return a.start_date.localeCompare(b.start_date);
  });
}

/** "11 a 14 de dezembro" ou "28 de nov. a 2 de dez." */
export function formatPeriod(start: string, end: string): string {
  const a = parseISO(start);
  const b = parseISO(end);
  if (start === end) return format(a, "d 'de' MMMM", { locale: ptBR });
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return sameMonth
    ? `${format(a, 'd', { locale: ptBR })} a ${format(b, "d 'de' MMMM", { locale: ptBR })}`
    : `${format(a, "d 'de' MMM", { locale: ptBR })} a ${format(b, "d 'de' MMM", { locale: ptBR })}`;
}

/** O que dizer no chip do card: "Hoje · dia 2 de 4", "Em 37 dias", "Amanhã", "Encerrada". */
export function statusLabel(trip: Dates, today: string): string {
  const status = tripStatus(trip, today);
  if (status === 'past') return 'Encerrada';
  if (status === 'ongoing') {
    const day = differenceInCalendarDays(parseISO(today), parseISO(trip.start_date)) + 1;
    return `Hoje · dia ${day} de ${tripLength(trip)}`;
  }
  const days = differenceInCalendarDays(parseISO(trip.start_date), parseISO(today));
  if (days === 1) return 'Amanhã';
  return `Em ${days} dias`;
}

export function statusKind(status: TripStatus): 'ok' | 'neutral' | 'off' {
  return status === 'ongoing' ? 'ok' : status === 'upcoming' ? 'neutral' : 'off';
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatMoney(value: number | null): string {
  return value === null ? '' : brl.format(value);
}

/**
 * "3000", "3.000", "3.000,50", "3000.50" e "R$ 3.000" viram número; vazio vira null; lixo vira NaN.
 * Com vírgula, o ponto é milhar. Sem vírgula, "3.000" (grupos de três) é milhar e "3000.50" é decimal.
 */
export function parseMoney(input: string): number | null {
  if (input.trim() === '') return null;
  const s = input.replace(/[^\d,.-]/g, '');
  if (s === '') return Number.NaN;
  const normalized = s.includes(',')
    ? s.replaceAll('.', '').replace(',', '.')
    : /^-?\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replaceAll('.', '')
      : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : Number.NaN;
}

export function memberLabel(member: Pick<TripMember, 'role' | 'status'>): string {
  if (member.role === 'owner') return 'Dono';
  return member.status === 'accepted' ? 'Membro' : 'Convite pendente';
}

/** Membros aceitos primeiro (dono na frente), convites pendentes por último; dentro, por ordem de entrada. */
export function sortMembers<T extends Pick<TripMember, 'role' | 'status' | 'created_at'>>(
  members: readonly T[],
): T[] {
  const weight = (m: T) => (m.role === 'owner' ? 0 : m.status === 'accepted' ? 1 : 2);
  return [...members].sort(
    (a, b) => weight(a) - weight(b) || a.created_at.localeCompare(b.created_at),
  );
}
