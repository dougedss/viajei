import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { updateTrip } from '../actions.ts';
import { useTrip } from '../queries.ts';
import { tripFormSchema, type TripFormInput, type TripFormValues } from '../schemas.ts';

/**
 * Editar a viagem (`/viagens/:id/editar`): nome, datas, origem, orçamento e observações, campo a
 * campo. Desde a fase 17 a viagem nasce do campo da lista (o formulário de criar saiu: "Serra
 * Gaúcha, 11 a 14 de dezembro" já é uma viagem); a edição continua aqui, a partir de Detalhes.
 */
export default function EditarViagemPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  return (
    <div className="grid gap-5">
      <PageHeader back={`/viagens/${trip.id}/detalhes`} title="Editar viagem" />
      <EditTripForm key={trip.id} trip={trip} />
    </div>
  );
}

const valuesOf = (trip: Trip): TripFormInput => ({
  name: trip.name,
  start_date: trip.start_date,
  end_date: trip.end_date,
  origin: trip.origin ?? '',
  budget:
    trip.budget === null
      ? ''
      : trip.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  notes: trip.notes ?? '',
});

/** O formulário da edição. O carro é da pessoa, na garagem do perfil (fase 16). */
function EditTripForm({ trip }: { trip: Trip }) {
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm<TripFormInput, unknown, TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues: valuesOf(trip),
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await updateTrip(trip.id, values);
      toast.show({ title: 'Viagem salva', kind: 'ok' });
      await navigate(`/viagens/${trip.id}/detalhes`, { replace: true });
    } catch (err) {
      form.setError('root', {
        message: err instanceof Error ? err.message : 'Não deu para salvar. Tente de novo.',
      });
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <TextField
        label="Nome da viagem"
        placeholder="RS — concurso em Montenegro"
        autoComplete="off"
        error={errors.name?.message}
        {...form.register('name')}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Início"
          type="date"
          error={errors.start_date?.message}
          {...form.register('start_date')}
        />
        <TextField
          label="Fim"
          type="date"
          error={errors.end_date?.message}
          {...form.register('end_date')}
        />
      </div>
      <TextField
        label="Origem"
        placeholder="Papanduva/SC"
        hint="De onde o carro sai."
        autoComplete="off"
        error={errors.origin?.message}
        {...form.register('origin')}
      />
      <TextField
        label="Orçamento"
        placeholder="3.000,00"
        inputMode="decimal"
        hint="Opcional. Os gastos são comparados com ele."
        error={errors.budget?.message}
        {...form.register('budget')}
      />
      <TextArea
        label="Observações"
        placeholder="Documentos, lembretes, o que não pode esquecer."
        error={errors.notes?.message}
        {...form.register('notes')}
      />
      {errors.root?.message ? (
        <p
          role="alert"
          className="rounded-field bg-late/10 px-4 py-3 text-[15px] font-semibold text-late-ink"
        >
          {errors.root.message}
        </p>
      ) : null}
      <Button type="submit" loading={isSubmitting}>
        Salvar
      </Button>
    </form>
  );
}
