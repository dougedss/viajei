import { Plus, Ticket } from 'lucide-react';
import { useSearchParams, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useTrip } from '@/features/trips/queries.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { useTripMedia, useTripMediaPrefetch } from '@/lib/media/hooks.ts';
import { formatDayShort } from '@/lib/time/index.ts';
import { ReservationCard } from '../components/ReservationCard.tsx';
import { ReservationSheet } from '../components/ReservationSheet.tsx';
import { countByReservation, useTripReservations } from '../queries.ts';
import { groupReservations, makeContext } from '../rules.ts';

/**
 * As reservas da viagem, por dia. Tocar numa abre o "Ver reserva" (código grande, ligar, Maps,
 * prints e PDFs); `?abrir=<id>` abre direto, que é para onde o aviso de prazo de cancelamento leva.
 */
export default function ReservasPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const reservations = useTripReservations(tripId);
  const media = useTripMedia(tripId, (row) => row.reservation_id !== null);
  const [params, setParams] = useSearchParams();
  useTripMediaPrefetch(tripId);

  if (trip === undefined || days === undefined || reservations === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const today = todayISO();
  const ctx = makeContext(stops, days);
  const groups = groupReservations(reservations, ctx);
  const byReservation = countByReservation(media);
  const openId = params.get('abrir');
  const open = reservations.find((r) => r.id === openId) ?? null;
  const linkedStop = open?.stop_id ? (stops.find((s) => s.id === open.stop_id) ?? null) : null;
  const dayIndex = new Map(days.map((d, i) => [d.date, i + 1]));
  const setOpen = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('abrir', id);
        else p.delete('abrir');
        return p;
      },
      { replace: true },
    );

  return (
    <div className="grid gap-5">
      <PageHeader
        back={`/viagens/${trip.id}/detalhes`}
        title="Reservas"
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
        actions={
          reservations.length > 0 ? (
            <ButtonLink to={`/viagens/${trip.id}/reservas/nova`} size="sm">
              <Plus className="size-4" aria-hidden="true" />
              Nova
            </ButtonLink>
          ) : undefined
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="Nenhuma reserva ainda"
          text="Hotel, ingresso, restaurante: o código, o telefone e o voucher ficam aqui e abrem sem sinal, no balcão."
          action={
            <ButtonLink to={`/viagens/${trip.id}/reservas/nova`} size="md">
              <Plus className="size-5" aria-hidden="true" />
              Adicionar reserva
            </ButtonLink>
          }
        />
      ) : (
        groups.map((g) => (
          <section
            key={g.date ?? 'sem-dia'}
            className="grid gap-3"
            aria-label={g.date ?? 'Sem dia'}
          >
            <h2 className="label-caps text-accent-ink">
              {g.date
                ? `${formatDayShort(g.date).toUpperCase()}${dayIndex.has(g.date) ? ` · dia ${dayIndex.get(g.date) ?? ''}` : ''}`
                : 'Sem dia'}
            </h2>
            {g.items.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                media={byReservation.get(r.id) ?? []}
                today={today}
                onOpen={() => setOpen(r.id)}
              />
            ))}
          </section>
        ))
      )}

      <ReservationSheet
        reservation={open}
        stop={linkedStop}
        today={today}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
