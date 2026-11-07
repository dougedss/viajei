import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CalendarOff,
  Plus,
  Route as RouteIcon,
  Star,
  Ticket,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { QuestChecks } from '@/features/checklists/components/QuestChecks.tsx';
import { useTripChecklist } from '@/features/checklists/queries.ts';
import { createExpense } from '@/features/expenses/actions.ts';
import { ExpenseSheet, type ExpenseDraft } from '@/features/expenses/components/ExpenseSheet.tsx';
import { expenseDefaults } from '@/features/expenses/rules.ts';
import { useDayStops, useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useDayRoute } from '@/features/itinerary/route.ts';
import { legsByStop } from '@/features/itinerary/rules.ts';
import { applyBadge, badgeCount } from '@/features/notifications/badge.ts';
import { CalendarExport } from '@/features/notifications/components/CalendarExport.tsx';
import { PushAskSheet } from '@/features/notifications/components/PushAskSheet.tsx';
import { useTrip, useTripMembers, type MemberWithProfile } from '@/features/trips/queries.ts';
import { formatMoney, todayISO, tripStatus } from '@/features/trips/rules.ts';
import type { Profile, Trip } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { WorldSlot, type EventsOwner, type ReviewPhoto } from '@/features/world/WorldSlot.tsx';
import { dismissMemoryPrompt } from '@/features/memories/actions.ts';
import { HowWasItSheet } from '@/features/memories/components/HowWasItSheet.tsx';
import { MemoryPromptCard } from '@/features/memories/components/MemoryPromptCard.tsx';
import { RatingChips } from '@/features/memories/components/StarRating.tsx';
import {
  useDismissedPrompts,
  useTripMemories,
  useTripPhotos,
} from '@/features/memories/queries.ts';
import {
  answeredStops,
  memoryPrompt,
  pendingPrompts,
  SHEET_DELAY_MS,
  type ArrivalSource,
} from '@/features/memories/rules.ts';
import { NowReservations } from '@/features/reservations/components/NowReservations.tsx';
import { ReservationSheet } from '@/features/reservations/components/ReservationSheet.tsx';
import { useTripReservations } from '@/features/reservations/queries.ts';
import { reservationsForNow, reservationsOfStop } from '@/features/reservations/rules.ts';
import { db, type Stop } from '@/lib/db/schema.ts';
import { useTripMediaPrefetch } from '@/lib/media/hooks.ts';
import { audio } from '@/lib/audio/index.ts';
import { celebrateArrival } from '@/lib/celebrate.ts';
import { currentDay, formatDayShort } from '@/lib/time/index.ts';
import { arrive, arriveAt, depart, skip, type Undoable } from '../actions.ts';
import { useCatchup } from '../catchup.ts';
import { AgoraHeader } from '../components/AgoraHeader.tsx';
import {
  PassedQuestion,
  PositionAsk,
  PositionLine,
  SinceLastTime,
} from '../components/CatchupCards.tsx';
import { PanelBar, PanelToggle } from '../components/PanelBar.tsx';
import { useNightTheme, useNow } from '../hooks.ts';
import { usePanelMode } from '../panel.ts';
import { declineGeo, grantGeo, useGeoConsent, useTeamTracks } from '../queries.ts';
import { dayState, isDepartureNode } from '../rules.ts';

const UNDO_MS = 10_000;

