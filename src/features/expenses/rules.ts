import {
  EXPENSE_CATEGORY_KEYS,
  type ExpenseCategory,
  type ReservationType,
  type StopKind,
} from '@shared/constants.ts';
import type { DayState } from '@/features/travel-mode/rules.ts';
import type { Expense, Reservation, Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { isoToWall } from '@/lib/time/zone.ts';

/**
 * Gastos, puros: categoria pela parada e pela reserva, totais em centavos (somar reais em ponto
 * flutuante erra no centavo), faixas da barra do orçamento e o que o "+ Gasto" do Modo Viagem já
 * traz preenchido.
 */
const BY_STOP_KIND: Record<StopKind, ExpenseCategory> = {
  food: 'food',
  hotel: 'lodging',
  nature: 'attractions',
  winery: 'attractions',
  event: 'attractions',
  city: 'attractions',
  origin: 'fuel',
  transit: 'fuel',
  other: 'other',
};

export function categoryForStop(kind: string): ExpenseCategory {
  return Object.hasOwn(BY_STOP_KIND, kind) ? BY_STOP_KIND[kind as StopKind] : 'other';
}

/** A categoria de uma linha: um valor que o aparelho não conhece vira "outro". */
export function asCategory(value: string): ExpenseCategory {
  return (EXPENSE_CATEGORY_KEYS as readonly string[]).includes(value)
    ? (value as ExpenseCategory)
    : 'other';
}

const BY_RESERVATION_TYPE: Record<ReservationType, ExpenseCategory> = {
  hotel: 'lodging',
  ticket: 'attractions',
  restaurant: 'food',
  other: 'other',
};

export function categoryForReservation(type: string): ExpenseCategory {
  return Object.hasOwn(BY_RESERVATION_TYPE, type)
    ? BY_RESERVATION_TYPE[type as ReservationType]
    : 'other';
}

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number) => cents / 100;

type Live = Pick<Expense, 'amount' | 'category' | 'deleted_at'>;

export type Totals = {
  /** em centavos */
  total: number;
  byCategory: Record<ExpenseCategory, number>;
};

export function totals(expenses: readonly Live[]): Totals {
  const byCategory = Object.fromEntries(EXPENSE_CATEGORY_KEYS.map((k) => [k, 0])) as Record<
    ExpenseCategory,
    number
  >;
  let total = 0;
  for (const e of expenses) {
    if (e.deleted_at !== null) continue;
    const c = toCents(e.amount);
    total += c;
    byCategory[asCategory(e.category)] += c;
  }
  return { total, byCategory };
}

/** As categorias com gasto, da maior para a menor, com a fração do total (texto, não só cor). */
export function categoryBars(
  t: Totals,
): { category: ExpenseCategory; cents: number; share: number }[] {
  return EXPENSE_CATEGORY_KEYS.map((category) => ({
    category,
    cents: t.byCategory[category],
    share: t.total === 0 ? 0 : t.byCategory[category] / t.total,
  }))
    .filter((b) => b.cents > 0)
    .sort((a, b) => b.cents - a.cents);
}

/** Os tokens de estado: no horário até 80%, aperta até 100%, atrasado acima. */
export type BudgetState = 'on-time' | 'tight' | 'late';

export type Budget = {
  state: BudgetState;
  /** gasto ÷ orçamento (pode passar de 1) */
  ratio: number;
  /** centavos que faltam (negativo: o quanto passou) */
  leftCents: number;
};

export function budget(totalCents: number, budgetReais: number | null): Budget | null {
  if (budgetReais === null || budgetReais <= 0) return null;
  const budgetCents = toCents(budgetReais);
  const ratio = totalCents / budgetCents;
  const state: BudgetState = ratio <= 0.8 ? 'on-time' : ratio <= 1 ? 'tight' : 'late';
  return { state, ratio, leftCents: budgetCents - totalCents };
}

/** "73%", arredondado para baixo até 100 (99,6% não vira 100% antes de chegar). */
export function percent(ratio: number): string {
  const p = ratio < 1 ? Math.floor(ratio * 100) : Math.round(ratio * 100);
  return `${p}%`;
}

