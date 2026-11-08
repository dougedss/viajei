import { ListOrdered, MapPinOff, WifiOff } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { PERSON_COLORS } from '@shared/constants.ts';
import { normalizeCar } from '@/features/garage/rules.ts';
import { NavLinks } from '@/features/itinerary/components/StopCard.tsx';
import { useTripDays } from '@/features/itinerary/queries.ts';
import { useMissingRoutes } from '@/features/itinerary/route.ts';
import { kindLabel } from '@/features/itinerary/stop-kinds.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { useNow } from '@/features/travel-mode/hooks.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { StopForecast } from '@/features/weather/components/StopForecast.tsx';
import { WeatherCredit } from '@/features/weather/components/WeatherCredit.tsx';
import { useTripWeather } from '@/features/weather/queries.ts';
import { stopForecast } from '@/features/weather/rules.ts';
import { weekdayShortOf } from '@/features/weather/format.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { cx } from '@/lib/cx.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { formatStamp, hhmm } from '@/lib/time/index.ts';
import TripMap, { type TrackLine } from '../components/TripMap.tsx';
import { useMapStops, useMapTracks, useTripRoutes } from '../queries.ts';
import {
  boundsOf,
  initialSelection,
  lastSeen,
  mapDay,
  pinRole,
  trackLines,
  visiblePoints,
  type MapDay,
} from '../rules.ts';

/** A altura do aviso de sem internet, que o enquadramento reserva no topo do mapa. */
const OFFLINE_INSET = 44;

/**
 * O mapa da viagem (`/viagens/:tripId/mapa`, `?dia=<id>` ou `?dia=viagem`), fora do Modo Viagem.
 * Não é GPS: sem "você está aqui", sem pedir a posição, sem rota passo a passo. Mostra onde fica cada
 * parada, a estrada de cada dia, o que já se rodou e, para quem ficou em casa, onde o carro foi visto
 * pela última vez. Desenha do Dexie: sem rede, a linha e os pinos continuam, e os tiles são só os que
 * este aparelho já viu.
 */
