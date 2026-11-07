import { uuidV5 } from '@/lib/ids/uuid.ts';

/** O id do gasto de uma reserva: o mesmo em todo aparelho (o `check` do banco confere). */
export function reservationExpenseId(reservationId: string): Promise<string> {
  return uuidV5(reservationId, 'expense');
}
