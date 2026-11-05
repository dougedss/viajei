import {
  CalendarDays,
  MapPin,
  Navigation,
  Pencil,
  Route,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { loadExampleTrip } from '@/features/itinerary/seed.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { deleteTrip } from '../actions.ts';
import { useIsOwner, useTrip, useTripMembers } from '../queries.ts';
import {
  formatMoney,
  formatPeriod,
  statusKind,
  statusLabel,
  todayISO,
  tripLength,
  tripStatus,
} from '../rules.ts';

export default function ViagemPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const isOwner = useIsOwner(trip);
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tripDays = useTripDays(tripId) ?? [];
  const stops = useTripStops(tripId);
  const [loadingExample, setLoadingExample] = useState(false);

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const today = todayISO();
  const team = members.filter((m) => m.member.status === 'accepted');
  const pendingInvites = members.length - team.length;
  const days = tripLength(trip);

  return (
    <div className="grid gap-5">
      <PageHeader
        back="/"
        title={trip.name}
        eyebrow={<Chip kind={statusKind(tripStatus(trip, today))}>{statusLabel(trip, today)}</Chip>}
        actions={
          <ButtonLink
            to={`/viagens/${trip.id}/editar`}
            variant="secondary"
            size="sm"
            aria-label="Editar viagem"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </ButtonLink>
        }
      />

      <Card className="grid gap-3">
        <p className="flex items-center gap-2 text-[16px]">
          <CalendarDays className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
          <span>
            {formatPeriod(trip.start_date, trip.end_date)}
            <span className="text-ink-2">
              {' '}
              · {days} {days === 1 ? 'dia' : 'dias'}
            </span>
          </span>
        </p>
        <p className="flex items-center gap-2 text-[16px]">
          <MapPin className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
          {trip.origin ? (
            <span>Sai de {trip.origin}</span>
          ) : (
            <span className="text-ink-2">Origem não informada</span>
          )}
        </p>
        <p className="flex items-center gap-2 text-[16px]">
          <Wallet className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
          {trip.budget === null ? (
            <span className="text-ink-2">Sem orçamento definido</span>
          ) : (
            <span>
              Orçamento de <b className="font-num text-[18px]">{formatMoney(trip.budget)}</b>
            </span>
          )}
        </p>
        {trip.notes ? (
          <p className="border-t border-line pt-3 text-[15px] whitespace-pre-line text-ink-2">
            {trip.notes}
          </p>
        ) : null}
      </Card>

      <section className="grid gap-3" aria-labelledby="h-time">
        <div className="flex items-center justify-between">
          <h2 id="h-time" className="label-caps text-accent-ink">
            Time
          </h2>
          <Link
            to={`/viagens/${trip.id}/membros`}
            className="text-[15px] font-semibold text-accent-ink"
          >
            {isOwner ? 'Convidar' : 'Ver todos'}
          </Link>
        </div>
        <Card className="flex flex-wrap items-center gap-3">
          {team.map(({ member, profile }) => (
            <span key={member.id} className="flex items-center gap-2">
              <Avatar
                name={profile?.name ?? '?'}
                color={asPersonColor(profile?.color ?? 'sunset')}
                size="sm"
              />
              <span className="text-[15px] font-semibold">{profile?.name ?? '…'}</span>
            </span>
          ))}
          {pendingInvites > 0 ? (
            <span className="text-[14px] text-ink-2">
              · {pendingInvites} {pendingInvites === 1 ? 'convite pendente' : 'convites pendentes'}
            </span>
          ) : null}
          <Users className="ml-auto size-5 text-ink-2" aria-hidden="true" />
        </Card>
      </section>

      <section className="grid gap-3" aria-labelledby="h-roteiro">
        <div className="flex items-center justify-between">
          <h2 id="h-roteiro" className="label-caps text-accent-ink">
            Roteiro
          </h2>
          <Link
            to={`/viagens/${trip.id}/roteiro`}
            className="text-[15px] font-semibold text-accent-ink"
          >
            Editar roteiro
          </Link>
        </div>
        {stops.length === 0 ? (
          <EmptyState
            icon={Route}
            title="Roteiro vazio"
            text={`${tripDays.length} ${tripDays.length === 1 ? 'dia' : 'dias'} esperando paradas. Adicione a saída, as atrações e os hotéis de cada dia.`}
            action={
              <div className="grid gap-2">
                <ButtonLink to={`/viagens/${trip.id}/roteiro`} size="md">
                  Montar o roteiro
                </ButtonLink>
                {import.meta.env.DEV ? (
                  <Button
                    variant="ghost"
                    size="md"
                    loading={loadingExample}
                    onClick={() => {
                      setLoadingExample(true);
                      void loadExampleTrip(trip)
                        .then((r) =>
                          toast.show({
                            title: 'Viagem de exemplo carregada',
                            description: `${r.days} dias e ${r.stops} paradas.`,
                            kind: 'ok',
                          }),
                        )
                        .catch((err: unknown) =>
                          toast.show({
                            title: 'Não deu para carregar',
                            ...(err instanceof Error ? { description: err.message } : {}),
                            kind: 'late',
                          }),
                        )
                        .finally(() => setLoadingExample(false));
                    }}
                  >
                    Carregar viagem de exemplo
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : (
          <Card className="grid gap-3">
            <p className="flex items-center gap-2 text-[16px]">
              <Route className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
              <span>
                {stops.length} {stops.length === 1 ? 'parada' : 'paradas'} em {tripDays.length}{' '}
                {tripDays.length === 1 ? 'dia' : 'dias'}
              </span>
            </p>
            <ButtonLink to={`/viagens/${trip.id}/viagem`} size="md">
              <Navigation className="size-5" aria-hidden="true" />
              Abrir o Modo Viagem
            </ButtonLink>
          </Card>
        )}
      </section>

      {isOwner ? (
        <>
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            <Trash2 className="size-5" aria-hidden="true" />
            Excluir viagem
          </Button>
          <Sheet
            open={confirm}
            onClose={() => setConfirm(false)}
            title="Excluir a viagem?"
            description="Ela some para todo o time, em todos os aparelhos, assim que sincronizar."
          >
            <Button
              variant="danger"
              loading={deleting}
              onClick={() => {
                setDeleting(true);
                void deleteTrip(trip.id)
                  .then(async () => {
                    toast.show({ title: 'Viagem excluída', kind: 'info' });
                    await navigate('/', { replace: true });
                  })
                  .finally(() => setDeleting(false));
              }}
            >
              Excluir viagem
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
