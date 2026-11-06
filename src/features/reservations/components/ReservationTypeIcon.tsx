import { BedDouble, Bookmark, Ticket, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { ReservationType } from '@shared/constants.ts';
import { cx } from '@/lib/cx.ts';
import { asReservationType } from '../rules.ts';

const ICONS: Record<ReservationType, LucideIcon> = {
  hotel: BedDouble,
  ticket: Ticket,
  restaurant: UtensilsCrossed,
  other: Bookmark,
};

/** O ícone do tipo num quadrado na cor das reservas (a mesma do atalho da visão geral). */
export function ReservationTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[asReservationType(type)];
  return (
    <span
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-[14px] bg-[color-mix(in_oklab,#6A62C9_16%,transparent)] text-[#6A62C9]',
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-5" />
    </span>
  );
}
