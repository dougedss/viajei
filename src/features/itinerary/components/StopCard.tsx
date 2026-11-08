import {
  ArrowDown,
  ArrowUp,
  Clock,
  ExternalLink,
  GripVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Card } from '@/components/ui/Card.tsx';
import type { Stop } from '@/lib/db/schema.ts';
import { googleMapsUrl, wazeUrl } from '@/lib/links/index.ts';
import { formatDuration, hhmm } from '@/lib/time/index.ts';
import { kindLabel } from '../stop-kinds.ts';
import { StopKindIcon } from './StopKindIcon.tsx';

type Props = {
  stop: Stop;
  index: number;
  count: number;
  /** sugestão de deslocamento vinda da rota real, quando a parada não tem valor */
  suggestion?: number | undefined;
  onAcceptSuggestion?: (minutes: number) => void;
  onEdit: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  /** props da alça de arrasto (dnd-kit) */
  handleProps?: ComponentProps<'button'>;
  /** um detalhe pequeno embaixo do endereço (a previsão do tempo no horário da parada) */
  detail?: ReactNode;
};

/** Abrir no Google Maps e no Waze: é assim que se navega (o Viajei não navega). */
export function NavLinks({ stop }: { stop: Stop }) {
  const maps = googleMapsUrl(stop);
  const waze = wazeUrl(stop);
  if (!maps && !waze) return null;
  const cls =
    'inline-flex min-h-12 items-center gap-1 rounded-full bg-card px-3 text-[14px] font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';
  return (
    <div className="flex flex-wrap gap-2">
      {maps ? (
        <a href={maps} target="_blank" rel="noreferrer" className={cls}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Google Maps
        </a>
      ) : null}
      {waze ? (
        <a href={waze} target="_blank" rel="noreferrer" className={cls}>
          <ExternalLink className="size-4" aria-hidden="true" />
          Waze
        </a>
      ) : null}
    </div>
  );
}

/** Uma parada na edição do dia: tipo, horário, nome, endereço, fecha às, deslocamento e ações. */
export function StopCard({
  stop,
  index,
  count,
  suggestion,
  onAcceptSuggestion,
  onEdit,
  onRemove,
  onMove,
  handleProps,
  detail,
}: Props) {
  const travel = stop.travel_minutes_to_next;
  return (
    <Card role="group" aria-label={stop.name} className="grid gap-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label={`Arrastar ${stop.name}`}
          className="grid size-12 shrink-0 cursor-grab touch-none place-items-center rounded-[12px] text-ink-2 active:cursor-grabbing"
          {...handleProps}
        >
          <GripVertical className="size-5" aria-hidden="true" />
        </button>
        <StopKindIcon kind={stop.kind} filled className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {stop.time ? (
              <span className="num text-[22px] font-semibold">{hhmm(stop.time)}</span>
            ) : null}
            <span className="text-[17px] font-semibold break-words">{stop.name}</span>
          </p>
          <p className="text-[14px] text-ink-2">
            {kindLabel(stop.kind)}
            {stop.closes_at ? ` · fecha às ${hhmm(stop.closes_at)}` : ''}
          </p>
          {stop.address ? <p className="text-[14px] text-ink-2">{stop.address}</p> : null}
          {stop.notes ? (
            <p className="mt-1 text-[14px] whitespace-pre-line text-ink-2">{stop.notes}</p>
          ) : null}
          {detail}
        </div>
      </div>

      <NavLinks stop={stop} />

      {index < count - 1 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[14px] text-ink-2">
          <Clock className="size-4" aria-hidden="true" />
          {travel !== null ? (
            <span>{formatDuration(travel)} até a próxima</span>
          ) : suggestion !== undefined ? (
            <>
              <span>Deslocamento: a rota sugere {formatDuration(suggestion)}</span>
              <button
                type="button"
                onClick={() => onAcceptSuggestion?.(suggestion)}
                className="inline-flex min-h-12 items-center rounded-full bg-accent-soft px-3 font-semibold text-accent-ink"
              >
                Usar {formatDuration(suggestion)}
              </button>
            </>
          ) : (
            <span>Deslocamento até a próxima não informado</span>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label={`Subir ${stop.name}`}
          className="grid size-12 place-items-center rounded-[12px] text-ink-2 disabled:opacity-30"
        >
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === count - 1}
          aria-label={`Descer ${stop.name}`}
          className="grid size-12 place-items-center rounded-[12px] text-ink-2 disabled:opacity-30"
        >
          <ArrowDown className="size-5" aria-hidden="true" />
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${stop.name}`}
          className="inline-flex min-h-12 items-center gap-1 rounded-[12px] px-3 text-[15px] font-semibold text-accent-ink"
        >
          <Pencil className="size-4" aria-hidden="true" />
          Editar
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Excluir ${stop.name}`}
          className="inline-flex min-h-12 items-center gap-1 rounded-[12px] px-3 text-[15px] font-semibold text-ink-2"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir
        </button>
      </div>
    </Card>
  );
}
