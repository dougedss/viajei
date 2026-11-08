import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { Splash } from '@/app/Splash.tsx';
import { NotFound } from '@/app/NotFound.tsx';
import { updateTrip } from '../actions.ts';
import { TripForm } from '../components/TripForm.tsx';
import { useTrip } from '../queries.ts';

export default function EditarViagemPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const navigate = useNavigate();
  const toast = useToast();

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  return (
    <div className="grid gap-5">
      <PageHeader back={`/viagens/${trip.id}/detalhes`} title="Editar viagem" />
      <TripForm
        key={trip.id}
        submitLabel="Salvar"
        defaultValues={{
          name: trip.name,
          start_date: trip.start_date,
          end_date: trip.end_date,
          origin: trip.origin ?? '',
          budget:
            trip.budget === null
              ? ''
              : trip.budget.toLocaleString('pt-BR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
          notes: trip.notes ?? '',
        }}
        onSubmit={async (values) => {
          await updateTrip(trip.id, values);
          toast.show({ title: 'Viagem salva', kind: 'ok' });
          await navigate(`/viagens/${trip.id}/detalhes`, { replace: true });
        }}
      />
    </div>
  );
}
