import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, CalendarOff, Gauge, SlidersHorizontal, Star, Ticket } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { QuestChecks } from '@/features/checklists/components/QuestChecks.tsx';
import { useTripChecklist } from '@/features/checklists/queries.ts';
import { useDayStops, useTripDays } from '@/features/itinerary/queries.ts';
import { useDayRoute } from '@/features/itinerary/route.ts';
import { legsByStop } from '@/features/itinerary/rules.ts';
import { applyBadge, badgeCount } from '@/features/notifications/badge.ts';
import { PushAskSheet } from '@/features/notifications/components/PushAskSheet.tsx';
import { useTrip, useTripMembers, type MemberWithProfile } from '@/features/trips/queries.ts';
import { todayISO, tripStatus } from '@/features/trips/rules.ts';
import type { Profile, Trip } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { WorldSlot, type EventsOwner, type ReviewPhoto } from '@/features/world/WorldSlot.tsx';
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
import { usePanelMode } from '../panel.ts';
import { declineGeo, grantGeo, useGeoConsent, useTeamTracks } from '../queries.ts';
import { dayState, isDepartureNode } from '../rules.ts';
import { dayBar, overlayCard } from '../screen.ts';

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
  // o modo painel (GPS contínuo com a tela acesa), ligado pelo botão do topo
  const [panelOn, setPanelOn] = useState(false);
  const pref = useRenderPref();
  const { search } = useLocation();
  const support = useSupport();

  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const today = todayISO(now);
  const bar = dayBar({ days, today, overrideId: override });
  const { day, index } = bar;
  const active = day !== null && day.date === today && tripStatus(trip, today) === 'ongoing';
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
        {active ? (
          <button
            type="button"
            className="grid size-12 shrink-0 place-items-center rounded-full text-ink-2 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink"
            aria-pressed={panelOn}
            aria-label="Modo painel"
            onClick={() => setPanelOn((v) => !v)}
          >
            <Gauge className="size-6" aria-hidden="true" />
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
          panelOn={panelOn}
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

      <PushAskSheet trip={trip} />
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
  /** o dia é hoje e a viagem está acontecendo: catch-up com GPS, painel e selo só assim */
  active: boolean;
  /** a viagem terminou: o cartão "Viajei!" por cima do último dia */
  finishedTrip: boolean;
  /** o modo painel ligado pelo botão do topo */
  panelOn: boolean;
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
  panelOn,
}: DayViewProps) {
  const tripId = trip.id;
  const dayId = day.id;
  const loadedStops = useDayStops(dayId);
  const stops = loadedStops ?? [];
  const { route, status: routeStatus, loaded: routeLoaded } = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = dayState({ date: day.date }, stops, now);
  const legs = legsByStop(stops, route);
  const teamTracks = useTeamTracks(dayId, uid, members);
  // a previsão do dia (Dexie; com rede e cache velho, a busca da viagem inteira)
  const weather = useTripWeather(trip);
  const forecast = weather.entries.get(dayId);
  const geo = useGeoConsent();
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
  const [memoryStopId, setMemoryStopId] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);
  // o momento calmo da tela: fechar a folha "Como foi?" (até o próximo Partiu!), nunca com o modo
  // painel. Os cartões que já esperavam na fila nesse instante saem aí; os outros esperam.
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
    // o "+10" aparece onde o dedo tocou (a posição fica guardada antes do botão mudar)
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
    on: panelOn,
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
    position: active && geo.loaded && !geo.allowed && !geo.declined && !panel.on,
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
            weather={{ summary: daySummary(forecast), stops: forecast?.stops ?? {} }}
          />
        )}

        {/* sobre a maquete, de baixo para cima: o "Agora", "Detalhes" e o cartão da vez */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom,0px))]">
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
          ) : null}
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
                  tracking={panel.on}
                  lowPower={panel.lowPower}
                />
              ) : null
            }
          />
        </div>
      </div>

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
        active={!panel.on && calmSince !== null}
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
