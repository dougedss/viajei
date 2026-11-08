import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  CalendarOff,
  Check,
  Plus,
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { QuestChecks } from '@/features/checklists/components/QuestChecks.tsx';
import { useTripChecklist } from '@/features/checklists/queries.ts';
import { createExpense } from '@/features/expenses/actions.ts';
import { ExpenseSheet, type ExpenseDraft } from '@/features/expenses/components/ExpenseSheet.tsx';
import { categoryForStop } from '@/features/expenses/rules.ts';
import { StopSheet } from '@/features/itinerary/components/StopSheet.tsx';
import { useDayStops, useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useDayRoute } from '@/features/itinerary/route.ts';
import { legsByStop } from '@/features/itinerary/rules.ts';
import { applyBadge, badgeCount } from '@/features/notifications/badge.ts';
import {
  PushAskSheet,
  PushInstallCard,
} from '@/features/notifications/components/PushAskSheet.tsx';
import { useTrip, useTripMembers, type MemberWithProfile } from '@/features/trips/queries.ts';
import { formatMoney, todayISO, tripStatus } from '@/features/trips/rules.ts';
import type { Profile, Trip } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { useDocumentVisible } from '@/lib/visibility.ts';
import { convoy, teamPoints } from '@/features/world/convoy.ts';
import { useElementSize } from '@/features/world/hooks/useElementSize.ts';
import { WorldSlot, type EventsOwner, type ReviewPhoto } from '@/features/world/WorldSlot.tsx';
import { indexRoute } from '@/lib/geo/project.ts';
import { useRenderPref, writeRenderPref } from '@/features/world/prefs.ts';
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
import { ReservationSheet } from '@/features/reservations/components/ReservationSheet.tsx';
import { useTripReservations } from '@/features/reservations/queries.ts';
import { reservationsForNow, reservationsOfStop } from '@/features/reservations/rules.ts';
import { retroState } from '@/features/retrospective/rules.ts';
import { db, type Stop } from '@/lib/db/schema.ts';
import { useTripMediaPrefetch } from '@/lib/media/hooks.ts';
import { audio } from '@/lib/audio/index.ts';
import { celebrateArrival } from '@/lib/celebrate.ts';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import { useSupport } from '@/lib/three/useSupport.ts';
import { XP_POINTS } from '@shared/constants.ts';
import { CelebrationHost } from '@/features/progression/components/CelebrationHost.tsx';
import { gainXp, tappedRect } from '@/features/progression/xp-gain.ts';
import { daySummary } from '@/features/weather/rules.ts';
import { useTripWeather } from '@/features/weather/queries.ts';
import { arrive, arriveAt, depart, skip, type Undoable } from '../actions.ts';
import { useCatchup } from '../catchup.ts';
import {
  PassedQuestion,
  PositionAsk,
  PositionLine,
  SinceLastTime,
} from '../components/CatchupCards.tsx';
import { DayBar } from '../components/DayBar.tsx';
import { NowBar } from '../components/NowBar.tsx';
import { RetroCard } from '../components/RetroCard.tsx';
import { useRetroSeen } from '../retro-seen.ts';
import { useNightTheme, useNow } from '../hooks.ts';
import { useLivePosition } from '../live.ts';
import { liveEnabled } from '../live-rules.ts';
import { declineGeo, grantGeo, useGeoConsent, useTeamTracks } from '../queries.ts';
import { dayState, isDepartureNode } from '../rules.ts';
import { dayBar, overlayCard } from '../screen.ts';
import {
  useScreenAwakePref,
  useWakeLock,
  wakeLockSupported,
  writeScreenAwakePref,
} from '../wake-lock.ts';

const UNDO_MS = 10_000;

/**
 * A tela da viagem (`/viagens/:tripId`, fase 14): a maquete inteira na tela, sem rolagem. No alto, a
 * barra do dia; embaixo, sobre a maquete, o "Agora" compacto com Partiu! e Chegamos!, e o botão
 * "Detalhes" para o resto. O que acontece aparece num único lugar acima da barra e some. Antes da
 * viagem, o Dia 1 com a estrada inteira; depois, o último dia com o cartão "Viajei!".
 */