export type DayGroup<T> = { date: string | null; items: T[]; cents: number };

/**
 * Por dia, na ordem da viagem; dentro do dia, o mais recente primeiro. Gasto com data fora do período
 * (a viagem encurtou depois) fica num grupo próprio, no fim, com `date` nulo.
 */
export function groupByDay<
  T extends Pick<Expense, 'date' | 'amount' | 'created_at' | 'deleted_at'>,
>(expenses: readonly T[], trip: Pick<Trip, 'start_date' | 'end_date'>): DayGroup<T>[] {
  const live = expenses.filter((e) => e.deleted_at === null);
  const inside = new Map<string, T[]>();
  const outside: T[] = [];
  for (const e of live) {
    if (e.date < trip.start_date || e.date > trip.end_date) outside.push(e);
    else inside.set(e.date, [...(inside.get(e.date) ?? []), e]);
  }
  const byRecent = (a: T, b: T) => b.created_at.localeCompare(a.created_at);
  const sum = (xs: readonly T[]) => xs.reduce((acc, e) => acc + toCents(e.amount), 0);
  const groups: DayGroup<T>[] = [...inside.keys()].sort().map((date) => {
    const items = (inside.get(date) ?? []).sort(byRecent);
    return { date, items, cents: sum(items) };
  });
  if (outside.length > 0) {
    groups.push({ date: null, items: outside.sort(byRecent), cents: sum(outside) });
  }
  return groups;
}

export type ExpenseDefaults = { stop_id: string | null; category: ExpenseCategory };

/**
 * O "+ Gasto" do Modo Viagem: parado numa parada (chegou e ainda não saiu), é ela, com a categoria
 * pelo tipo dela; na estrada, nenhuma parada e combustível; antes de sair, o mesmo da estrada se a
 * primeira é um nó de saída, senão "outro".
 */
export function expenseDefaults(state: Pick<DayState, 'at' | 'onRoad' | 'next'>): ExpenseDefaults {
  const at = state.at;
  // um nó de saída concluído já é estrada (Partiu! marca a saída e a conclusão de uma vez, D29)
  const departure = at !== null && (at.kind === 'origin' || at.kind === 'transit');
  if (at && !state.onRoad && !departure) {
    return { stop_id: at.id, category: categoryForStop(at.kind) };
  }
  if (at) return { stop_id: null, category: 'fuel' };
  const next = state.next;
  if (next && (next.kind === 'origin' || next.kind === 'transit')) {
    return { stop_id: null, category: 'fuel' };
  }
  return { stop_id: null, category: 'other' };
}

/** A data dentro da viagem mais perto de `date`. */
export function clampToTrip(date: string, trip: Pick<Trip, 'start_date' | 'end_date'>): string {
  if (date < trip.start_date) return trip.start_date;
  if (date > trip.end_date) return trip.end_date;
  return date;
}

/**
 * A data do gasto de uma reserva: a do check-in (hora de parede de São Paulo); sem horário, o dia da
 * parada ou o dia ligado; sem nada disso, o primeiro dia. Sempre dentro da viagem.
 */
export function reservationExpenseDate(
  r: Pick<Reservation, 'start_at' | 'stop_id' | 'trip_day_id'>,
  stops: readonly Pick<Stop, 'id' | 'trip_day_id'>[],
  days: readonly Pick<TripDay, 'id' | 'date'>[],
  trip: Pick<Trip, 'start_date' | 'end_date'>,
): string {
  if (r.start_at) return clampToTrip(isoToWall(r.start_at).date, trip);
  const dayId = r.stop_id ? stops.find((s) => s.id === r.stop_id)?.trip_day_id : r.trip_day_id;
  const day = dayId ? days.find((d) => d.id === dayId) : undefined;
  return day ? clampToTrip(day.date, trip) : trip.start_date;
}

const brlShort = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/** "R$ 2.180", sem centavos: o atalho da visão geral. */
export function formatMoneyShort(cents: number): string {
  return brlShort.format(Math.round(cents / 100));
}
