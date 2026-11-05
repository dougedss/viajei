import { Bell, ChevronLeft, ChevronRight, CalendarOff, Route as RouteIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useDayStops, useTripDays } from '@/features/itinerary/queries.ts';
import { useDayRoute } from '@/features/itinerary/route.ts';
import { formatKm, legsByStop, totalAscent } from '@/features/itinerary/rules.ts';
import { applyBadge, badgeCount } from '@/features/notifications/badge.ts';
import { CalendarExport } from '@/features/notifications/components/CalendarExport.tsx';
import { PushAskSheet } from '@/features/notifications/components/PushAskSheet.tsx';
import { useTrip, useTripMembers, type MemberWithProfile } from '@/features/trips/queries.ts';
import { todayISO, tripStatus } from '@/features/trips/rules.ts';
import type { Profile, Trip } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { currentDay, formatDayShort, formatDuration } from '@/lib/time/index.ts';
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
import { TrailList } from '../components/TrailList.tsx';
import { useNightTheme, useNow } from '../hooks.ts';
import { usePanelMode } from '../panel.ts';
import { declineGeo, grantGeo, useGeoConsent, useTeamTracks } from '../queries.ts';
import { dayState, isDepartureNode, progress } from '../rules.ts';

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
  uid: string;
  members: readonly MemberWithProfile[];
  profiles: Map<string, Profile>;
  /** o dia é hoje e a viagem está acontecendo: catch-up com GPS, painel e selo só assim */
  active: boolean;
};

function DayView({ trip, day, now, uid, members, profiles, active }: DayViewProps) {
  const tripId = trip.id;
  const dayId = day.id;
  const stops = useDayStops(dayId);
  const { route } = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = dayState({ date: day.date }, stops, now);
  const legs = legsByStop(stops, route);
  const done = progress(stops);
  const teamTracks = useTeamTracks(dayId, uid, members);
  const geo = useGeoConsent();
  const [dismissedPassed, setDismissedPassed] = useState<string[]>([]);

  const run = (label: string, action: () => Promise<Undoable>, seen: readonly string[] = []) => {
    setBusy(true);
    void action()
      .then(({ undo }) => {
        cuRef.current?.markSeen(seen);
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
    onAutoDepart: () => run(departLabel, () => depart(state, uid), departSeen),
    onAutoArrive: () =>
      run(`Chegamos: ${state.next?.name ?? ''}`, () => arrive(state, uid), arriveSeen),
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
    run(`Chegamos: ${autoStop.name}`, () => arrive(state, uid), [`arrived:${autoStop.id}`]);
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

  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : null;
  const duration = route ? route.legs.reduce((acc, l) => acc + l.duration_s, 0) / 60 : null;

  return (
    <>
      <SinceLastTime
        events={cu.events}
        profiles={profiles}
        onDismiss={() => void cu.dismissEvents()}
      />

      <AgoraHeader
        state={state}
        busy={busy}
        onDepart={() => run(departLabel, () => depart(state, uid), departSeen)}
        onArrive={() =>
          run(`Chegamos: ${state.next?.name ?? ''}`, () => arrive(state, uid), arriveSeen)
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
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <CalendarExport trip={trip} day={day} stops={stops} label="Exportar o dia" />
        </div>
      )}

      <section
        aria-labelledby="h-trilha"
        className="grid gap-3 rounded-card bg-card p-5 shadow-card"
      >
        <div className="flex items-baseline justify-between">
          <h2 id="h-trilha" className="label-caps text-accent-ink">
            Trilha do dia
          </h2>
          <span className="text-[15px] text-ink-2">
            {done.done} de {done.total} {done.total === 1 ? 'parada' : 'paradas'}
          </span>
        </div>
        {stops.length === 0 ? (
          <p className="text-[17px] text-ink-2">Nenhuma parada neste dia.</p>
        ) : (
          <TrailList state={state} legs={legs} profiles={profiles} />
        )}
        {route && distance !== null && duration !== null ? (
          <p className="border-t border-line pt-3 text-[15px] text-ink-2">
            Rota do dia · {formatKm(distance)} · {formatDuration(duration)} · sobe{' '}
            {totalAscent(route.elevation).toLocaleString('pt-BR')} m
          </p>
        ) : null}
      </section>

      {panel.on ? <div className="h-24" aria-hidden="true" /> : null}
      <PanelBar panel={panel} />
    </>
  );
}
