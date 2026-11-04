import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { tripFormSchema, type TripFormInput, type TripFormValues } from '../schemas.ts';

type Props = {
  defaultValues?: TripFormInput;
  submitLabel: string;
  onSubmit: (values: TripFormValues) => Promise<void>;
};

const EMPTY: TripFormInput = {
  name: '',
  start_date: '',
  end_date: '',
  origin: '',
  budget: '',
  notes: '',
};

/** Nome, datas, origem, orçamento e observações. O carro da viagem fica para a garagem (fase 6). */
export function TripForm({ defaultValues = EMPTY, submitLabel, onSubmit }: Props) {
  const form = useForm<TripFormInput, unknown, TripFormValues>({
    resolver: zodResolver(tripFormSchema),
    defaultValues,
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values);
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
        {submitLabel}
      </Button>
    </form>
  );
}
