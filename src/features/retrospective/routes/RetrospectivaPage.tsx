import { ACHIEVEMENTS, PERSON_COLORS } from '@shared/constants.ts';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Clapperboard, Image, RotateCcw, X } from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { CarSide } from '@/art/cars/CarSide.tsx';
import { NotFound } from '@/app/NotFound.tsx';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { useTripChecklist } from '@/features/checklists/queries.ts';
import { useTripExpenses } from '@/features/expenses/queries.ts';
import { normalizeCar } from '@/features/garage/rules.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { activeStops } from '@/features/itinerary/rules.ts';
import { useTripMemories } from '@/features/memories/queries.ts';
import { asPersonColor } from '@/features/profile/queries.ts';
import { isAchievementKey } from '@/features/progression/team.ts';
import { useTrip, useTripMembers } from '@/features/trips/queries.ts';
import { todayISO } from '@/features/trips/rules.ts';
import { useElementSize } from '@/features/world/hooks/useElementSize.ts';
import { buildLayout, type WorldLayout } from '@/features/world/layout.ts';
import { audio } from '@/lib/audio/index.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import {
  db,
  type Attachment,
  type DayRoute,
  type Stop,
  type Trip,
  type TripDay,
} from '@/lib/db/schema.ts';
import { mediaCache } from '@/lib/media/index.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { useThemeOverride } from '@/lib/theme.ts';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import { ThreeBoundary } from '@/lib/three/ThreeBoundary.tsx';
import { useSupport } from '@/lib/three/useSupport.ts';
import { fetchMissingRoutes } from '@/features/itinerary/route.ts';
import type { PlaceReading } from '@/lib/geo/index.ts';
import { ExportSheet } from '../components/ExportSheet.tsx';
import type { FilmHandle } from '../components/FilmStage.tsx';
import {
  CARD_KINDS,
  CARD_LABELS,
  CARD_SIZES,
  drawCard,
  drawFilmOverlay,
  loadFonts,
  type Bitmap,
  type FilmArt,
} from '../draw.ts';
import { VIDEO } from '../export-format.ts';
import { FilmClock } from '../film.ts';
import {
  dayLabel,
  doneQuests,
  FILM_MS,
  filmNumbers,
  finalTexts,
  nodePhotos,
  periodLong,
  planFilm,
  retroState,
  spliceTrip,
  tripAchievements,
  type FilmPlan,
} from '../rules.ts';

const FilmStage = lazy(() => import('../components/FilmStage.tsx'));

/**
 * A retrospectiva "Viajei!" (`/viagens/:tripId/retrospectiva`): do dia seguinte ao fim em diante, o
 * filme de 15 s sobre a maquete da viagem inteira, com as fotos nos nós e o card final; o vídeo
 * vertical e os cards como imagem para compartilhar. Com reduzir movimento, sem WebGL ou com
 * `?render=list`, a sequência de cards no lugar do filme. Tudo é local: sem sinal, o filme toca com o
 * que o aparelho tem; com sinal, a tela busca as fotos e as rotas que faltam.
 */
export default function RetrospectivaPage() {
  const { tripId = '' } = useParams();
  const trip = useTrip(tripId);
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  useThemeOverride('dark');
  if (trip === undefined || days === undefined) return <Splash />;
  if (trip === null) return <NotFound />;
  const state = retroState(trip, stops, todayISO());
  if (state.status !== 'ready') return <NotYet trip={trip} state={state} />;
  return <Retro trip={trip} days={days} stops={stops} />;
}

