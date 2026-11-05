import { CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import type { ButtonSize, ButtonVariant } from '@/components/ui/button-styles.ts';
import { useToast } from '@/components/ui/toast-context.ts';
import type { Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { deliverIcs } from '../calendar.ts';
import { dayToIcs, icsFilename, tripToIcs } from '../ics.ts';

type Props = {
  trip: Pick<Trip, 'name'>;
  /** um dia só; sem ele, a viagem inteira */
  day?: Pick<TripDay, 'date' | 'title'>;
  stops: readonly Stop[];
  /** para a viagem inteira: os dias com as suas paradas */
  days?: readonly { day: Pick<TripDay, 'date'>; stops: readonly Stop[] }[];
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

/**
 * "Exportar para o calendário": gera o `.ics` na hora (offline, sem servidor) e entrega pela folha
 * de compartilhar ou por download. É a rede de segurança para quem não quer avisos.
 */
export function CalendarExport({
  trip,
  day,
  stops,
  days,
  label,
  variant = 'secondary',
  size = 'md',
  className,
}: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const text = label ?? (day ? 'Exportar o dia' : 'Exportar a viagem');

  const run = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const ics = day ? dayToIcs(trip, day, stops, now) : tripToIcs(trip, days ?? [], now);
      const outcome = await deliverIcs(ics, icsFilename(trip, day), trip.name);
      if (outcome === 'shared') toast.show({ title: 'Enviado para o calendário', kind: 'ok' });
      if (outcome === 'downloaded') {
        toast.show({
          title: 'Arquivo .ics salvo',
          description: 'Abra o arquivo para adicionar ao seu calendário.',
          kind: 'ok',
        });
      }
    } catch {
      toast.show({ title: 'Não deu para gerar o arquivo. Tente de novo.', kind: 'late' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={busy}
      onClick={() => void run()}
    >
      <CalendarPlus className="size-5" aria-hidden="true" />
      {text}
    </Button>
  );
}
