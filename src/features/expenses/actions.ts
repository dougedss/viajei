import type { ExpenseCategory } from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Expense, type Reservation, type Trip } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { reservationExpenseId } from './ids.ts';
import { categoryForReservation, reservationExpenseDate } from './rules.ts';

/** As escritas dos gastos, pela `mutate` (offline primeiro). */
export type ExpenseValues = {
  amount: number;
  category: ExpenseCategory;
  date: string;
  paid_by: string;
  stop_id: string | null;
  notes: string | null;
};

export async function createExpense(
  tripId: string,
  uid: string,
  values: ExpenseValues,
): Promise<string> {
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('expenses', {
    id,
    trip_id: tripId,
    reservation_id: null,
    ...values,
    created_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function updateExpense(id: string, values: ExpenseValues): Promise<void> {
  const current = await db.expenses.get(id);
  if (!current) throw new Error('O gasto não existe mais neste aparelho.');
  const changes = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => current[k as keyof ExpenseValues] !== v),
  );
  await mutate.patch('expenses', id, changes);
}

/** Excluir, com o desfazer que devolve a linha inteira (`mutate.restore`). */
export async function removeExpense(expense: Expense): Promise<() => Promise<void>> {
  await mutate.remove('expenses', expense.id);
  return () => mutate.restore('expenses', expense);
}

/** Desfazer o "Lançar como gasto" logo depois do toque. */
export async function undoLaunch(id: string): Promise<void> {
  const row = await db.expenses.get(id);
  if (row?.deleted_at === null) await mutate.remove('expenses', id);
}

/**
 * "Lançar como gasto": a reserva com valor vira um gasto ligado a ela, com o valor, a categoria pelo
 * tipo, a data do check-in e quem tocou como quem pagou (dá para mudar depois). O id determinístico
 * faz dois aparelhos escreverem a mesma linha; um gasto excluído e lançado de novo volta a ser o mesmo.
 */
export async function launchReservationExpense(
  trip: Pick<Trip, 'id' | 'start_date' | 'end_date'>,
  reservation: Reservation,
  uid: string,
): Promise<string> {
  if (reservation.amount === null || reservation.amount <= 0) {
    throw new Error('A reserva não tem valor.');
  }
  const id = await reservationExpenseId(reservation.id);
  const [stops, days] = await Promise.all([
    db.stops.where('trip_id').equals(trip.id).toArray(),
    db.trip_days.where('trip_id').equals(trip.id).toArray(),
  ]);
  const now = new Date().toISOString();
  await mutate.insert('expenses', {
    id,
    trip_id: trip.id,
    reservation_id: reservation.id,
    stop_id: reservation.stop_id,
    amount: reservation.amount,
    category: categoryForReservation(reservation.type),
    date: reservationExpenseDate(reservation, stops, days, trip),
    paid_by: uid,
    notes: null,
    created_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}