function NotYet({ trip, state }: { trip: Trip; state: ReturnType<typeof retroState> }) {
  const [, m, d] = (state.status === 'soon' ? state.opensOn : '').split('-');
  return (
    <div className="grid min-h-[70svh] place-items-center text-center" data-retro={state.status}>
      <div className="grid max-w-sm gap-4">
        <Clapperboard className="mx-auto size-10 text-sunset" aria-hidden="true" />
        <h1 className="font-num text-[34px] leading-tight font-bold">Viajei!</h1>
        <p className="text-[17px] text-ink-2">
          {state.status === 'soon'
            ? `A retrospectiva fica pronta em ${d ?? ''}/${m ?? ''}, no dia seguinte ao fim da viagem.`
            : 'Esta viagem não teve paradas concluídas: não há filme para contar.'}
        </p>
        <ButtonLink to={`/viagens/${trip.id}/detalhes`} variant="secondary" size="md">
          Voltar à viagem
        </ButtonLink>
      </div>
    </div>
  );
}

type DayData = { day: TripDay; stops: Stop[] };

/** As fotos e as rotas que faltam, buscadas uma vez ao abrir, com rede (o filme não espera por elas). */
function useFillGaps(
  tripId: string,
  photos: readonly Attachment[] | undefined,
  days: readonly DayData[],
  routes: readonly DayRoute[] | undefined,
  cached: ReadonlySet<string> | undefined,
): void {
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !photos || !routes || !cached || !connectivity.canTry()) return;
    asked.current = true;
    void (async () => {
      for (const p of photos) if (!cached.has(p.id)) await mediaCache.ensure(p).catch(() => false);
      await fetchMissingRoutes(tripId, days, routes);
    })();
  }, [tripId, photos, days, routes, cached]);
}

/** A leitura do lugar da viagem inteira (lib/geo, sob demanda), com mais partes que a de um dia. */
function useTripPlace(route: ReturnType<typeof spliceTrip>['route']): PlaceReading | null {
  const [place, setPlace] = useState<{ key: string; reading: PlaceReading } | null>(null);
  const key = route
    ? `${route.geometry.length}:${route.legs.length}:${route.elevation.length}`
    : '';
  useEffect(() => {
    if (!route) return;
    let alive = true;
    void import('@/lib/geo/index.ts').then(({ classifySegments, curiosities, samplePlaces }) => {
      const samples = samplePlaces(route);
      const segments = classifySegments(route, { maxParts: 12 });
      if (alive)
        setPlace({
          key,
          reading: { segments, curiosities: curiosities(route.elevation, samples, segments) },
        });
    });
    return () => {
      alive = false;
    };
  }, [route, key]);
  return place?.key === key ? place.reading : null;
}

/** As fotos do filme decodificadas uma vez (ImageBitmap), a partir do cache de arquivos. */
function useBitmaps(ids: readonly string[]): ReadonlyMap<string, Bitmap> {
  const [bitmaps, setBitmaps] = useState<ReadonlyMap<string, ImageBitmap>>(new Map());
  const key = ids.join(',');
  useEffect(() => {
    const life = new AbortController();
    const made: ImageBitmap[] = [];
    void (async () => {
      const out = new Map<string, ImageBitmap>();
      for (const id of key ? key.split(',') : []) {
        const entry = await db.blobs.get(id);
        if (!entry) continue;
        const bmp = await createImageBitmap(entry.blob).catch(() => null);
        if (bmp) {
          made.push(bmp);
          out.set(id, bmp);
        }
      }
      if (!life.signal.aborted) setBitmaps(out);
    })();
    return () => {
      life.abort();
      for (const b of made) b.close();
    };
  }, [key]);
  return bitmaps;
}

/**
 * O carro da viagem de lado como imagem, para o fundo sem 3D e os cards: o próprio `CarSide`
 * serializado do DOM (a mesma arte, sem reescrever em Path2D; o carro não tem texto, então não
 * depende de fonte, e não há `foreignObject`, que o Safari quebra).
 */
function useCarImage(host: RefObject<HTMLDivElement | null>, carKey: string): Bitmap | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const svg = host.current?.querySelector('svg');
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const box = svg.viewBox.baseVal;
    const w = 1200;
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(Math.round((w * box.height) / Math.max(1, box.width))));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
      type: 'image/svg+xml',
    });
    const url = URL.createObjectURL(blob);
    const image = new window.Image();
    let alive = true;
    image.onload = () => {
      if (alive) setImg(image);
    };
    image.src = url;
    return () => {
      alive = false;
      URL.revokeObjectURL(url);
    };
  }, [host, carKey]);
  return img;
}

