import { Inbox, Paperclip } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTrips } from '@/features/trips/queries.ts';
import { formatMoney, formatPeriod, todayISO, tripStatus } from '@/features/trips/rules.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import type { ReceivedReservation } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { formatDayShort, isoToWall } from '@/lib/time/index.ts';
import { ReservationTypeIcon } from '../../components/ReservationTypeIcon.tsx';
import { timeLabel, typeLabel } from '../../rules.ts';
import { dismissReceived, PlaceError, placeReceived } from '../actions.ts';
import { filesOf, useReceivedReservations } from '../queries.ts';

type Props = {
  /** na tela de Reservas de uma viagem: "Pôr nesta viagem" vai direto para ela */
  tripId?: string;
};

/**
 * "Reservas recebidas" (fase 18): o que chegou por e-mail e ainda não tem viagem. Na lista de viagens,
 * um toque pergunta em qual viagem pôr (ou vai direto, quando só há uma em andamento ou futura); na
 * tela de Reservas de uma viagem, vai para ela. "Dispensar" tira da lista. Nada aparece quando não
 * há recebidas.
 */
export function ReceivedSection({ tripId }: Props) {
  const received = useReceivedReservations();
  const trips = useTrips();
  const { session } = useSession();
  const online = useOnline();
  const toast = useToast();
  const navigate = useNavigate();
  const uid = session?.user.id ?? '';
  const [choosing, setChoosing] = useState<ReceivedReservation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!received || received.length === 0) return null;

  const today = todayISO();
  const candidates = (trips ?? [])
    .map((t) => t.trip)
    .filter((t) => tripStatus(t, today) !== 'past');

  const place = async (row: ReceivedReservation, into: string) => {
    setBusy(row.id);
    try {
      const id = await placeReceived(row, into, uid);
      toast.show({
        title: 'Reserva na viagem',
        description: row.name,
        kind: 'ok',
        action: {
          label: 'Ver',
          onClick: () => void navigate(`/viagens/${into}/reservas?abrir=${id}`),
        },
      });
    } catch (err) {
      toast.show({
        title: 'Não deu para pôr na viagem',
        description: err instanceof PlaceError ? err.message : 'Tente de novo em instantes.',
        kind: 'late',
      });
    } finally {
      setBusy(null);
      setChoosing(null);
    }
  };

  const onPlace = (row: ReceivedReservation) => {
    if (tripId) return void place(row, tripId);
    if (candidates.length === 1 && candidates[0]) return void place(row, candidates[0].id);
    setChoosing(row);
  };

  return (
    <section className="grid gap-3" aria-labelledby="h-recebidas" data-received={received.length}>
      <h2 id="h-recebidas" className="flex items-center gap-2 label-caps text-accent-ink">
        <Inbox className="size-4" aria-hidden="true" />
        Reservas recebidas
      </h2>
      {received.map((row) => {
        const files = filesOf(row);
        const when = timeLabel(row);
        const needsNet = files.length > 0 && !online;
        return (
          <Card key={row.id} role="article" aria-label={row.name} className="grid gap-3">
            <div className="grid grid-cols-[auto_1fr] items-start gap-3">
              <ReservationTypeIcon type={row.type} />
              <div className="grid min-w-0 gap-1">
                <p className="text-[17px] leading-snug font-semibold break-words">{row.name}</p>
                <p className="text-[14px] text-ink-2">
                  {typeLabel(row.type)}
                  {when ? ` · ${when}` : ''}
                </p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-ink-2">
                  {row.confirmation_code ? (
                    <span>
                      Código{' '}
                      <span className="num font-semibold text-ink">{row.confirmation_code}</span>
                    </span>
                  ) : null}
                  {row.amount !== null ? (
                    <span className="num">{formatMoney(row.amount)}</span>
                  ) : null}
                  {files.length > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                      {files.length === 1 ? '1 anexo' : `${String(files.length)} anexos`}
                    </span>
                  ) : null}
                </p>
                <p className="text-[13px] text-ink-2">
                  Chegou por e-mail {formatDayShort(isoToWall(row.received_at).date)} às{' '}
                  {isoToWall(row.received_at).time}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="md"
                className="flex-1"
                loading={busy === row.id}
                disabled={needsNet || candidates.length === 0}
                onClick={() => onPlace(row)}
              >
                {tripId ? 'Pôr nesta viagem' : 'Pôr numa viagem'}
              </Button>
              <Button
                size="md"
                variant="ghost"
                disabled={busy === row.id}
                onClick={() => {
                  void dismissReceived(row).then(() =>
                    toast.show({ title: 'Reserva dispensada', kind: 'info' }),
                  );
                }}
              >
                Dispensar
              </Button>
            </div>
            {needsNet ? (
              <p className="text-[13px] text-ink-2">
                Precisa de internet para trazer {files.length === 1 ? 'o anexo' : 'os anexos'}.
              </p>
            ) : candidates.length === 0 ? (
              <p className="text-[13px] text-ink-2">Crie a viagem primeiro, e ela entra lá.</p>
            ) : null}
          </Card>
        );
      })}
      <Sheet
        open={choosing !== null}
        onClose={() => setChoosing(null)}
        title="Em qual viagem?"
        description={choosing?.name ?? ''}
      >
        <ul className="grid gap-2" aria-label="Viagens">
          {candidates.map((t) => (
            <li key={t.id}>
              <Button
                variant="secondary"
                size="md"
                className="w-full justify-between"
                loading={busy === choosing?.id}
                onClick={() => {
                  if (choosing) void place(choosing, t.id);
                }}
              >
                <span className="truncate">{t.name}</span>
                <span className="num text-[13px] text-ink-2">
                  {formatPeriod(t.start_date, t.end_date)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
