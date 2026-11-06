import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useIsOwner, useTrip } from '@/features/trips/queries.ts';
import { removeMedia } from '@/lib/media/actions.ts';
import { useSession } from '@/lib/supabase/session.ts';
import {
  addReservationFiles,
  createReservation,
  removeReservation,
  updateReservation,
} from '../actions.ts';
import { ReservationForm } from '../components/ReservationForm.tsx';
import { useReservation, useReservationMedia } from '../queries.ts';

/** Nova reserva (`/reservas/nova`) ou edição (`/reservas/:reservationId/editar`). */
export default function ReservaFormPage() {
  const { tripId = '', reservationId } = useParams();
  const editing = reservationId !== undefined;
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const reservation = useReservation(reservationId ?? '');
  const media = useReservationMedia(tripId, reservationId ?? null);
  const { session } = useSession();
  const isOwner = useIsOwner(trip);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const uid = session?.user.id ?? '';

  if (trip === undefined || days === undefined || (editing && reservation === undefined)) {
    return <Splash />;
  }
  if (trip === null || (editing && !reservation)) return <NotFound />;
  const list = `/viagens/${trip.id}/reservas`;

  return (
    <div className="grid gap-5">
      <PageHeader
        back={editing && reservation ? `${list}?abrir=${reservation.id}` : list}
        title={editing ? 'Editar reserva' : 'Nova reserva'}
        eyebrow={<span className="label-caps text-accent-ink">{trip.name}</span>}
      />
      <ReservationForm
        {...(reservation ? { reservation } : {})}
        days={days}
        stops={stops}
        media={media}
        onRemoveMedia={(item) => {
          void removeMedia(item, uid, isOwner).then(() =>
            toast.show({ title: 'Anexo tirado', kind: 'info' }),
          );
        }}
        submitLabel={editing ? 'Salvar' : 'Salvar reserva'}
        onSubmit={async (values, files) => {
          const id = reservation
            ? (await updateReservation(reservation.id, values), reservation.id)
            : await createReservation(trip.id, uid, values);
          const { errors } = await addReservationFiles(trip.id, id, files, uid);
          toast.show({
            title: reservation ? 'Reserva salva' : 'Reserva adicionada',
            ...(errors.length > 0 ? { description: errors.join(' ') } : {}),
            kind: errors.length > 0 ? 'late' : 'ok',
          });
          await navigate(`${list}?abrir=${id}`, { replace: true });
        }}
      />
      {reservation ? (
        <>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <Trash2 className="size-5" aria-hidden="true" />
            Excluir reserva
          </Button>
          <Sheet
            open={confirm}
            onClose={() => setConfirm(false)}
            title="Excluir a reserva?"
            description={`${reservation.name} e os anexos dela saem para todo o time.`}
          >
            <Button
              variant="danger"
              onClick={() => {
                void removeReservation(reservation.id, uid, isOwner).then(async () => {
                  toast.show({ title: 'Reserva excluída', kind: 'info' });
                  await navigate(list, { replace: true });
                });
              }}
            >
              Excluir reserva
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
          </Sheet>
        </>
      ) : null}
    </div>
  );
}
