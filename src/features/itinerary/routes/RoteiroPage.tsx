import { CalendarDays, ChevronRight, ClipboardPaste, Navigation } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useTrip } from '@/features/trips/queries.ts';
import { formatDayShort, hhmm } from '@/lib/time/index.ts';
import { useTripDays, useTripStops } from '../queries.ts';
import { sortStops } from '../rules.ts';

export default function RoteiroPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);

  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}`}
        title="Roteiro"
        eyebrow={<span className="text-[15px] text-ink-2">{trip.name}</span>}
        actions={
          <ButtonLink to={`/viagens/${trip.id}/viagem`} size="sm" aria-label="Abrir o Modo Viagem">
            <Navigation className="size-4" aria-hidden="true" />
            Agora
          </ButtonLink>
        }
      />

      {days.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Sem dias ainda"
          text="Os dias nascem das datas da viagem. Confira as datas em Editar viagem."
        />
      ) : (
        <ol className="grid gap-3" aria-label="Dias da viagem">
          {days.map((day, i) => {
            const dayStops = sortStops(stops.filter((s) => s.trip_day_id === day.id));
            const first = dayStops.find((s) => s.time)?.time;
            const last = [...dayStops].reverse().find((s) => s.time)?.time;
            return (
              <li key={day.id}>
                <Link
                  to={`/viagens/${trip.id}/roteiro/${day.id}`}
                  className="block rounded-card"
                  aria-label={`Dia ${i + 1}, ${formatDayShort(day.date)}`}
                >
                  <Card className="flex items-center gap-3">
                    <span className="grid size-14 shrink-0 place-items-center rounded-[16px] bg-accent-soft text-accent-ink">
                      <span className="num text-[22px] leading-none font-bold">{i + 1}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold tracking-wide text-ink-2 uppercase">
                        {formatDayShort(day.date)}
                      </span>
                      <span className="block truncate text-[18px] font-semibold">
                        {day.title ?? `Dia ${i + 1}`}
                      </span>
                      <span className="block text-[14px] text-ink-2">
                        {dayStops.length === 0
                          ? 'Nenhuma parada'
                          : `${dayStops.length} ${dayStops.length === 1 ? 'parada' : 'paradas'}${
                              first && last ? ` · ${hhmm(first)} a ${hhmm(last)}` : ''
                            }`}
                      </span>
                    </span>
                    <ChevronRight className="size-5 shrink-0 text-ink-2" aria-hidden="true" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      {days.length > 0 ? (
        <Link
          to={`/viagens/${trip.id}/importar`}
          className="inline-flex min-h-12 items-center justify-center gap-2 text-[15px] font-semibold text-accent-ink"
        >
          <ClipboardPaste className="size-5" aria-hidden="true" />
          {stops.length === 0 ? 'Colar roteiro' : 'Acrescentar de um texto'}
        </Link>
      ) : null}
    </div>
  );
}