function Retro({ trip, days, stops }: { trip: Trip; days: TripDay[]; stops: Stop[] }) {
  const tripId = trip.id;
  const { search } = useLocation();
  const flags = readUrlFlags(search);
  const reduced = useReducedMotion();
  const support = useSupport();
  const memories = useTripMemories(tripId);
  const itemsQ = useTripChecklist(tripId);
  const expensesQ = useTripExpenses(tripId);
  const items = useMemo(() => itemsQ ?? [], [itemsQ]);
  const expenses = useMemo(() => expensesQ ?? [], [expensesQ]);
  const members = useTripMembers(tripId);
  const routes = useLiveQuery(
    () => db.routes.filter((r) => r.trip_id === tripId).toArray(),
    [tripId],
  );
  const tracksQ = useLiveQuery(
    () => db.trip_tracks.where('trip_id').equals(tripId).toArray(),
    [tripId],
  );
  const tracks = useMemo(() => tracksQ ?? [], [tracksQ]);
  const achievements =
    useLiveQuery(() => db.achievements.where('trip_id').equals(tripId).toArray(), [tripId]) ?? [];
  const photosQ = useLiveQuery(
    () =>
      db.attachments
        .where('trip_id')
        .equals(tripId)
        .filter((a) => a.kind === 'photo' && a.deleted_at === null && a.stop_id !== null)
        .toArray(),
    [tripId],
  );
  const photos = useMemo(() => photosQ ?? [], [photosQ]);
  const cachedIds = useLiveQuery(
    async () => new Set(await db.blobs.where('trip_id').equals(tripId).primaryKeys()),
    [tripId],
  );

  const dayData = useMemo<DayData[]>(
    () =>
      [...days]
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((day) => ({ day, stops: activeStops(stops.filter((s) => s.trip_day_id === day.id)) })),
    [days, stops],
  );
  useFillGaps(tripId, photosQ, dayData, routes, cachedIds);

  const car = useMemo(() => normalizeCar(trip), [trip]);
  const carHost = useRef<HTMLDivElement>(null);
  const carImage = useCarImage(carHost, `${car.model}:${car.color}:${car.accessories.join(',')}`);

  const numbers = useMemo(
    () => filmNumbers({ trip, days: dayData, routes: routes ?? [], expenses }),
    [trip, dayData, routes, expenses],
  );
  const spliced = useMemo(
    () =>
      spliceTrip(
        dayData.map((d) => ({
          ...d,
          route: (routes ?? []).find((r) => r.trip_day_id === d.day.id) ?? null,
          tracks: tracks.filter((t) => t.trip_day_id === d.day.id),
        })),
      ),
    [dayData, routes, tracks],
  );
  const place = useTripPlace(spliced.route);

  const stageRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(stageRef);
  const layout = useMemo<WorldLayout | null>(
    () =>
      size.width > 0 && size.height > 0 && spliced.stops.length > 0
        ? buildLayout({
            dayId: tripId,
            stops: spliced.stops,
            route: spliced.route,
            place,
            viewport: { width: size.width, height: size.height, hudTop: 90, hudBottom: 150 },
            zMax: Math.min(720, 170 * Math.max(1, dayData.length)),
          })
        : null,
    [tripId, spliced, place, size.width, size.height, dayData.length],
  );

  const nodePics = useMemo(
    () =>
      nodePhotos({
        stops: spliced.stops,
        memories,
        attachments: photos,
        available: cachedIds ?? new Set(),
      }),
    [spliced.stops, memories, photos, cachedIds],
  );
  const plan = useMemo<FilmPlan>(() => {
    const dayOf = (index: number) => {
      let d = 0;
      spliced.dayStarts.forEach((start, i) => {
        if (index >= start) d = i;
      });
      return d;
    };
    const nodes = (
      layout?.nodes ?? spliced.stops.map((st, i) => ({ stop_id: st.id, s: i, index: i }))
    ).map((n) => ({
      stop_id: n.stop_id,
      name: spliced.stops.find((st) => st.id === n.stop_id)?.name ?? '',
      day: dayOf(n.index),
      s: n.s,
    }));
    return planFilm({
      nodes,
      days: dayData.map((d, i) => ({ day: i, label: dayLabel(i + 1, d.day.date) })),
      photos: nodePics,
      quests: doneQuests(items),
    });
  }, [layout, spliced, dayData, nodePics, items]);

  const photoIds = useMemo(
    () => [
      ...new Set([
        ...plan.cues.flatMap((c) => (c.kind === 'photo' ? [c.attachment_id] : [])),
        ...nodePics.slice(0, 4).map((p) => p.attachment_id),
      ]),
    ],
    [plan, nodePics],
  );
  const bitmaps = useBitmaps(photoIds);
  const team = members
    .filter((m) => m.member.status === 'accepted')
    .map((m) => ({
      name: m.profile?.name ?? '…',
      color: PERSON_COLORS[asPersonColor(m.profile?.color ?? 'sunset')].hex,
    }));
  const badges = tripAchievements(achievements, tripId, isAchievementKey).map((k) => ({
    name: ACHIEVEMENTS[k].name,
    color: ACHIEVEMENTS[k].color,
  }));
  const texts = finalTexts(numbers);
  const art: FilmArt = {
    eyebrow: periodLong(trip.start_date, trip.end_date),
    name: trip.name,
    plan,
    texts,
    badges,
    team,
    photos: bitmaps,
    car: carImage,
  };

  const [failed, setFailed] = useState(false);
  const cardsOnly = flags.forceList || reduced || support === 'none' || failed;
  const [exportOpen, setExportOpen] = useState(false);
  const [handle, setHandle] = useState<FilmHandle | null>(null);

  return (
    <div className="-mx-4 -mt-3 grid gap-0" data-retro="ready">
      <div ref={carHost} className="hidden" aria-hidden="true">
        <CarSide car={car} />
      </div>
      <div
        ref={stageRef}
        className="relative isolate h-[calc(100svh-72px)] min-h-[560px] overflow-hidden bg-[#0d1220]"
      >
        {cardsOnly ? (
          <CardsDeck art={art} onExport={() => setExportOpen(true)} tripId={tripId} />
        ) : support === 'pending' || !layout || (spliced.route && !place) || !cachedIds ? (
          <p className="grid h-full place-items-center text-[15px] text-white/70" role="status">
            Montando o filme…
          </p>
        ) : (
          <FilmPlayer
            // uma rota que chegou depois (buscada ao abrir) refaz o filme com o caminho certo
            key={`${layout.pathLength.toFixed(1)}:${layout.nodes.length}:${size.width}x${size.height}`}
            art={art}
            layout={layout}
            car={car}
            forceWebGL={support !== 'webgpu'}
            tripId={tripId}
            onFail={() => setFailed(true)}
            onHandle={setHandle}
            onExport={() => setExportOpen(true)}
          />
        )}
      </div>
      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        art={art}
        film={cardsOnly ? null : handle}
        name={trip.name}
      />
    </div>
  );
}

