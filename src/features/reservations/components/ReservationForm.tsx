import { zodResolver } from '@hookform/resolvers/zod';
import { FileText, X } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { RESERVATION_TYPE_KEYS, RESERVATION_TYPES } from '@shared/constants.ts';
import { Button } from '@/components/ui/Button.tsx';
import { TextArea } from '@/components/ui/TextArea.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { FilePickers } from '@/features/media/components/FilePickers.tsx';
import { MediaThumb } from '@/features/media/components/MediaThumb.tsx';
import type { Reservation, Stop, TripDay } from '@/lib/db/schema.ts';
import type { MediaItem } from '@/lib/media/hooks.ts';
import { formatBytes } from '@/lib/media/compress.ts';
import { formatDayShort, hhmm } from '@/lib/time/index.ts';
import {
  EMPTY_RESERVATION,
  fromReservation,
  reservationFormSchema,
  type ReservationFormInput,
  type ReservationFormValues,
} from '../schemas.ts';
import { ReservationTypeIcon } from './ReservationTypeIcon.tsx';

type Props = {
  reservation?: Reservation;
  days: readonly TripDay[];
  stops: readonly Stop[];
  /** anexos já gravados (ao editar) */
  media: readonly MediaItem[];
  onRemoveMedia: (item: MediaItem) => void;
  submitLabel: string;
  onSubmit: (values: ReservationFormValues, files: File[]) => Promise<void>;
};

const selectClass =
  'min-h-13 w-full rounded-field bg-card px-4 text-[17px] text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-accent)]';

/**
 * Formulário da reserva: tipo, nome, início e fim em hora de parede de São Paulo (data e hora
 * separadas, sempre juntas), vínculo com uma parada ou um dia, código, valor, cancelamento e prazo
 * (o aviso chega na véspera, às 10h), telefone à brasileira, endereço, onde reservou, observações e
 * os anexos: prints e PDFs, que sobem quando houver sinal.
 */