export default function ViagemPage() {
  const { tripId = '' } = useParams();
  const { session } = useSession();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const members = useTripMembers(tripId);
  const now = useNow();
  const night = useNightTheme(now);
  useTravelText(night);
  const [override, setOverride] = useState<string | null>(null);
  // "Tela acesa": lembrado por aparelho; só vale no dia de hoje da viagem em andamento, com a tela
  // visível (o navegador solta o lock quando a página some)
  const awake = useScreenAwakePref();
  const pref = useRenderPref();
  const { search } = useLocation();
  const support = useSupport();
  const today = todayISO(now);
  const bar = dayBar({ days: days ?? [], today, overrideId: override });
  const { day, index } = bar;
  const active =
    day !== null && day.date === today && !!trip && tripStatus(trip, today) === 'ongoing';
  useWakeLock(awake && active);

  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const profiles = new Map<string, Profile>();
  for (const m of members) if (m.profile) profiles.set(m.profile.id, m.profile);
  // a lista ou a maquete: a escolha some quando não há maquete possível ou a URL força a lista
  const forced = readUrlFlags(search).forceList || support === 'none';
  const render = forced
    ? null
    : {
        mode: pref === 'list' ? ('list' as const) : ('world' as const),
        onToggle: () => writeRenderPref(pref === 'list' ? 'auto' : 'list'),
      };

  return (
    <div
      className="flex h-svh flex-col overflow-hidden bg-paper text-(length:--mv-min)"
      data-tela-viagem
    >
      <DayBar
        tripName={trip.name}
        bar={bar}
        onPrev={() => setOverride(days[index - 1]?.id ?? null)}
        onNext={() => setOverride(days[index + 1]?.id ?? null)}
        onToday={() => setOverride(null)}
        render={render}
      >
        {active && wakeLockSupported() ? (
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center rounded-full text-ink-2 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            aria-pressed={awake}
            aria-label="Tela acesa"
            onClick={() => writeScreenAwakePref(!awake)}
          >
            <Sun className="size-6" aria-hidden="true" />
          </button>
        ) : null}
      </DayBar>

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
          active={active}
          finishedTrip={tripStatus(trip, today) === 'past'}
        />
      ) : (
        <div className="grid flex-1 content-center safe-x">
          <EmptyState
            icon={CalendarOff}
            title="Sem dias nesta viagem"
            text="Os dias nascem das datas da viagem. Confira as datas em Editar viagem."
            action={
              <ButtonLink to={`/viagens/${trip.id}/detalhes`} variant="secondary" size="md">
                Detalhes
              </ButtonLink>
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * O texto da tela da viagem: 17 px no mínimo, 10% maior à noite (prompt, 11). Enquanto a tela está
 * aberta, a raiz do documento diz qual dos dois vale, e o `app.css` define as variáveis que a utility
 * `mv-text-*` lê. Na raiz, e não na página, para os avisos e as folhas, que moram fora dela, seguirem
 * a mesma regra. Antes da pintura, para o primeiro quadro já sair no tamanho certo.
 */
function useTravelText(night: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.travelText = night ? 'night' : 'day';
    return () => {
      delete root.dataset.travelText;
    };
  }, [night]);
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
  /** o dia é hoje e a viagem está acontecendo: catch-up com GPS, acompanhamento e selo só assim */
  active: boolean;
  /** a viagem terminou: o cartão "Viajei!" por cima do último dia */
  finishedTrip: boolean;
};

function DayView({
  trip,
  day,
  now,
  night,
  uid,
  members,
  profiles,
  active,
  finishedTrip,
}: DayViewProps) {
  const tripId = trip.id;
  const dayId = day.id;
  const loadedStops = useDayStops(dayId);
  const stops = loadedStops ?? [];
  const { route, status: routeStatus, loaded: routeLoaded } = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // o que fica sobre o pé da tela (o cartão, "Detalhes", o "Agora"), medido: a lista do dia termina
  // acima disso, para nada rolar até debaixo da barra
  const [observeOverlay, overlay] = useElementSize();
  // a folha da parada (a miniatura, a pílula ou a linha da lista) e o gasto que nasce dela
  const [openStopId, setOpenStopId] = useState<string | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft | null>(null);
  const tripDays = useTripDays(tripId) ?? [];
  const tripStops = useTripStops(tripId);
  const state = dayState({ date: day.date }, stops, now);
  const legs = legsByStop(stops, route);
  const teamTracks = useTeamTracks(dayId, uid, members);
  // a previsão do dia (Dexie; com rede e cache velho, a busca da viagem inteira)
  const weather = useTripWeather(trip);
  const forecast = weather.entries.get(dayId);
  const geo = useGeoConsent();
  const visible = useDocumentVisible();
  const [dismissedPassed, setDismissedPassed] = useState<string[]>([]);
  // quem conta "o que aconteceu desde a última vez": a maquete (replay) ou o card; nunca os dois
  const [owner, setOwner] = useState<EventsOwner | null>(null);
  const retroSeen = useRetroSeen(tripId);

  // reservas, memórias e fotos da viagem: o "Ver reserva", o "Como foi?" e o "Rever o dia"
  const loadedReservations = useTripReservations(tripId);
  const reservations = loadedReservations ?? [];
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
  // as missões da viagem (as da parada aparecem na lista do dia)
  const quests = (useTripChecklist(tripId) ?? []).filter(
    (i) => i.kind === 'quest' && i.status === 'active' && i.stop_id !== null,
  );
  const team = members
    .filter((m) => m.member.status === 'accepted')
    .flatMap((m) => (m.profile ? [m.profile] : []));
  const [memoryStopId, setMemoryStopId] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  // o momento calmo da tela: fechar a folha "Como foi?" (até o próximo Partiu!). Os cartões que já
  // esperavam na fila nesse instante saem aí; os outros esperam.
  const [calmSince, setCalmSince] = useState<number | null>(null);
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
    // o "+10" aparece onde o dedo tocou (a posição fica guardada antes do botão mudar); as marcações
    // automáticas passam por aqui com `at: null`: sem o "+10", que é só do toque (o XP de verdade vem
    // do motor de progressão, que deriva `stop_done` de qualquer `done_at`)
    const at = source === 'tap' ? tappedRect() : null;
    if (effect === 'depart') setCalmSince(null);
    void action()
      .then(({ undo }) => {
        cuRef.current?.markSeen(seen);
        if (effect === 'depart') audio.horn();
        if (effect === 'arrive') {
          audio.bell();
          celebrateArrival();
          if (arriving && at) void gainXp(uid, 'stop_done', arriving.id, XP_POINTS.stop_done, at);
        }
        if (
          arriving &&
          memoryPrompt({ source, stop: arriving, answered: answered.has(arriving.id) }) === 'sheet'
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

  // Partiu! e Chegamos! pelo GPS sempre que o mapa está aberto (fase 14): com a tela visível, o dia
  // de hoje, a viagem em andamento e a posição permitida
  const live = useLivePosition({
    enabled: liveEnabled({ visible, isToday: active, ongoing: active, consent: geo.allowed }),
    tripId,
    dayId,
    uid,
    state,
    onAutoDepart: () => run(departLabel, () => depart(state, uid), departSeen, 'depart', 'live'),
    onAutoArrive: () =>
      run(
        `Chegamos: ${state.next?.name ?? ''}`,
        () => arrive(state, uid),
        arriveSeen,
        'arrive',
        'live',
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
    liveFix: live.fix,
  });
  const cuRef = useRef<typeof cu | null>(null);
  useEffect(() => {
    cuRef.current = cu;
  }, [cu]);

  // Chegamos! automático do catch-up: uma vez por leitura única (ao abrir, ao voltar à tela), com o
  // mesmo toast de desfazer; as leituras do acompanhamento são da regra da D47 (`useLivePosition`)
  const autoHandled = useRef(new Set<string>());
  const autoStop = cu.autoArrive;
  const fixAt = cu.readFix?.t ?? 0;
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

  // o comboio (D179): quem do time está em outro carro, pela última posição que mandou
  const routeIndex = useMemo(
    () => (route && route.geometry.length >= 2 ? indexRoute(route.geometry) : null),
    [route],
  );
  const convoyCars = useMemo(
    () =>
      convoy({
        me: cu.fix ? [cu.fix.lng, cu.fix.lat] : null,
        team: teamPoints(teamTracks),
        now: now.getTime(),
        route: routeIndex,
      }),
    [cu.fix, teamTracks, now, routeIndex],
  );

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
  const openStop = openStopId ? (stops.find((s) => s.id === openStopId) ?? null) : null;
  const openStopIndex = openStop ? stops.findIndex((s) => s.id === openStop.id) : -1;
  const dayIndex = tripDays.findIndex((d) => d.id === dayId);
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
      'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-card px-3 mv-text-14 font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';
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

  // o dia pinta inteiro: as paradas e as reservas mudam o tamanho do "Agora" (os chips), e chegando
  // depois empurravam o que está embaixo (fase 12, D162). Os efeitos acima já rodam.
  if (loadedStops === undefined || loadedReservations === undefined) {
    return <div className="relative isolate min-h-0 flex-1 bg-stage" />;
  }

  // o único lugar sobre a maquete: um cartão por vez
  const retro =
    finishedTrip && !retroSeen && retroState(trip, stops, todayISO(now)).status === 'ready';
  const card = overlayCard({
    since: owner === 'card' && cu.events.length > 0,
    passed: active && question !== undefined,
    position: active && geo.loaded && !geo.allowed && !geo.declined,
    memory: promptStop !== null,
    retro,
  });

  return (
    <>
      <div className="relative isolate min-h-0 flex-1 overflow-hidden bg-stage" data-palco>
        {stops.length === 0 ? (
          <p
            className="absolute inset-0 grid place-items-center px-6 text-center mv-text-17 text-ink-2"
            role="status"
          >
            Nenhuma parada neste dia.
          </p>
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
            uid={uid}
            night={night}
            onEventsOwner={setOwner}
            stopExtras={stopExtras}
            reviewPhotos={reviewPhotos}
            onOpenStop={setOpenStopId}
            convoy={convoyCars}
            bottomInset={overlay.height}
            weather={{ summary: daySummary(forecast), stops: forecast?.stops ?? {} }}
          />
        )}

        {/* sobre a maquete, de baixo para cima: o "Agora", "Detalhes" e o cartão da vez */}
        <div
          ref={observeOverlay}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]"
          data-overlay
        >
          {card === 'since' ? (
            <div className="pointer-events-auto">
              <SinceLastTime
                events={cu.events}
                profiles={profiles}
                onDismiss={() => void cu.dismissEvents()}
              />
            </div>
          ) : card === 'passed' && question ? (
            <div className="pointer-events-auto">
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
            </div>
          ) : card === 'position' ? (
            <div className="pointer-events-auto">
              <PositionAsk onAllow={() => void grantGeo()} onDecline={() => void declineGeo()} />
            </div>
          ) : card === 'memory' && promptStop ? (
            <div className="pointer-events-auto">
              <MemoryPromptCard
                key={promptStop.id}
                stop={promptStop}
                uid={uid}
                profiles={profiles}
                more={prompts.length - 1}
                onOpen={() => setMemoryStopId(promptStop.id)}
                onDismiss={() => void dismissMemoryPrompt(promptStop.id)}
              />
            </div>
          ) : card === 'retro' ? (
            <div className="pointer-events-auto">
              <RetroCard tripId={tripId} done={stops.filter((s) => s.done_at !== null).length} />
            </div>
          ) : (
            // no iPhone fora da Tela de Início, a oferta dos avisos é um cartão em linha (D48): entra
            // no lugar do cartão da vez, nunca empurrando a maquete (a tela é inteira)
            <div className="pointer-events-auto">
              <PushInstallCard trip={trip} />
            </div>
          )}
          <div className="flex justify-end">
            <ButtonLink
              to={`/viagens/${tripId}/detalhes`}
              variant="secondary"
              size="md"
              className="pointer-events-auto min-h-12 bg-card/95 shadow-card backdrop-blur-sm"
              data-detalhes
            >
              <SlidersHorizontal className="size-5" aria-hidden="true" />
              Detalhes
            </ButtonLink>
          </div>
          <NowBar
            state={state}
            busy={busy}
            onDepart={() => run(departLabel, () => depart(state, uid), departSeen, 'depart')}
            onArrive={() =>
              run(
                `Chegamos: ${state.next?.name ?? ''}`,
                () => arrive(state, uid),
                arriveSeen,
                'arrive',
              )
            }
            onSkip={() => run(`Pulamos ${state.next?.name ?? ''}`, () => skip(state), skipSeen)}
            reservations={reservationsForNow(state, reservations, now)}
            onOpenReservation={(r) => setReservationId(r.id)}
            line={
              active ? (
                <PositionLine
                  position={cu.position}
                  tracking={live.tracking}
                  lowPower={live.lowPower}
                  denied={live.denied}
                  fixAt={live.fix?.t ?? null}
                  readAt={cu.readFix?.t ?? null}
                />
              ) : null
            }
          />
        </div>
      </div>

      {/* a folha da parada, por cima do canvas: a mesma do mapa 2D, mais Chegamos! e o gasto */}
      {/* a folha "Avisos da viagem" (D48) é uma folha: fica na raiz, por cima de tudo */}
      <PushAskSheet trip={trip} />
      <StopSheet
        stop={openStop}
        tripId={tripId}
        day={{ id: dayId, index: Math.max(0, dayIndex) }}
        position={openStopIndex >= 0 ? openStopIndex + 1 : null}
        weather={{ entry: forecast, updatedAt: weather.updatedAt }}
        onClose={() => setOpenStopId(null)}
        actions={
          openStop ? (
            <div className="flex flex-wrap gap-2">
              {active && state.arriveAvailable && state.next?.id === openStop.id ? (
                <Button
                  size="md"
                  className="flex-1"
                  loading={busy}
                  onClick={() => {
                    setOpenStopId(null);
                    run(
                      `Chegamos: ${openStop.name}`,
                      () => arrive(state, uid),
                      arriveSeen,
                      'arrive',
                    );
                  }}
                >
                  <Check className="size-5" aria-hidden="true" />
                  Chegamos!
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="md"
                onClick={() => {
                  setOpenStopId(null);
                  setExpenseDraft({
                    date: day.date,
                    stop_id: openStop.id,
                    category: categoryForStop(openStop.kind),
                  });
                }}
              >
                <Plus className="size-5" aria-hidden="true" />
                Gasto
              </Button>
            </div>
          ) : null
        }
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
          void createExpense(tripId, uid, values).then((id) => {
            void gainXp(uid, 'expense_logged', id, XP_POINTS.expense_logged, null);
            toast.show({
              title: 'Gasto lançado',
              description: formatMoney(values.amount),
              kind: 'ok',
              action: {
                label: 'Ver gastos',
                onClick: () => void navigate(`/viagens/${tripId}/gastos?abrir=${id}`),
              },
            });
          });
        }}
      />
      <HowWasItSheet
        tripId={tripId}
        stop={sheetStop}
        uid={uid}
        onClose={() => {
          setMemoryStopId(null);
          setCalmSince(Date.now());
        }}
      />
      <CelebrationHost
        active={calmSince !== null}
        since={calmSince ?? 0}
        tripId={tripId}
        showSummary={false}
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
    </>
  );
}