/** O texto do card final para quem não vê o canvas (leitor de tela) e para os testes. */
function FinalText({ art }: { art: FilmArt }) {
  return (
    <div className="sr-only" data-final-card aria-live="polite">
      <p>O fim do filme</p>
      <ul>
        {art.texts.stats.map((s) => (
          <li key={s.label} data-stat={s.label}>
            {s.value} {s.label}
          </li>
        ))}
      </ul>
      {art.texts.budget ? <p data-budget>{art.texts.budget}</p> : null}
      {art.badges.length > 0 ? <p>Conquistas: {art.badges.map((b) => b.name).join(', ')}</p> : null}
      {art.team.length > 0 ? <p>Time: {art.team.map((m) => m.name).join(', ')}</p> : null}
    </div>
  );
}

/**
 * O desenho por cima do filme, num canvas 2D do tamanho da tela: o mesmo código do vídeo exportado.
 * Um laço próprio, só enquanto o relógio anda; a barra de tempo é atualizada aqui, fora do React.
 */
class OverlayLoop {
  private raf = 0;
  private art: FilmArt | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly clock: FilmClock;
  private readonly bar: HTMLElement | null;
  private readonly time: HTMLElement | null;

  constructor(
    canvas: HTMLCanvasElement,
    clock: FilmClock,
    bar: HTMLElement | null,
    time: HTMLElement | null,
  ) {
    this.canvas = canvas;
    this.clock = clock;
    this.bar = bar;
    this.time = time;
  }