export function ReservationForm({
  reservation,
  days,
  stops,
  media,
  onRemoveMedia,
  submitLabel,
  onSubmit,
}: Props) {
  const form = useForm<ReservationFormInput, unknown, ReservationFormValues>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: reservation ? fromReservation(reservation) : EMPTY_RESERVATION,
  });
  const { errors, isSubmitting } = form.formState;
  const type = useWatch({ control: form.control, name: 'type' });
  const cancelUntil = useWatch({ control: form.control, name: 'cancel_until' });
  const link = useWatch({ control: form.control, name: 'link' });
  const [files, setFiles] = useState<File[]>([]);

  const dayById = new Map(days.map((d) => [d.id, d]));
  const hotel = type === 'hotel';

  // escolher a parada sugere o início pelo dia e horário dela, se ainda estiver vazio
  const onLink = (value: string) => {
    form.setValue('link', value, { shouldDirty: true });
    if (!value.startsWith('stop:')) return;
    const stop = stops.find((s) => s.id === value.slice(5));
    const day = stop ? dayById.get(stop.trip_day_id) : undefined;
    if (!stop || !day) return;
    if (form.getValues('start_date') === '') form.setValue('start_date', day.date);
    if (form.getValues('start_time') === '' && stop.time) {
      form.setValue('start_time', hhmm(stop.time));
    }
    if (form.getValues('name').trim() === '') form.setValue('name', stop.name);
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(values, files);
    } catch (err) {
      form.setError('root', {
        message: err instanceof Error ? err.message : 'Não deu para salvar. Tente de novo.',
      });
    }
  });

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-[15px] font-semibold">Tipo</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo da reserva">
          {RESERVATION_TYPE_KEYS.map((k) => {
            const selected = type === k;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => form.setValue('type', k, { shouldDirty: true })}
                className={
                  selected
                    ? 'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-accent-soft pr-3 pl-1 text-[15px] font-semibold text-accent-ink shadow-[inset_0_0_0_2px_var(--color-accent)]'
                    : 'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-card pr-3 pl-1 text-[15px] font-semibold text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]'
                }
              >
                <ReservationTypeIcon type={k} className="size-8 rounded-full" />
                {RESERVATION_TYPES[k].label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <TextField
        label="Nome"
        placeholder={hotel ? 'Vila Suzana Parque Hotel' : 'Cascata do Caracol'}
        autoComplete="off"
        error={errors.name?.message}
        {...form.register('name')}
      />

      <div className="grid gap-1.5">
        <label htmlFor="r-link" className="text-[15px] font-semibold">
          Ligada a
        </label>
        <select
          id="r-link"
          className={selectClass}
          value={link}
          onChange={(e) => onLink(e.target.value)}
        >
          <option value="">Nenhuma parada nem dia</option>
          {days.map((d, i) => {
            const dayStops = stops.filter((s) => s.trip_day_id === d.id);
            return (
              <optgroup key={d.id} label={`Dia ${i + 1} · ${formatDayShort(d.date)}`}>
                <option value={`day:${d.id}`}>O dia todo ({formatDayShort(d.date)})</option>
                {dayStops.map((s) => (
                  <option key={s.id} value={`stop:${s.id}`}>
                    {s.time ? `${hhmm(s.time)} · ` : ''}
                    {s.name}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <p className="text-[14px] text-ink-2">
          Ligada a uma parada, a reserva aparece no "Agora" quando vocês estiverem chegando.
        </p>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <TextField
          label={hotel ? 'Check-in' : 'Início'}
          type="date"
          error={errors.start_date?.message}
          {...form.register('start_date')}
        />
        <TextField
          label="Horário"
          type="time"
          error={errors.start_time?.message}
          {...form.register('start_time')}
        />
        <TextField
          label={hotel ? 'Saída' : 'Fim'}
          type="date"
          hint="Opcional"
          error={errors.end_date?.message}
          {...form.register('end_date')}
        />
        <TextField
          label="Horário"
          type="time"
          error={errors.end_time?.message}
          {...form.register('end_time')}
        />
      </div>

      <TextField
        label="Código de confirmação"
        placeholder="4821-339"
        autoComplete="off"
        autoCapitalize="characters"
        error={errors.confirmation_code?.message}
        {...form.register('confirmation_code')}
      />

      <TextField
        label="Valor"
        inputMode="decimal"
        placeholder="463,00"
        error={errors.amount?.message}
        {...form.register('amount')}
      />

      <TextField
        label="Política de cancelamento"
        placeholder="Grátis até 08/12, depois 1 diária"
        autoComplete="off"
        error={errors.cancel_policy?.message}
        {...form.register('cancel_policy')}
      />
      <TextField
        label="Último dia para cancelar sem custo"
        type="date"
        hint={
          cancelUntil
            ? 'O aviso chega na véspera, às 10h, para quem tem esse aviso ligado.'
            : 'Com a data, o app avisa na véspera, às 10h.'
        }
        error={errors.cancel_until?.message}
        {...form.register('cancel_until')}
      />

      <TextField
        label="Telefone"
        type="tel"
        inputMode="tel"
        placeholder="(54) 3282-0000"
        autoComplete="off"
        error={errors.phone?.message}
        {...form.register('phone')}
      />
      <TextField
        label="Endereço"
        placeholder="R. Cel. Theobaldo Fleck, 15, Canela"
        autoComplete="off"
        error={errors.address?.message}
        {...form.register('address')}
      />
      <TextField
        label="Reservado por"
        placeholder="Booking, WhatsApp, site do hotel"
        autoComplete="off"
        error={errors.booked_via?.message}
        {...form.register('booked_via')}
      />
      <TextArea
        label="Observações"
        rows={3}
        placeholder="Café e estacionamento inclusos"
        error={errors.notes?.message}
        {...form.register('notes')}
      />

      <fieldset className="grid gap-3">
        <legend className="text-[15px] font-semibold">Anexos</legend>
        <p className="-mt-2 text-[14px] text-ink-2">
          Prints e PDFs da confirmação. Abrem sem sinal; sobem para o time quando houver internet.
        </p>
        {media.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {media.map((m) => (
              <MediaThumb key={m.row.id} item={m} onRemove={() => onRemoveMedia(m)} />
            ))}
          </div>
        ) : null}
        {files.length > 0 ? (
          <ul className="grid gap-2" aria-label="Anexos a enviar">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-field bg-paper px-3 py-2 text-[15px]"
              >
                <FileText className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{f.name || 'foto'}</span>
                <span className="num text-[13px] text-ink-2">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  aria-label={`Tirar ${f.name || 'foto'}`}
                  onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}
                  className="grid size-10 place-items-center rounded-full text-ink-2"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <FilePickers mode="document" onFiles={(picked) => setFiles((xs) => [...xs, ...picked])} />
      </fieldset>

      {errors.root ? (
        <p role="alert" className="text-[15px] font-semibold text-late-ink">
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