export default function MapaPage() {
  const { tripId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useMapStops(tripId);
  const routes = useTripRoutes(tripId);
  const members = useTripMembers(tripId);
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const weather = useTripWeather(trip);
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  const now = useNow(30_000);
  const today = todayISO(now);
  const todayDay = days?.find((d) => d.date === today) ?? null;
  const tracks = useMapTracks(todayDay?.id ?? null, uid, members);
  const [selected, setSelected] = useState<{ stopId: string; dayId: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mountedAt] = useState(() => performance.now());

  const dayData = (days ?? []).map((day) => ({
    day,
    stops: (stops ?? []).filter((s) => s.trip_day_id === day.id),
  }));
  // com rede, as rotas que faltam (ou que não valem mais para as paradas de agora)
  useMissingRoutes(tripId, dayData, routes, days !== undefined && stops !== undefined);

  const onReady = useCallback(() => {
    setReady(true);
    if (import.meta.env.DEV) {
      console.info(
        `viajei: mapa no primeiro quadro em ${String(Math.round(performance.now() - mountedAt))} ms`,
      );
    }
  }, [mountedAt]);
  const onSelect = useCallback(
    (stopId: string, dayId: string) => setSelected({ stopId, dayId }),
    [],
  );

  if (trip === undefined || days === undefined || stops === undefined) return <Splash />;
  if (trip === null) return <NotFound />;

  const selection = initialSelection(trip, days, today, search.get('dia'));
  const all: MapDay[] = dayData.map(({ day, stops: dayStops }, index) =>
    mapDay({
      day,
      index,
      stops: dayStops,
      route: routes?.find((r) => r.trip_day_id === day.id) ?? null,
      now,
      today,
    }),
  );
  const visible = selection.kind === 'trip' ? all : all.filter((d) => d.day_id === selection.dayId);
  const showsToday = todayDay !== null && visible.some((d) => d.day_id === todayDay.id);
  const colorOf = (userId: string) => {
    const color = members.find((m) => m.member.user_id === userId)?.profile?.color ?? 'sky';
    return PERSON_COLORS[asPersonColor(color)].hex;
  };
  const lines: TrackLine[] = showsToday
    ? trackLines(tracks).map((t) => ({ ...t, color: colorOf(t.user_id) }))
    : [];
  const seen = showsToday ? lastSeen(tracks) : null;
  const bounds = boundsOf(
    visiblePoints(
      visible,
      lines.flatMap((l) => l.points),
    ),
  );
  const selectionKey = selection.kind === 'trip' ? 'viagem' : selection.dayId;
  const unlocated = visible.flatMap((d) => d.unlocated.map((stop) => ({ stop, day: d })));
  const pinned = all.some((d) => d.pins.length > 0);
  const choose = (key: string) => setSearch({ dia: key }, { replace: true });

  const pick = selected
    ? all.find((d) => d.day_id === selected.dayId)?.pins.find((p) => p.stop.id === selected.stopId)
    : undefined;
  const pickDay = selected ? all.find((d) => d.day_id === selected.dayId) : undefined;

  return (
    <div className="grid gap-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <PageHeader
        back={`/viagens/${trip.id}/detalhes`}
        title="Mapa"
        eyebrow={<span className="text-[15px] text-ink-2">{trip.name}</span>}
      />

      <div
        role="group"
        aria-label="O que o mapa mostra"
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1"
      >
        {[
          { key: 'viagem', label: 'Viagem' },
          ...days.map((d, i) => ({
            key: d.id,
            label: `Dia ${String(i + 1)} · ${weekdayShortOf(d.date)}`,
          })),
        ].map((c) => {
          const on = c.key === selectionKey;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(c.key)}
              className={cx(
                'inline-flex min-h-12 shrink-0 snap-start items-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap',
                on
                  ? 'bg-ink text-paper'
                  : 'bg-card text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]',
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {pinned ? (
        // `isolate`: as camadas do Leaflet (tiles 400, pinos 600 e mais, controles 1000) empilham só
        // dentro desta caixa; sem isso competiam na raiz com a folha (z-50) e o pino abria por cima dela
        <div
          className="relative isolate h-[clamp(360px,calc(100svh-250px),720px)] overflow-hidden rounded-card bg-stage shadow-card"
          data-map={selectionKey}
          data-map-ready={ready ? 'true' : undefined}
        >
          <TripMap
            days={visible}
            compact={selection.kind === 'trip'}
            tracks={lines}
            lastSeen={
              seen
                ? {
                    ...seen,
                    label: `Visto às ${formatStamp(new Date(seen.at * 1000).toISOString())}`,
                  }
                : null
            }
            car={normalizeCar(trip)}
            bounds={bounds}
            selectionKey={selectionKey}
            topInset={online ? 0 : OFFLINE_INSET}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
            onReady={onReady}
          />
          {!online ? (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-3 top-3 z-[1001] flex items-center gap-2 rounded-[14px] bg-card/95 px-3 py-2 text-[14px] text-ink-2 shadow-card backdrop-blur-sm"
              data-map-offline
            >
              <WifiOff className="size-4 shrink-0" aria-hidden="true" />
              Sem internet: o mapa mostra só as áreas já vistas neste aparelho
            </p>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={MapPinOff}
          title="Nenhuma parada com lugar no mapa"
          text="Com o endereço ou o link do Google Maps de cada parada, o mapa mostra a viagem e a estrada de cada dia."
          action={
            <ButtonLink to={`/viagens/${trip.id}/roteiro`} size="md">
              Abrir o roteiro
            </ButtonLink>
          }
        />
      )}

      {pinned && unlocated.length > 0 ? (
        <p
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2"
          data-map-unlocated
        >
          <MapPinOff className="size-4 shrink-0" aria-hidden="true" />
          <span>
            {unlocated.length}{' '}
            {unlocated.length === 1 ? 'parada sem lugar no mapa' : 'paradas sem lugar no mapa'}:{' '}
            {unlocated.map((u) => u.stop.name).join(', ')}
          </span>
          <Link
            to={`/viagens/${trip.id}/roteiro/${unlocated[0]?.day.day_id ?? ''}`}
            className="font-semibold text-accent-ink"
          >
            Pôr no mapa
          </Link>
        </p>
      ) : null}

      <Sheet
        open={pick !== undefined}
        onClose={() => setSelected(null)}
        title={pick?.stop.name ?? ''}
        {...(pick && pickDay
          ? {
              description: `${kindLabel(pick.stop.kind)} · Dia ${String(pickDay.index + 1)} · ${pinRole(pick)}`,
            }
          : {})}
      >
        {pick && pickDay ? (
          <div className="grid gap-3" data-map-sheet={pick.stop.id}>
            {pick.stop.time || pick.stop.closes_at ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
                {pick.stop.time ? (
                  <span className="num text-[22px] font-semibold">{hhmm(pick.stop.time)}</span>
                ) : null}
                {pick.stop.closes_at ? (
                  <span className="text-ink-2">fecha às {hhmm(pick.stop.closes_at)}</span>
                ) : null}
              </p>
            ) : null}
            {pick.stop.address ? (
              <p className="text-[15px] text-ink-2">{pick.stop.address}</p>
            ) : null}
            {pick.stop.time ? (
              <StopForecast
                forecast={stopForecast(weather.entries.get(pickDay.day_id), pick.stop.id)}
                at={`às ${hhmm(pick.stop.time)}`}
                className="text-[15px]"
              />
            ) : null}
            <NavLinks stop={pick.stop} />
            <ButtonLink
              to={`/viagens/${trip.id}/roteiro/${pickDay.day_id}`}
              variant="secondary"
              size="md"
            >
              <ListOrdered className="size-5" aria-hidden="true" />
              Ver no roteiro
            </ButtonLink>
            {stopForecast(weather.entries.get(pickDay.day_id), pick.stop.id) ? (
              <WeatherCredit updatedAt={weather.updatedAt} />
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}
