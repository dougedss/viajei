import { ChevronLeft, ChevronRight, CalendarOff, Route as RouteIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { useDayStops, useTripDays } from '@/features/itinerary/queries.ts';
import { useDayRoute } from '@/features/itinerary/route.ts';
import { formatKm, legsByStop, totalAscent } from '@/features/itinerary/rules.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { todayISO } from '@/features/trips/rules.ts';
import type { Profile } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { currentDay, formatDayShort, formatDuration } from '@/lib/time/index.ts';
import { arrive, depart, skip, type Undoable } from '../actions.ts';
import { AgoraHeader } from '../components/AgoraHeader.tsx';
import { TrailList } from '../components/TrailList.tsx';
import { useNightTheme, useNow } from '../hooks.ts';
import { dayState, progress } from '../rules.ts';

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

  const auto = currentDay(days, todayISO(now));
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
          <ButtonLink to={`/viagens/${trip.id}/roteiro`} variant="secondary" size="sm">
            <RouteIcon className="size-4" aria-hidden="true" />
            Roteiro
          </ButtonLink>
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
          tripId={trip.id}
          dayId={day.id}
          date={day.date}
          now={now}
          uid={session?.user.id ?? ''}
          profiles={profiles}
        />
      ) : (
        <EmptyState
          icon={CalendarOff}
          title="Sem dias nesta viagem"
          text="Os dias nascem das datas da viagem. Confira as datas em Editar viagem."
        />
      )}
    </div>
  );
}

type DayViewProps = {
  tripId: string;
  dayId: string;
  date: string;
  now: Date;
  uid: string;
  profiles: Map<string, Profile>;
};

function DayView({ tripId, dayId, date, now, uid, profiles }: DayViewProps) {
  const stops = useDayStops(dayId);
  const { route } = useDayRoute(tripId, dayId, stops);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const state = dayState({ date }, stops, now);
  const legs = legsByStop(stops, route);
  const done = progress(stops);

  const run = (label: string, action: () => Promise<Undoable>) => {
    setBusy(true);
    void action()
      .then(({ undo }) => {
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

  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : null;
  const duration = route ? route.legs.reduce((acc, l) => acc + l.duration_s, 0) / 60 : null;

  return (
    <>
      <AgoraHeader
        state={state}
        busy={busy}
        onDepart={() =>
          run(
            state.at && !state.onRoad
              ? `Saímos de ${state.at.name}`
              : `Saímos: ${state.next?.name ?? ''}`,
            () => depart(state, uid),
          )
        }
        onArrive={() => run(`Chegamos: ${state.next?.name ?? ''}`, () => arrive(state, uid))}
        onSkip={() => run(`Pulamos ${state.next?.name ?? ''}`, () => skip(state))}
      />

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
    </>
  );
}
