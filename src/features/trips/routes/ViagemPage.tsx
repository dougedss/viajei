import { Bell, ClipboardPaste, Navigation, Pencil, Route, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Avatar } from '@/components/ui/Avatar.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { loadExampleTrip } from '@/features/itinerary/seed.ts';
import { CalendarExport } from '@/features/notifications/components/CalendarExport.tsx';
import { PushAskSheet } from '@/features/notifications/components/PushAskSheet.tsx';
import { asPersonColor } from '@/features/profile/queries.ts';
import { CelebrationHost } from '@/features/progression/components/CelebrationHost.tsx';
import { LevelBar } from '@/features/progression/components/LevelBar.tsx';
import { useTeamLevel } from '@/features/progression/useTeamProgress.ts';
import { RetroEntry } from '@/features/retrospective/components/RetroEntry.tsx';
import { deleteTrip } from '../actions.ts';
import { useIsOwner, useTrip, useTripMembers } from '../queries.ts';
import { TripHero } from '../components/TripHero.tsx';
import { TripShortcuts } from '../components/TripShortcuts.tsx';
import { useTripReservations } from '@/features/reservations/queries.ts';
import { ReadinessCard, ReadyCelebration } from '@/features/checklists/components/Readiness.tsx';
import { useTripChecklist } from '@/features/checklists/queries.ts';
import { listsProgress, shortcutValue } from '@/features/checklists/rules.ts';
import { useTripContacts } from '@/features/contacts/queries.ts';
import { contactCount, contactGroups } from '@/features/contacts/rules.ts';
import { useTripExpenses } from '@/features/expenses/queries.ts';
import { formatMoneyShort, totals } from '@/features/expenses/rules.ts';
import { todayISO } from '../rules.ts';
import { useSession } from '@/lib/supabase/session.ts';

export default function ViagemPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const members = useTripMembers(tripId);
  const isOwner = useIsOwner(trip);
  const { session } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const tripDays = useTripDays(tripId) ?? [];
  const stops = useTripStops(tripId);
  const [loadingExample, setLoadingExample] = useState(false);
  const reservations = useTripReservations(tripId) ?? [];
  const items = useTripChecklist(tripId);
  const contacts = useTripContacts(tripId) ?? [];
  const expenses = useTripExpenses(tripId) ?? [];
  const teamLevel = useTeamLevel(tripId);

  if (trip === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const today = todayISO();
  const team = members.filter((m) => m.member.status === 'accepted');
  const pendingInvites = members.length - team.length;

  return (
    <div className="grid gap-5">
      <PageHeader
        back="/"
        title={trip.name}
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

      <TripHero trip={trip} today={today} />

      {/* abrir a visão geral é um momento calmo: o resumo ou o cartão de desbloqueio sai aqui */}
      <CelebrationHost active tripId={trip.id} />

      <RetroEntry trip={trip} stops={stops} today={today} />

      <LevelBar progress={teamLevel.progress} who="team" solo={teamLevel.solo} label="Time" />

      <ReadinessCard trip={trip} items={items ?? []} today={today} teamSize={team.length} />

      <TripShortcuts
        trip={trip}
        stops={stops.length}
        reservations={reservations.length}
        lists={shortcutValue(listsProgress(items ?? []))}
        contacts={contactCount(contactGroups(contacts, reservations))}
        spent={formatMoneyShort(totals(expenses).total)}
        diary={stops.filter((s) => s.done_at !== null).length}
      />
      <ReadyCelebration trip={trip} items={items} today={today} />

      {trip.notes ? (
        <Card>
          <p className="text-[15px] whitespace-pre-line text-ink-2">{trip.notes}</p>
        </Card>
      ) : null}

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
            text={`${tripDays.length} ${tripDays.length === 1 ? 'dia' : 'dias'} esperando paradas. Cole o roteiro que vocês já têm (conversa, notas, e-mails de reserva) ou monte dia a dia.`}
            action={
              <div className="grid gap-2">
                <ButtonLink to={`/viagens/${trip.id}/importar`} size="md">
                  <ClipboardPaste className="size-5" aria-hidden="true" />
                  Colar roteiro
                </ButtonLink>
                <ButtonLink to={`/viagens/${trip.id}/roteiro`} variant="secondary" size="md">
                  Montar o roteiro
                </ButtonLink>
                {import.meta.env.DEV ? (
                  <Button
                    variant="ghost"
                    size="md"
                    loading={loadingExample}
                    onClick={() => {
                      setLoadingExample(true);
                      void loadExampleTrip(trip, session?.user.id ?? '')
                        .then((r) =>
                          toast.show({
                            title: 'Viagem de exemplo carregada',
                            description: `${r.days} dias, ${r.stops} paradas, ${r.reservations} reservas, ${r.contacts} contatos e ${r.items} itens de lista.`,
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

      <section className="grid gap-3" aria-labelledby="h-avisos">
        <div className="flex items-center justify-between">
          <h2 id="h-avisos" className="label-caps text-accent-ink">
            Avisos e calendário
          </h2>
          <Link
            to={`/viagens/${trip.id}/avisos`}
            className="text-[15px] font-semibold text-accent-ink"
          >
            Configurar
          </Link>
        </div>
        <Card className="grid gap-3">
          <p className="flex items-center gap-2 text-[16px]">
            <Bell className="size-5 shrink-0 text-accent-ink" aria-hidden="true" />
            <span>
              Hora de sair, briefing da manhã e paradas fechando chegam no celular, mesmo com o app
              fechado.
            </span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink to={`/viagens/${trip.id}/avisos`} variant="secondary" size="md">
              <Bell className="size-5" aria-hidden="true" />
              Avisos da viagem
            </ButtonLink>
            <CalendarExport
              trip={trip}
              stops={stops}
              days={tripDays.map((day) => ({
                day,
                stops: stops.filter((s) => s.trip_day_id === day.id),
              }))}
            />
          </div>
        </Card>
      </section>

      <PushAskSheet trip={trip} />

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
