import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, type Expense } from '@/lib/db/schema.ts';
import { reservationExpenseId } from './ids.ts';

/** Os gastos vivos da viagem. `undefined` enquanto carrega. */
export function useTripExpenses(tripId: string): Expense[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.expenses.where('trip_id').equals(tripId).toArray()).filter(
        (e) => e.deleted_at === null,
      ),
    [tripId],
  );
}

/** O gasto lançado de uma reserva, pelo id determinístico; `null` quando não há. */
export function useExpense(id: string | null): Expense | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const e = await db.expenses.get(id);
    return e?.deleted_at === null ? e : null;
  }, [id]);
}

/** O id determinístico do gasto de uma reserva (SHA-1 do v5, assíncrono). */
export function useReservationExpenseId(reservationId: string): string | null {
  const [state, setState] = useState<{ from: string; id: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void reservationExpenseId(reservationId).then((id) => {
      if (alive) setState({ from: reservationId, id });
    });
    return () => {
      alive = false;
    };
  }, [reservationId]);
  return state?.from === reservationId ? state.id : null;
}