export default function ModoViagemPage() {
  const { tripId = '' } = useParams();
  const { session } = useSession();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const members = useTripMembers(tripId);
  const now = useNow();
  const night = useNightTheme(now);
  const [override, setOverride] = useState<string | null>(null);

  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const today = todayISO(now);
  const auto = currentDay(days, today);
  const day = (override ? days.find((d) => d.id === override) : null) ?? auto;
  const index = day ? days.findIndex((d) => d.id === day.id) : -1;
  const profiles = new Map<string, Profile>();
  for (const m of members) if (m.profile) profiles.set(m.profile.id, m.profile);

  return (
    <div className="grid gap-4" style={night ? { fontSize: '110%' } : undefined}>
      <header className="grid gap-1">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/viagens/${trip.id}`}
            className="min-h-10 truncate text-[15px] font-semibold text-ink-2"
          >
            {trip.name}
          </Link>
          <div className="flex shrink-0 gap-2">
            <ButtonLink
              to={`/viagens/${trip.id}/avisos`}
              variant="secondary"
              size="sm"
              aria-label="Avisos da viagem"
            >
              <Bell className="size-4" aria-hidden="true" />
              Avisos
            </ButtonLink>
            <ButtonLink to={`/viagens/${trip.id}/roteiro`} variant="secondary" size="sm">
              <RouteIcon className="size-4" aria-hidden="true" />
              Roteiro
            </ButtonLink>
          </div>
        </div>
        {day ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Dia anterior"
              disabled={index <= 0}
              onClick={() => setOverride(days[index - 1]?.id ?? null)}
              className="grid size-12 place-items-center rounded-full text-ink-2 disabled:opacity-30"
            >
              <ChevronLeft className="size-6" aria-hidden="true" />
            </button>
            <h1 className="flex-1 text-center font-num text-[24px] leading-tight font-semibold">
              <span className="uppercase">{formatDayShort(day.date)}</span>
              <span className="block text-[15px] font-semibold text-ink-2">
                dia {index + 1} de {days.length}
                {day.title ? ` · ${day.title}` : ''}
              </span>
            </h1>
            <button
              type="button"
              aria-label="Dia seguinte"
              disabled={index >= days.length - 1}
              onClick={() => setOverride(days[index + 1]?.id ?? null)}
              className="grid size-12 place-items-center rounded-full text-ink-2 disabled:opacity-30"
            >
              <ChevronRight className="size-6" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </header>

      {day ? (
        <DayView
          key={day.id}
          trip={trip}
          day={day}
          now={now}
          night={night}
          uid={session?.user.id ?? ''}
          members={members}
          profiles={profiles}
          active={day.date === today && tripStatus(trip, today) === 'ongoing'}
        />
      ) : (
        <EmptyState
          icon={CalendarOff}
          title="Sem dias nesta viagem"
          text="Os dias nascem das datas da viagem. Confira as datas em Editar viagem."
        />
      )}

      <PushAskSheet trip={trip} />
    </div>
  );
}

type DayViewProps = {
  trip: Trip;
  day: { id: string; date: string; title: string | null };
  now: Date;
  /** tema noturno (18:30 às 6:00): a maquete escurece junto */
  night: boolean;
  uid: string;
  members: readonly MemberWithProfile[];
  profiles: Map<string, Profile>;
  /** o dia é hoje e a viagem está acontecendo: catch-up com GPS, painel e selo só assim */
  active: boolean;
};

function DayView({ trip, day, now, night, uid, members, profiles, active }: DayViewProps) {
  const tripId = trip.id;
  const dayId = day.id;
  const stops = useDayStops(dayId);
  const { route, status: routeStatus, loaded: routeLoaded } = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const state = dayState({ date: day.date }, stops, now);
  const legs = legsByStop(stops, route);
  const teamTracks = useTeamTracks(dayId, uid, members);
  const geo = useGeoConsent();
  const [dismissedPassed, setDismissedPassed] = useState<string[]>([]);
  // quem conta "o que aconteceu desde a última vez": a maquete (replay) ou o card; nunca os dois
  const [owner, setOwner] = useState<EventsOwner | null>(null);

  // reservas, memórias e fotos da viagem: o "Ver reserva", o "Como foi?" e o "Rever o dia"
  const reservations = useTripReservations(tripId) ?? [];
  const memories = useTripMemories(tripId);
  const dismissedPrompts = useDismissedPrompts();
  const photos = useTripPhotos(tripId);
  const localBlobs = useLiveQuery(
    () => db.blobs.where('trip_id').equals(tripId).primaryKeys(),
    [tripId],
    [],
  );
  useTripMediaPrefetch(tripId);
  const answered = answeredStops(memories, uid);
  // as missões da viagem (as da parada aparecem na lista do dia) e o "+ Gasto" do passageiro
  const quests = (useTripChecklist(tripId) ?? []).filter(
    (i) => i.kind === 'quest' && i.status === 'active' && i.stop_id !== null,
  );
  const tripDays = useTripDays(tripId) ?? [];
  const tripStops = useTripStops(tripId);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const team = members
    .filter((m) => m.member.status === 'accepted')
    .flatMap((m) => (m.profile ? [m.profile] : []));
  const [memoryStopId, setMemoryStopId] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const sheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (sheetTimer.current) clearTimeout(sheetTimer.current);
    },
    [],
  );

  const run = (
    label: string,
    action: () => Promise<Undoable>,
    seen: readonly string[] = [],
    effect?: 'depart' | 'arrive',
    source: ArrivalSource = 'tap',
  ) => {
    setBusy(true);
    // a parada que este Chegamos! conclui, para a folha "Como foi?" saber de quem é
    const arriving = effect === 'arrive' ? state.next : null;
    void action()
      .then(({ undo }) => {
        cuRef.current?.markSeen(seen);
        if (effect === 'depart') audio.horn();
        if (effect === 'arrive') {
          audio.bell();
          celebrateArrival();
        }
        if (
          arriving &&
          memoryPrompt({
            source,
            panelOn: panel.on,
            stop: arriving,
            answered: answered.has(arriving.id),
          }) === 'sheet'
        ) {
          if (sheetTimer.current) clearTimeout(sheetTimer.current);
          sheetTimer.current = setTimeout(() => setMemoryStopId(arriving.id), SHEET_DELAY_MS);
        }
        toast.show({
          title: label,
          duration: UNDO_MS,
          kind: 'ok',
          action: { label: 'Desfazer', onClick: () => void undo() },
        });
      })
      .catch(() => toast.show({ title: 'Não deu para marcar. Tente de novo.', kind: 'late' }))
      .finally(() => setBusy(false));
  };

  const departLabel =
    state.at && !state.onRoad ? `Saímos de ${state.at.name}` : `Saímos: ${state.next?.name ?? ''}`;
  // os eventos que cada ação produz, para o card "Desde a última vez" não listar o que foi feito aqui
  const departSeen = state.next && isDepartureNode(state.next) ? [`departed:${state.next.id}`] : [];
  const arriveSeen = state.next ? [`arrived:${state.next.id}`] : [];
  const skipSeen = state.next ? [`skipped:${state.next.id}`] : [];

  const panel = usePanelMode({
    enabled: active && uid !== '',
    ctx: uid ? { tripId, dayId, uid } : null,
    state,
    onAutoDepart: () => run(departLabel, () => depart(state, uid), departSeen, 'depart'),
    onAutoArrive: () =>
      run(
        `Chegamos: ${state.next?.name ?? ''}`,
        () => arrive(state, uid),
        arriveSeen,
        'arrive',
        'panel',
      ),
  });

  const cu = useCatchup({
    tripId,
    dayId,
    uid,
    state,
    route: route?.geometry ?? null,
    teamTracks,
    geoAllowed: geo.allowed,
    active,
    liveFix: panel.fix,
  });
  const cuRef = useRef<typeof cu | null>(null);
  useEffect(() => {
    cuRef.current = cu;
  }, [cu]);

  // Chegamos! automático do catch-up: uma vez por leitura, com o mesmo toast de desfazer
  const autoHandled = useRef(new Set<string>());
  const autoStop = cu.autoArrive;
  const fixAt = cu.fix?.t ?? 0;
  useEffect(() => {
    if (!active || !autoStop || !state.arriveAvailable || state.next?.id !== autoStop.id) return;
    const key = `${autoStop.id}:${fixAt}`;
    if (autoHandled.current.has(key)) return;
    autoHandled.current.add(key);
    run(
      `Chegamos: ${autoStop.name}`,
      () => arrive(state, uid),
      [`arrived:${autoStop.id}`],
      'arrive',
      'catchup',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispara uma vez por leitura (chave), não a cada render
  }, [active, autoStop?.id, fixAt]);

  const pendingPassed = cu.passed.filter((s) => !dismissedPassed.includes(s.id));
  const question = pendingPassed[0];

  // selo no ícone ao ir para o plano de fundo durante a viagem
  const leaveAtMs = state.leaveAt?.getTime() ?? null;
  const pendingCount = pendingPassed.length;
  useEffect(() => {
    if (!active) return;
    const onHidden = () => {
      if (document.visibilityState !== 'hidden') return;
      void applyBadge(
        badgeCount({
          pendingQuestions: pendingCount,
          leaveAt: leaveAtMs === null ? null : new Date(leaveAtMs),
          now: new Date(),
        }),
      );
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [active, pendingCount, leaveAtMs]);

  // a folha fecha sozinha se o Chegamos! for desfeito enquanto ela está aberta
  const sheetStop = memoryStopId
    ? (stops.find((s) => s.id === memoryStopId && s.done_at !== null) ?? null)
    : null;
  const prompts = pendingPrompts(stops, answered, dismissedPrompts, sheetStop?.id ?? null);
  const promptStop = prompts[0] ?? null;
  const openReservation = reservations.find((r) => r.id === reservationId) ?? null;
  const cached = new Set(localBlobs);
  const dayStopIds = new Set(stops.map((s) => s.id));
  const reviewPhotos: ReviewPhoto[] = photos
    .filter(
      (p) => p.row.stop_id && dayStopIds.has(p.row.stop_id) && (p.pending || cached.has(p.row.id)),
    )
    .map((p) => ({
      attachment_id: p.row.id,
      stop_id: p.row.stop_id ?? '',
      created_by: p.row.created_by,
      created_at: p.row.created_at,
    }));

  const stopExtras = (stop: Stop) => {
    const mine = memories.filter((m) => m.stop_id === stop.id);
    const res = reservationsOfStop(stop.id, reservations);
    const canRemember = stop.done_at !== null && !isDepartureNode(stop) && !stop.skipped;
    const stopQuests = quests.filter((q) => q.stop_id === stop.id);
    if (
      res.length === 0 &&
      !canRemember &&
      !mine.some((m) => m.rating !== null) &&
      stopQuests.length === 0
    ) {
      return null;
    }
    const pill =
      'inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card px-3 text-[14px] font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
        <RatingChips memories={mine} profiles={profiles} />
        {res.map((r) => (
          <button key={r.id} type="button" className={pill} onClick={() => setReservationId(r.id)}>
            <Ticket className="size-4" aria-hidden="true" />
            Ver reserva
          </button>
        ))}
        {canRemember ? (
          <button
            type="button"
            className={cx(pill, answered.has(stop.id) && 'text-ink-2')}
            onClick={() => setMemoryStopId(stop.id)}
          >
            {answered.has(stop.id) ? (
              <BookOpen className="size-4" aria-hidden="true" />
            ) : (
              <Star className="size-4" aria-hidden="true" />
            )}
            {answered.has(stop.id) ? 'Minha memória' : 'Como foi?'}
          </button>
        ) : null}
        <QuestChecks quests={stopQuests} uid={uid} className="w-full" />
      </div>
    );
  };

  return (
    <>
      {owner === 'card' ? (
        <SinceLastTime
          events={cu.events}
          profiles={profiles}
          onDismiss={() => void cu.dismissEvents()}
        />
      ) : null}

      <AgoraHeader
        footer={
          <NowReservations
            reservations={reservationsForNow(state, reservations, now)}
            onOpen={(r) => setReservationId(r.id)}
          />
        }
        state={state}
        busy={busy}
        onDepart={() => run(departLabel, () => depart(state, uid), departSeen, 'depart')}
        onArrive={() =>
          run(`Chegamos: ${state.next?.name ?? ''}`, () => arrive(state, uid), arriveSeen, 'arrive')
        }
        onSkip={() => run(`Pulamos ${state.next?.name ?? ''}`, () => skip(state), skipSeen)}
      />

      {active ? (
        <div className="grid gap-3">
          <PositionLine position={cu.position} />
          {geo.loaded && !geo.allowed && !geo.declined && !panel.on ? (
            <PositionAsk onAllow={() => void grantGeo()} onDecline={() => void declineGeo()} />
          ) : null}
          {question ? (
            <PassedQuestion
              key={question.id}
              stop={question}
              date={day.date}
              now={now}
              onConfirm={(when) => {
                setDismissedPassed((xs) => [...xs, question.id]);
                run(`Marcado: ${question.name}`, () => arriveAt(question, uid, when), [
                  `arrived:${question.id}`,
                ]);
              }}
              onDismiss={() => setDismissedPassed((xs) => [...xs, question.id])}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <PanelToggle panel={panel} />
            <CalendarExport trip={trip} day={day} stops={stops} label="Exportar o dia" />
            <button
              type="button"
              onClick={() => setExpenseDraft({ date: day.date, ...expenseDefaults(state) })}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-card px-4 text-[15px] font-semibold text-ink-2 shadow-[inset_0_0_0_1.5px_var(--color-line)]"
            >
              <Plus className="size-4" aria-hidden="true" />
              Gasto
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <CalendarExport trip={trip} day={day} stops={stops} label="Exportar o dia" />
        </div>
      )}

      {promptStop ? (
        <MemoryPromptCard
          key={promptStop.id}
          stop={promptStop}
          uid={uid}
          profiles={profiles}
          more={prompts.length - 1}
          onOpen={() => setMemoryStopId(promptStop.id)}
          onDismiss={() => void dismissMemoryPrompt(promptStop.id)}
        />
      ) : null}

      {stops.length === 0 ? (
        <section
          aria-label="Trilha do dia"
          className="grid gap-3 rounded-card bg-card p-5 shadow-card"
        >
          <p className="text-[17px] text-ink-2">Nenhuma parada neste dia.</p>
        </section>
      ) : (
        <WorldSlot
          trip={trip}
          day={day}
          state={state}
          legs={legs}
          route={route}
          routeStatus={routeStatus}
          routeLoaded={routeLoaded}
          profiles={profiles}
          catchup={cu}
          panelOn={panel.on}
          uid={uid}
          night={night}
          onEventsOwner={setOwner}
          stopExtras={stopExtras}
          reviewPhotos={reviewPhotos}
        />
      )}

      <HowWasItSheet
        tripId={tripId}
        stop={sheetStop}
        uid={uid}
        onClose={() => setMemoryStopId(null)}
      />
      <ExpenseSheet
        open={expenseDraft ? { draft: expenseDraft } : null}
        trip={trip}
        days={tripDays}
        stops={tripStops}
        team={team}
        uid={uid}
        onClose={() => setExpenseDraft(null)}
        onSave={(values) => {
          setExpenseDraft(null);
          void createExpense(tripId, uid, values).then((id) =>
            toast.show({
              title: 'Gasto lançado',
              description: formatMoney(values.amount),
              kind: 'ok',
              action: {
                label: 'Ver gastos',
                onClick: () => void navigate(`/viagens/${tripId}/gastos?abrir=${id}`),
              },
            }),
          );
        }}
      />
      <ReservationSheet
        reservation={openReservation}
        stop={
          openReservation?.stop_id
            ? (stops.find((s) => s.id === openReservation.stop_id) ?? null)
            : null
        }
        today={todayISO(now)}
        now
        onClose={() => setReservationId(null)}
      />

      {panel.on ? <div className="h-24" aria-hidden="true" /> : null}
      <PanelBar panel={panel} />
    </>
  );
}
