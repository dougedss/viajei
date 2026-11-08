import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { StopKindIcon } from '@/features/itinerary/components/StopKindIcon.tsx';
import type { Profile, RouteLeg, Stop } from '@/lib/db/schema.ts';
import { googleMapsUrl, wazeUrl } from '@/lib/links/index.ts';
import { formatDuration, formatStamp, hhmm } from '@/lib/time/index.ts';
import { formatKm } from '@/features/itinerary/rules.ts';
import { statusOf, type DayState, type StopStatus } from '../rules.ts';

type Props = {
  state: DayState;
  legs: Map<string, RouteLeg>;
  profiles: Map<string, Profile>;
  /** o que mais cada parada mostra na tela da viagem: notas do time, "Ver reserva", "Como foi?" */
  stopExtras?: ((stop: Stop) => ReactNode) | undefined;
  /** tocar no nome abre a folha da parada (fase 14); sem isto, o nome é só texto */
  onOpenStop?: ((stopId: string) => void) | undefined;
};

const STATUS_LABEL: Record<StopStatus, string> = {
  done: 'concluída',
  skipped: 'pulada',
  next: 'próxima',
  pending: 'pendente',
};

function Node({ status, stop }: { status: StopStatus; stop: Stop }) {
  if (status === 'done') return <StopKindIcon kind={stop.kind} filled className="size-10" />;
  if (status === 'next') {
    return (
      <span className="relative grid size-10 place-items-center" aria-hidden="true">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/40 motion-reduce:animate-none" />
        <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_3px_var(--color-accent)]" />
        <StopKindIcon kind={stop.kind} className="size-5" />
      </span>
    );
  }
  return (
    <span
      className={`grid size-10 place-items-center rounded-full shadow-[inset_0_0_0_2px_var(--color-line)] ${
        status === 'skipped' ? 'opacity-50' : ''
      }`}
      aria-hidden="true"
    >
      <StopKindIcon kind={stop.kind} className="size-5" />
    </span>
  );
}

/**
 * A lista acessível da trilha: a mesma informação da maquete (fase 5), em lista, para leitor de
 * tela e como fallback permanente. O carro está no último nó concluído; o halo pulsa no próximo.
 */
export function TrailList({ state, legs, profiles, stopExtras, onOpenStop }: Props) {
  return (
    <ol className="grid gap-0" aria-label="Trilha do dia">
      {state.stops.map((stop, i) => {
        const status = statusOf(stop, state);
        const leg = legs.get(stop.id);
        const isLast = i === state.stops.length - 1;
        const maps = googleMapsUrl(stop);
        const waze = wazeUrl(stop);
        const by = stop.done_by ? profiles.get(stop.done_by)?.name : undefined;
        return (
          <li
            key={stop.id}
            className="grid grid-cols-[40px_1fr] gap-x-3"
            aria-current={status === 'next' ? 'step' : undefined}
          >
            <Node status={status} stop={stop} />
            <div className={`min-w-0 pb-1 ${status === 'skipped' ? 'opacity-60' : ''}`}>
              <p className="flex flex-wrap items-baseline gap-x-2">
                {stop.time ? (
                  <span className="num mv-text-20 font-semibold">{hhmm(stop.time)}</span>
                ) : null}
                {onOpenStop ? (
                  <button
                    type="button"
                    onClick={() => onOpenStop(stop.id)}
                    className={`inline-flex min-h-12 items-center text-left mv-text-17 font-semibold text-accent-ink ${status === 'skipped' ? 'line-through' : ''}`}
                    data-stop-row={stop.id}
                  >
                    {stop.name}
                  </button>
                ) : (
                  <span
                    className={`mv-text-17 font-semibold ${status === 'skipped' ? 'line-through' : ''}`}
                  >
                    {stop.name}
                  </span>
                )}
                <span className="sr-only">, {STATUS_LABEL[status]}</span>
              </p>
              <p className="mv-text-15 text-ink-2">
                {status === 'done' && stop.done_at
                  ? `chegamos ${formatStamp(stop.done_at)}${by ? ` · ${by}` : ''}${
                      stop.departed_at ? ` · saímos ${formatStamp(stop.departed_at)}` : ''
                    }`
                  : status === 'next'
                    ? 'próxima'
                    : status === 'skipped'
                      ? 'pulada'
                      : stop.closes_at
                        ? `até ${hhmm(stop.closes_at)}`
                        : ''}
              </p>
              {maps || waze ? (
                <p className="flex gap-3 mv-text-15 font-semibold text-accent-ink">
                  {maps ? (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-12 items-center gap-1"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Maps
                    </a>
                  ) : null}
                  {waze ? (
                    <a
                      href={waze}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-12 items-center gap-1"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Waze
                    </a>
                  ) : null}
                </p>
              ) : null}
              {stopExtras?.(stop)}
            </div>
            {!isLast ? (
              <>
                <span className="mx-auto h-full min-h-8 w-0.5 bg-line" aria-hidden="true" />
                <p className="pb-3 mv-text-14 text-ink-2">
                  {stop.travel_minutes_to_next !== null
                    ? formatDuration(stop.travel_minutes_to_next)
                    : leg
                      ? formatDuration(leg.duration_s / 60)
                      : '—'}
                  {leg ? ` · ${formatKm(leg.distance_m)}` : ''}
                </p>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