  setArt(art: FilmArt): void {
    this.art = art;
    this.draw(performance.now());
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    const tick = (now: number) => {
      this.draw(now);
      if (this.clock.playing) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  draw(now: number): void {
    const art = this.art;
    const ctx = this.canvas.getContext('2d');
    if (!art || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h)
      Object.assign(this.canvas, { width: w, height: h });
    const t = this.clock.t(now);
    ctx.clearRect(0, 0, w, h);
    drawFilmOverlay(ctx, w, h, art, t, { background: false });
    if (this.bar) this.bar.style.width = `${(t / this.clock.duration) * 100}%`;
    if (this.time) this.time.textContent = `0:${String(Math.floor(t / 1000)).padStart(2, '0')}`;
  }
}

function FilmPlayer({
  art,
  layout,
  car,
  forceWebGL,
  tripId,
  onFail,
  onHandle,
  onExport,
}: {
  art: FilmArt;
  layout: WorldLayout;
  car: ReturnType<typeof normalizeCar>;
  forceWebGL: boolean;
  tripId: string;
  onFail: () => void;
  onHandle: (h: FilmHandle | null) => void;
  onExport: () => void;
}) {
  const [clock] = useState(() => new FilmClock(FILM_MS));
  const [phase, setPhase] = useState<'loading' | 'playing' | 'ended'>('loading');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [loop, setLoop] = useState<OverlayLoop | null>(null);
  const engineStop = useRef<(() => void) | null>(null);
  const [film, setFilm] = useState<FilmHandle | null>(null);
  const handleChange = useCallback(
    (h: FilmHandle | null) => {
      setFilm(h);
      onHandle(h);
    },
    [onHandle],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const l = new OverlayLoop(canvas, clock, barRef.current, timeRef.current);
    setLoop(l);
    return () => l.stop();
  }, [clock]);
  useEffect(() => {
    void loadFonts().then(() => loop?.setArt(art));
  }, [loop, art]);

  const stopEngine = () => {
    engineStop.current?.();
    engineStop.current = null;
  };
  const play = useCallback(() => {
    clock.play(performance.now(), 0);
    setPhase('playing');
    loop?.start();
    film?.wake();
    engineStop.current?.();
    engineStop.current = audio.engineStart();
  }, [clock, loop, film]);
  useEffect(() => () => engineStop.current?.(), []);

  const onFirstFrame = useCallback(() => {
    if (phase === 'loading') play();
  }, [phase, play]);
  const onEnd = useCallback(() => {
    engineStop.current?.();
    engineStop.current = null;
    audio.bell();
    setPhase('ended');
  }, []);
  const skip = () => {
    clock.hold(FILM_MS);
    stopEngine();
    loop?.draw(performance.now());
    film?.wake();
    setPhase('ended');
  };

  return (
    <div className="absolute inset-0" data-film={phase} data-film-mode="3d">
      <ThreeBoundary fallback={null} onError={onFail}>
        <Suspense fallback={null}>
          <FilmStage
            layout={layout}
            car={car}
            plan={art.plan}
            clock={clock}
            forceWebGL={forceWebGL}
            video={VIDEO}
            onHandle={handleChange}
            onFirstFrame={onFirstFrame}
            onEnd={onEnd}
            onFail={onFail}
          />
        </Suspense>
      </ThreeBoundary>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 size-full"
        aria-hidden="true"
      />
      <TopBar tripId={tripId} barRef={barRef} timeRef={timeRef} />
      {phase === 'loading' ? (
        <p
          className="absolute inset-0 grid place-items-center text-[15px] text-white/70"
          role="status"
        >
          Montando o filme…
        </p>
      ) : null}
      <div className="absolute inset-x-4 bottom-4 grid gap-2">
        {phase === 'playing' ? (
          <Button variant="secondary" size="md" className="justify-self-end" onClick={skip}>
            Pular
          </Button>
        ) : null}
        {phase === 'ended' ? <EndActions onExport={onExport} onReplay={play} /> : null}
      </div>
      {phase === 'ended' ? <FinalText art={art} /> : null}
    </div>
  );
}

function TopBar({
  tripId,
  barRef,
  timeRef,
}: {
  tripId: string;
  barRef?: RefObject<HTMLDivElement | null>;
  timeRef?: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="absolute inset-x-4 top-3 z-10 flex items-center gap-3 text-white">
      {timeRef ? (
        <span ref={timeRef} className="font-num text-[15px] tabular-nums">
          0:00
        </span>
      ) : null}
      {barRef ? (
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
          <div ref={barRef} className="h-full w-0 rounded-full bg-sunset" />
        </div>
      ) : (
        <div className="flex-1" />
      )}
      {timeRef ? <span className="font-num text-[15px] tabular-nums">0:15</span> : null}
      <Link
        to={`/viagens/${tripId}/detalhes`}
        className="grid size-12 place-items-center rounded-full bg-white/15"
        aria-label="Fechar a retrospectiva"
      >
        <X className="size-5" aria-hidden="true" />
      </Link>
    </div>
  );
}

function EndActions({ onExport, onReplay }: { onExport: () => void; onReplay?: () => void }) {
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" onClick={onExport}>
          <Clapperboard className="size-5" aria-hidden="true" />
          Vídeo · 15 s
        </Button>
        <Button variant="secondary" size="lg" onClick={onExport}>
          <Image className="size-5" aria-hidden="true" />
          Cards
        </Button>
      </div>
      {onReplay ? (
        <Button variant="ghost" size="md" className="text-white" onClick={onReplay}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Rever
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A sequência de cards no lugar do filme (reduzir movimento, sem WebGL, `?render=list`): abertura,
 * números, conquistas e fotos, um por vez, tocando à esquerda e à direita, como no style tile.
 */
function CardsDeck({
  art,
  onExport,
  tripId,
}: {
  art: FilmArt;
  onExport: () => void;
  tripId: string;
}) {
  const [index, setIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kind = CARD_KINDS[index] ?? 'abertura';
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { w, h } = CARD_SIZES.stories;
    void loadFonts().then(() => {
      Object.assign(canvas, { width: w, height: h });
      drawCard(ctx, w, h, kind, art);
    });
  }, [art, kind]);
  const last = index === CARD_KINDS.length - 1;
  return (
    <div className="absolute inset-0" data-film={last ? 'ended' : 'cards'} data-film-mode="cards">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 m-auto h-full max-w-full object-contain"
        role="img"
        aria-label={`Card: ${CARD_LABELS[kind]}`}
      />
      <TopBar tripId={tripId} />
      <button
        type="button"
        className="absolute inset-y-16 left-0 w-1/3"
        aria-label="Card anterior"
        disabled={index === 0}
        onClick={() => setIndex((i) => Math.max(0, i - 1))}
      >
        <ChevronLeft className="ml-2 size-7 text-white/60" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="absolute inset-y-16 right-0 grid w-1/3 justify-items-end"
        aria-label="Próximo card"
        disabled={last}
        onClick={() => setIndex((i) => Math.min(CARD_KINDS.length - 1, i + 1))}
      >
        <ChevronRight className="mr-2 size-7 text-white/60" aria-hidden="true" />
      </button>
      <div className="absolute inset-x-4 bottom-4">
        <EndActions onExport={onExport} />
      </div>
      <FinalText art={art} />
    </div>
  );
}
