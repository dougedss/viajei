import { ChevronRight } from 'lucide-react';
import type { Reservation } from '@/lib/db/schema.ts';
import { ReservationTypeIcon } from './ReservationTypeIcon.tsx';

/**
 * No "Agora", quando a parada atual ou a próxima tem reserva (ou há uma hospedagem em curso): uma
 * linha por reserva, com o código já visível, que abre o "Ver reserva". Funciona sem sinal.
 */
export function NowReservations({
  reservations,
  onOpen,
}: {
  reservations: readonly Reservation[];
  onOpen: (r: Reservation) => void;
}) {
  if (reservations.length === 0) return null;
  return (
    <div className="grid gap-2 border-t border-line pt-3">
      {reservations.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r)}
          className="flex min-h-14 w-full items-center gap-3 rounded-field bg-paper px-3 text-left shadow-[inset_0_0_0_1px_var(--color-line)]"
        >
          <ReservationTypeIcon type={r.type} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate mv-text-16 font-semibold">{r.name}</span>
            {r.confirmation_code ? (
              <span className="block mv-text-14 text-ink-2">
                código <span className="num font-semibold text-ink">{r.confirmation_code}</span>
              </span>
            ) : null}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 mv-text-15 font-semibold text-accent-ink">
            Ver reserva
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </button>
      ))}
    </div>
  );
}
