import { ChevronRight, CloudOff, Paperclip, TriangleAlert } from 'lucide-react';
import { formatMoney } from '@/features/trips/rules.ts';
import type { Reservation } from '@/lib/db/schema.ts';
import type { MediaItem } from '@/lib/media/hooks.ts';
import { cancelInfo, timeLabel, typeLabel } from '../rules.ts';
import { ReservationTypeIcon } from './ReservationTypeIcon.tsx';

type Props = {
  reservation: Reservation;
  media: readonly MediaItem[];
  today: string;
  onOpen: () => void;
};

/** Uma reserva na lista: tipo, nome, horário, código, valor, prazo e os anexos. */
export function ReservationCard({ reservation: r, media, today, onOpen }: Props) {
  const when = timeLabel(r);
  const cancel = cancelInfo(r, today);
  const pending = media.filter((m) => m.pending).length;
  const docs = media.length;
  const label = typeLabel(r.type);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-3 rounded-card bg-card p-4 text-left shadow-card"
      aria-label={`${label}: ${r.name}`}
    >
      <ReservationTypeIcon type={r.type} />
      <span className="grid min-w-0 gap-1">
        <span className="text-[17px] leading-snug font-semibold break-words">{r.name}</span>
        {when ? <span className="num text-[15px] text-ink-2">{when}</span> : null}
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-ink-2">
          {r.confirmation_code ? (
            <span>
              Código <span className="num font-semibold text-ink">{r.confirmation_code}</span>
            </span>
          ) : null}
          {r.amount !== null ? <span className="num">{formatMoney(r.amount)}</span> : null}
          {r.booked_via ? <span>por {r.booked_via}</span> : null}
        </span>
        {cancel ? (
          <span
            className={
              cancel.soon
                ? 'inline-flex w-fit items-center gap-1 rounded-full bg-tight/20 px-2.5 py-0.5 text-[13px] font-semibold text-tight-ink'
                : 'text-[14px] text-ink-2'
            }
          >
            {cancel.soon ? <TriangleAlert className="size-3.5" aria-hidden="true" /> : null}
            {cancel.label}
          </span>
        ) : null}
        {docs > 0 ? (
          <span className="flex items-center gap-1.5 text-[14px] font-semibold text-accent-ink">
            <Paperclip className="size-4" aria-hidden="true" />
            {docs === 1 ? '1 anexo' : `${docs} anexos`}
            {pending > 0 ? (
              <span className="inline-flex items-center gap-1 font-normal text-ink-2">
                <CloudOff className="size-3.5" aria-hidden="true" />
                {pending === 1 ? 'aguardando sinal' : `${pending} aguardando sinal`}
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <ChevronRight className="mt-3 size-5 text-ink-2" aria-hidden="true" />
    </button>
  );
}
