import { CircleCheckBig, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { formatMoney } from '@/features/trips/rules.ts';
import type { Reservation } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { launchReservationExpense, undoLaunch } from '../actions.ts';
import { useExpense, useReservationExpenseId } from '../queries.ts';

/**
 * "Lançar como gasto" numa reserva com valor: um toque cria o gasto ligado a ela (id determinístico,
 * dois aparelhos nunca contam a mesma reserva duas vezes). Lançado, o botão diz "Gasto lançado" e
 * leva a ele.
 */
export function LaunchExpense({ reservation }: { reservation: Reservation }) {
  const trip = useTrip(reservation.trip_id);
  const { session } = useSession();
  const toast = useToast();
  const id = useReservationExpenseId(reservation.id);
  const expense = useExpense(id);
  const [busy, setBusy] = useState(false);
  if (reservation.amount === null || reservation.amount <= 0 || !trip || id === null) return null;
  if (expense === undefined) return null;
  if (expense) {
    return (
      <ButtonLink
        to={`/viagens/${trip.id}/gastos?abrir=${expense.id}`}
        variant="secondary"
        size="md"
      >
        <CircleCheckBig className="size-4 text-on-time-ink" aria-hidden="true" />
        Gasto lançado · {formatMoney(expense.amount)}
      </ButtonLink>
    );
  }
  return (
    <Button
      variant="secondary"
      size="md"
      loading={busy}
      onClick={() => {
        setBusy(true);
        void launchReservationExpense(trip, reservation, session?.user.id ?? '')
          .then((launched) =>
            toast.show({
              title: 'Gasto lançado',
              description: formatMoney(reservation.amount),
              kind: 'ok',
              action: { label: 'Desfazer', onClick: () => void undoLaunch(launched) },
            }),
          )
          .finally(() => setBusy(false));
      }}
    >
      <Wallet className="size-4" aria-hidden="true" />
      Lançar como gasto
    </Button>
  );
}
