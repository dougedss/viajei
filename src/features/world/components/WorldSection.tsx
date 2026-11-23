import { MapPinOff, RotateCcw, SkipForward } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router';
import { readPalette } from '@/art/palette.ts';
import { carOf } from '@/features/garage/rules.ts';
import { cityPlaceKey } from '@shared/landmark-keys.ts';
import { publishedRecipes, useLandmarkCatalog } from '@/features/landmarks/catalog.ts';
import { useLandmarkSync } from '@/features/landmarks/useLandmarkSync.ts';
import {
  legFractionOfDay,
  legPlan,
  legPosition,
  legToShow,
  type Leg,
  type LegName,
} from '@/features/travel-mode/legs.ts';
import { statusOf, type StopStatus } from '@/features/travel-mode/rules.ts';
import { audio, useSoundPref, writeSoundPref } from '@/lib/audio/index.ts';
import { db, type Stop, type TravelState } from '@/lib/db/schema.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { DiagChip } from '@/lib/three/DiagChip.tsx';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import type { Backend } from '@/lib/three/renderer.ts';
import { useQuality } from '@/lib/three/useQuality.ts';
import { useSupport } from '@/lib/three/useSupport.ts';
import { formatStamp } from '@/lib/time/index.ts';
import { pieceCamera, restCamera } from '../camera.ts';
import { placeCarOnLeg, type LegRelation } from '../car-position.ts';
import { convoyCarFor } from '../convoy.ts';
import { useElementSize } from '../hooks/useElementSize.ts';
import { usePlaces } from '../hooks/usePlace.ts';
import { buildLayout, type LayoutPlace, type WorldLayout } from '../layout.ts';
import { MotionController, type MotionEvent } from '../motion.ts';
import { OPENING_TIMELINE, OPENING_TOTAL_MS, openedKey, planOpening } from '../opening.ts';
import { HUD_TOP } from '../project.ts';
import { tierFor } from '../quality.ts';
import {
  dayEvents,
  PHOTO_CARD_MS,
  planLiveAdvance,
  planReplay,
  planReview,
  REVIEW_MIN_MS,
  type ReplayPlan,
} from '../replay.ts';
import { WorldRuntime, type CameraStatus, type Opening } from '../scene/runtime.ts';
import { WorldCanvas } from '../scene/WorldCanvas.tsx';
import { WorldScene } from '../scene/WorldScene.tsx';
import { ListView, NOW_BAR_INSET, type WorldSlotProps } from '../WorldSlot.tsx';
import { RAIN_LIKELY } from '@shared/weather.ts';
import { LegIndicator } from './LegIndicator.tsx';
import { WeatherChip } from './WeatherChip.tsx';
import { useWorldAnchor } from './anchor.ts';
import { WorldHud, type PhotoCard, type TeamChip } from './WorldHud.tsx';

/** Quanto dura o espiar de outro trecho sem um toque (fase 28): depois, a maquete volta ao da vez. */
export const PEEK_MS = 20_000;

/**
 * A maquete do dia na tela da viagem. Esta casca decide se há como desenhar (WebGPU, WebGL2 ou
 * nada), mede o espaço, lê o lugar da rota e constrói o layout; o palco (`WorldStage`) desenha,
 * anima e reage ao que acontece. Preenche a caixa inteira (fase 14); a "Lista do dia" entra no
 * lugar dela pela barra do topo e é o fallback de tudo. O layout não depende do palco (fase 22): a
 * câmera de repouso é quem enquadra o trecho inteiro no espaço que há, pela altura medida. Desde a
 * fase 28, **um trecho por vez, até o objetivo**: um layout por trecho, cada um com a rota cortada e a
 * leitura do lugar dele; a maquete mostra o da vez (ou o espiado, ou o que o "Rever o dia" toca), e
 * num dia de um trecho só é o dia inteiro, como antes.
 */
export default function WorldSection(props: WorldSlotProps) {
  const support = useSupport();
  const reducedMotion = useReducedMotion();
  const [observe, size] = useElementSize();
  const [failed, setFailed] = useState<string | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [camera, setCamera] = useState<CameraStatus>({ mode: 'repouso', settled: false });
  const { search } = useLocation();
  const flags = readUrlFlags(search);
  const diag = import.meta.env.DEV || flags.diag;
  const { onEventsOwner, state, route, day } = props;

  // o layout só muda quando muda o que o define; `dayState` devolve um array novo a cada render
  const stopsKey = state.stops
    .map((s) =>
      [
        s.id,
        s.kind,
        s.name,
        s.lat,
        s.lng,
        s.osm_type,
        s.osm_id,
        s.travel_minutes_to_next,
        s.objective,
      ].join('|'),
    )
    .join(';');
  // o dia em trechos (fase 28): a tela da viagem os manda prontos; sem eles, a mesma conta aqui
  const plan = useMemo(
    () => props.legPlan ?? legPlan(state.stops, route),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as paradas entram pela chave estável; a rota pelo hash
    [props.legPlan, stopsKey, route?.hash],
  );
  const readings = usePlaces(plan.geometry.map((g) => g.route));
  const geoKey = plan.geometry.map((g) => g.route?.hash ?? '-').join('|');
  const readingsKey = readings.map((r) => (r ? '1' : '0')).join('');
  const legsKey = plan.legs.map((l) => l.stops.map((st) => st.id).join(',')).join('/');

  const unavailable = support === 'none' || failed !== null;
  useEffect(() => {
    if (unavailable) onEventsOwner('card');
  }, [unavailable, onEventsOwner]);

  // o catálogo dos cartões-postais deste aparelho (fase 23): as receitas publicadas vão à cena, e as
  // cidades de passagem com peça ganham um piso no layout
  const catalog = useLandmarkCatalog();
  const recipes = useMemo(() => publishedRecipes(catalog), [catalog]);
  const cityKeys = useMemo(
    () =>
      [
        ...new Set(
          readings
            .flatMap((r) => r?.places ?? [])
            .flatMap((c) => {
              const key = cityPlaceKey(c.uf, c.name);
              return key && recipes.has(key) ? [key] : [];
            }),
        ),
      ]
        .sort()
        .join(','),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as leituras entram pelos hashes e por quais já chegaram
    [geoKey, readingsKey, recipes],
  );
  // um layout por trecho: as paradas do trecho, a rota cortada a ele e a leitura do lugar dele (num dia
  // de um trecho só, as paradas, a rota e a semente de sempre: o mesmo layout de antes)
  const layouts = useMemo<[WorldLayout, ...WorldLayout[]]>(
    () => {
      const cityPieces = new Set(cityKeys ? cityKeys.split(',') : []);
      const out = plan.legs.map((leg, i) =>
        buildLayout({
          dayId: i === 0 ? day.id : `${day.id}#${String(i)}`,
          stops: leg.stops,
          route: plan.geometry[i]?.route ?? null,
          place: readings[i] ?? null,
          cityPieces,
        }),
      );
      const [first, ...rest] = out;
      return first
        ? [first, ...rest]
        : [buildLayout({ dayId: day.id, stops: state.stops, route, place: null, cityPieces })];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as paradas entram pela chave estável; as rotas e as leituras pelos hashes
    [day.id, stopsKey, legsKey, geoKey, readingsKey, cityKeys],
  );

  // o trecho mostrado (fase 28): o da vez, o segurado pelo "Como foi?", o espiado ou o do "Rever o dia".
  // O espiar guarda o dia de quando começou: o próximo Partiu! ou Chegamos! (o dia andou) o encerra
  // sem efeito nenhum, e sozinho, sem um toque, ele acaba em 20 s
  const progressKey = state.stops
    .map((s) => `${s.id}:${s.done_at ?? ''}:${s.departed_at ?? ''}:${String(s.skipped)}`)
    .join(',');
  const [peeked, setPeeked] = useState<{ index: number; day: string; at: number } | null>(null);
  const peek = peeked !== null && peeked.day === progressKey ? peeked.index : null;
  const onPeek = useCallback(
    (index: number | null) =>
      setPeeked(index === null ? null : { index, day: progressKey, at: Date.now() }),
    [progressKey],
  );
  useEffect(() => {
    if (peeked === null) return;
    const t = setTimeout(() => setPeeked(null), PEEK_MS);
    return () => clearTimeout(t);
  }, [peeked]);
  const [reviewLeg, setReviewLeg] = useState<number | null>(null);
  const legCount = layouts.length;
  const shown = Math.min(
    legCount - 1,
    Math.max(
      0,
      reviewLeg ??
        legToShow({ legs: plan.legs, current: plan.current, hold: props.hold ?? null, peek }),
    ),
  );
  const layout = layouts[shown] ?? layouts[0];
  const relation: LegRelation =
    plan.legs.length <= 1 || shown === plan.current
      ? 'current'
      : shown < plan.current
        ? 'done'
        : 'ahead';

  // quantas peças de lugar a maquete montou (o e2e e o laboratório leem `data-world-landmarks`)
  const landmarkCount =
    layout.features.filter(
      (f) => f.kind === 'miniature' && f.place_key !== null && recipes.has(f.place_key),
    ).length +
    layout.places.filter((c) => c.piece !== null && c.key !== null && recipes.has(c.key)).length;
  // as cidades de passagem de todos os trechos, uma vez cada: o catálogo pede as da volta junto com as
  // da ida, para a peça estar no aparelho quando o trecho trocar (sem rede, inclusive)
  const cities = useMemo<LayoutPlace[]>(() => {
    const seen = new Set<string>();
    return layouts
      .flatMap((l) => l.places)
      .filter((c) => {
        const key = `${c.name}|${c.uf}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [layouts]);
  // cada trecho com rota tem a leitura dele: até chegarem todas, o roteiro não está pronto
  const placesRead = plan.geometry.every((g, i) => g.route === null || readings[i] !== null);
  // o pedido ao catálogo quando o roteiro do dia está pronto (as paradas, a rota e as cidades lidas)
  useLandmarkSync({
    tripId: props.trip.id,
    stops: state.stops,
    cities,
    ready: props.routeLoaded && props.routeStatus !== 'loading' && (route === null || placesRead),
  });

  if (unavailable) {
    return <ListView {...props} notice="Maquete indisponível neste aparelho." />;
  }

  // o carro na estrada, para os testes: o de quem olha (fase 16), o mesmo em qualquer viagem
  const shownCar = carOf(props.profiles.get(props.uid), props.trip.name);
  return (
    <div
      ref={observe}
      className="absolute inset-0 overflow-hidden bg-stage"
      data-world={backend ?? undefined}
      data-world-car={`${shownCar.model}:${shownCar.color}:${shownCar.finish}:${shownCar.wheels}`}
      data-world-camera={camera.mode}
      data-world-camera-settled={String(camera.settled)}
      data-world-landmarks={landmarkCount}
      data-world-leg={`${String(shown + 1)}/${String(legCount)}`}
    >
      {size.width > 0 && size.height > 0 && support !== 'pending' && catalog !== undefined ? (
        <WorldStage
          {...props}
          layout={layout}
          size={size}
          placesRead={placesRead}
          dayLegs={plan.legs}
          names={plan.names}
          shown={shown}
          current={plan.current}
          relation={relation}
          carPosition={
            relation === 'current' ? legPosition(props.catchup.position, plan, shown) : null
          }
          carPrev={
            props.catchup.prev
              ? {
                  ...props.catchup.prev,
                  fraction: legFractionOfDay(props.catchup.prev.fraction, plan, shown),
                }
              : null
          }
          reviewLeg={reviewLeg}
          onPeek={onPeek}
          onReviewLeg={setReviewLeg}
          catalog={recipes}
          reducedMotion={reducedMotion}
          support={support}
          diag={diag}
          nightByUrl={flags.night}
          pieceByUrl={flags.piece}
          onBackend={setBackend}
          onFail={setFailed}
          onCamera={setCamera}
        />
      ) : (
        <p className="grid h-full place-items-center mv-text-14 text-ink-2" role="status">
          Montando a maquete…
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ o palco
type Phase = 'idle' | 'opening' | 'replay' | 'live' | 'review';

type StageProps = WorldSlotProps & {
  /** o layout do trecho mostrado */
  layout: WorldLayout;
  size: { width: number; height: number };
  /** as leituras do lugar de todos os trechos com rota já chegaram (o replay espera por elas) */
  placesRead: boolean;
  /** os trechos do dia, os nomes deles, o mostrado e o da vez (fase 28) */
  dayLegs: readonly Leg[];
  names: readonly LegName[];
  shown: number;
  current: number;
  relation: LegRelation;
  /** a posição na fração do trecho mostrado, quando ele é o da vez (num dia de um trecho, a do dia) */
  carPosition: WorldSlotProps['catchup']['position'];
  /** o estado anterior deste aparelho com a fração no trecho mostrado (o replay ao abrir) */
  carPrev: TravelState | null;
  /** o trecho que o "Rever o dia" está tocando, ou null */
  reviewLeg: number | null;
  onPeek: (index: number | null) => void;
  onReviewLeg: (index: number | null) => void;
  reducedMotion: boolean;
  support: Backend;
  diag: boolean;
  /** `?noite=1`: a noite a qualquer hora, sem gravar nada (o e2e e o laboratório) */
  nightByUrl: boolean;
  /** as receitas publicadas dos cartões-postais, pela chave do lugar (fase 23) */
  catalog: ReadonlyMap<string, unknown>;
  /** `?peca=1`: a câmera de repouso vira um close no primeiro cartão-postal (a captura do laboratório) */
  pieceByUrl: boolean;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
  onCamera: (status: CameraStatus) => void;
};

/** Quanto o chip do clima fica grande depois de o carro estacionar, antes de subir para a faixa. */
const WEATHER_HOLD_MS = 1_200;
/**
 * O desfoque da borda de baixo (a maquete de mesa, fase 22): a faixa acima do que está sobre o pé do
 * palco, em px, com uma máscara que só chega ao desfoque cheio no terço de baixo dela. Só embaixo: o
 * alto da maquete é o fim do dia (a última peça, o carro ao chegar) e fica nítido; o laboratório
 * mostrou a faixa de cima borrando os dois.
 */
const BLUR_BOTTOM = { height: 110, px: 2.4 } as const;

function formatDistance(m: number): string {
  if (m >= 10_000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Os eventos das paradas que são nós do layout (fase 28: as do trecho mostrado). */
function ofLayout<T extends { stop_id: string }>(events: readonly T[], layout: WorldLayout): T[] {
  const nodes = new Set(layout.nodes.map((n) => n.stop_id));
  return events.filter((e) => nodes.has(e.stop_id));
}

function WorldStage(p: StageProps) {
  const { layout, state, catchup, uid, reducedMotion, onEventsOwner } = p;
  // os trechos (fase 28), com nomes próprios: `p.current` se lê como um ref para o lint dos hooks
  const { reviewLeg, current: currentLeg, dayLegs, onReviewLeg } = p;
  const quality = useQuality(tierFor);
  const soundPref = useSoundPref();
  const palette = useMemo(() => readPalette(), []);
  // o carro é de quem olha, e o de cada pessoa do comboio é o dela (fase 16): os perfis do time
  // chegam pelo pull da viagem, e funcionam sem sinal (D113)
  const me = p.profiles.get(uid);
  const car = useMemo(() => carOf(me, p.trip.name), [me, p.trip.name]);
  const carFor = useMemo(() => convoyCarFor(p.profiles), [p.profiles]);
  // o quadro de repouso: o dia inteiro entre a faixa de cima e o que está sobre o pé do palco, pela
  // altura medida (a barra do "Agora" quando ela ainda não foi medida)
  const rest = useMemo(() => {
    const whole = restCamera(layout, {
      width: p.size.width,
      height: p.size.height,
      hudTop: HUD_TOP,
      hudBottom: Math.max(NOW_BAR_INSET, p.bottomInset),
    });
    if (!p.pieceByUrl) return whole;
    // o close no primeiro cartão-postal (fase 23), só pela chave da URL
    const piece = layout.features.find(
      (f): f is Extract<typeof f, { kind: 'miniature' }> =>
        f.kind === 'miniature' && f.place_key !== null && p.catalog.has(f.place_key),
    );
    return piece ? pieceCamera(layout, piece) : whole;
  }, [layout, p.size.width, p.size.height, p.bottomInset, p.pieceByUrl, p.catalog]);
  const [motion] = useState(() => new MotionController(layout.nodes[0]?.s ?? 0, reducedMotion));
  const [runtime] = useState(() => new WorldRuntime(layout, motion, p.night, rest));
  const [backend, setBackend] = useState<Backend | null>(null);
  const [forceWebGL, setForceWebGL] = useState(p.support === 'webgl2');
  const [nightOverride, setNightOverride] = useState<boolean | null>(() =>
    p.nightByUrl ? true : null,
  );
  const [phase, setPhase] = useState<Phase>('idle');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [pops, setPops] = useState<Record<string, number>>({});
  const [teamChips, setTeamChips] = useState<Record<string, TeamChip>>({});
  const [photoCards, setPhotoCards] = useState<Record<string, PhotoCard>>({});
  const [caption, setCaption] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(0);
  const [diving, setDiving] = useState(false);
  const [opening, setOpening] = useState<Opening | null>(null);
  // o chip do clima grande, sobre a origem: entra com o carro na abertura e sobe para a faixa de cima
  // um pouco depois de ela acabar
  const [weatherBig, setWeatherBig] = useState(false);
  const [decidedAt, setDecidedAt] = useState(0);
  const decided = useRef(false);
  const shown = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const night = nightOverride ?? p.night;
  // o carro no trecho mostrado (fase 28): no da vez, pela posição na fração do trecho; num trecho feito,
  // no objetivo; num que ainda vem, de onde ele sai
  const placeHere = (lay: WorldLayout) =>
    placeCarOnLeg({ state, position: p.carPosition, layout: lay, relation: p.relation });
  const placement = placeHere(layout);
  const stops = new Map<string, Stop>(state.stops.map((s) => [s.id, s]));
  // o layout de que o palco já cuidou e o trecho dele: um layout novo é outro trecho (a troca, com a
  // abertura) ou o mesmo trecho refeito (a rota, a leitura do lugar ou uma parada que mudou)
  const legKey = (() => {
    const leg = p.dayLegs[p.shown];
    return leg ? `${leg.from.id}>${leg.to.id}` : '';
  })();
  const handled = useRef({ layout, legKey });
  /**
   * O "Rever o dia" de um trecho (fase 28), no layout dele: do começo ao fim no trecho feito, até o carro
   * no da vez; os eventos das paradas do trecho (o objetivo de onde ele sai já apareceu no anterior). O
   * dia inteiro dura o mesmo que antes: o tempo de cada trecho é o de um dia dividido pelos que tocam.
   */
  const reviewOf = (lay: WorldLayout, index: number): ReplayPlan | null => {
    const leg = p.dayLegs[index];
    if (!leg) return null;
    const only = new Set(leg.stops.filter((_, k) => index === 0 || k > 0).map((st) => st.id));
    const end =
      index === p.current
        ? placeCarOnLeg({ state, position: p.carPosition, layout: lay, relation: 'current' }).s
        : (lay.nodes.at(-1)?.s ?? lay.pathLength);
    const plan = planReview(
      lay,
      state.stops,
      uid,
      end,
      reducedMotion ? [] : (p.reviewPhotos ?? []),
      only,
    );
    if (!plan) return null;
    const played = Math.max(1, Math.min(p.current, p.dayLegs.length - 1) + 1);
    return { ...plan, duration_ms: Math.max(REVIEW_MIN_MS, Math.round(plan.duration_ms / played)) };
  };
  // o palco em px, para o HUD projetar pelo enquadramento atual
  useEffect(() => {
    runtime.setViewport(p.size);
  }, [runtime, p.size]);
  // o repouso novo (o palco ou a altura medida mudaram): só a câmera se move, o layout fica
  useLayoutEffect(() => {
    runtime.setRest(rest);
    runtime.invalidate();
  }, [runtime, rest]);
  // o modo da câmera e se a imagem já chegou lá, para o palco (`data-world-camera` e
  // `data-world-camera-settled`): eventos discretos do runtime
  const { onCamera } = p;
  useEffect(() => runtime.onCamera(onCamera), [runtime, onCamera]);
  // o chip do clima grande, preso à origem na abertura
  const firstNode = layout.nodes[0]?.position ?? null;
  const weatherAnchor = useWorldAnchor(runtime, firstNode, 3);

  const statusKey = state.stops
    .map((s) => `${s.id}:${hidden.has(s.id) ? 'pending' : statusOf(s, state)}`)
    .join(',');
  const statuses = useMemo(() => {
    const out: Record<string, StopStatus> = {};
    for (const part of statusKey.split(',')) {
      const i = part.lastIndexOf(':');
      if (i > 0) out[part.slice(0, i)] = part.slice(i + 1) as StopStatus;
    }
    return out;
  }, [statusKey]);

  // as paradas em que a chance de chuva no horário passa de 50%: a pílula ganha a nuvem de chuva
  const forecasts = p.weather?.stops;
  const rainKey = state.stops
    .filter((s) => {
      const f = forecasts && Object.hasOwn(forecasts, s.id) ? forecasts[s.id] : undefined;
      return (f?.rain ?? 0) > RAIN_LIKELY;
    })
    .map((s) => s.id)
    .join(',');
  const rainy = useMemo(() => new Set(rainKey === '' ? [] : rainKey.split(',')), [rainKey]);

  const later = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(
    () => () => {
      for (const id of timers.current) clearTimeout(id);
      audio.engineStop();
    },
    [],
  );

  useEffect(() => {
    motion.setReducedMotion(reducedMotion);
  }, [motion, reducedMotion]);
  useEffect(() => {
    runtime.setNight(night);
    runtime.invalidate();
  }, [runtime, night]);
  const offRouteM = placement.offRoute?.distance_m ?? null;
  useEffect(() => {
    runtime.setOffRoute(offRouteM === null ? null : { distance_m: offRouteM });
    runtime.invalidate();
  }, [runtime, offRouteM]);

  // a decisão de abertura: uma vez por dia e aparelho, antes do replay
  const ready =
    catchup.loaded &&
    p.routeLoaded &&
    p.routeStatus !== 'loading' &&
    (p.route === null || p.placesRead);
  useEffect(() => {
    if (decided.current || !ready) return;
    decided.current = true;
    let cancelled = false;
    let settled = false;
    void db.sync_state.get(openedKey(p.day.id)).then((row) => {
      settled = true;
      if (cancelled) return;
      const now = performance.now();
      const current = placeHere(layout).s;
      // o replay fica no trecho mostrado: a fração anterior no trecho, e as deixas das paradas dele (o
      // resto sai pelo "dismiss" do fim do replay, como sempre)
      const plan = planReplay({
        prev: p.carPrev,
        current_s: current,
        events: ofLayout(catchup.events, layout),
        layout,
        reducedMotion,
      });
      for (const e of catchup.events) shown.current.add(e.id);
      if (import.meta.env.DEV)
        console.debug(
          'viajei:decisão',
          JSON.stringify({
            opened: !!row,
            prevAt: catchup.prev?.at?.slice(0, 8) ?? null,
            prevFraction: catchup.prev?.fraction ?? null,
            current: Math.round(current),
            events: catchup.events.map((e) => e.kind),
            plan: plan && {
              from: Math.round(plan.from_s),
              to: Math.round(plan.to_s),
              ms: plan.duration_ms,
              cues: plan.cues.length,
            },
          }),
        );
      const target = plan ? plan.from_s : current;
      if (!row && !reducedMotion) {
        const op = planOpening(layout, false);
        const started: Opening = { plan: op, startedAt: now };
        runtime.setOpening(started);
        setOpening(started);
        setWeatherBig(true);
        later(OPENING_TOTAL_MS + WEATHER_HOLD_MS, () => setWeatherBig(false));
        motion.jumpTo(op.enter_s);
        const [carFrom, carTo] = OPENING_TIMELINE.car;
        motion.enqueue(
          {
            kind: 'opening',
            from_s: op.enter_s,
            to_s: target,
            duration_ms: carTo - carFrom,
            delay_ms: carFrom,
            cues: [],
            plan: null,
          },
          now,
        );
      } else {
        motion.jumpTo(target);
      }
      if (!row) {
        void db.sync_state.put({ key: openedKey(p.day.id), value: new Date().toISOString() });
      }
      if (plan) motion.enqueue(motion.fromPlan(plan), now);
      onEventsOwner(reducedMotion ? 'card' : 'world');
      setDecidedAt(now);
      runtime.invalidate();
    });
    return () => {
      cancelled = true;
      // o StrictMode desmonta e remonta antes da leitura voltar: a decisão fica para a montagem de verdade
      if (!settled) decided.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decide uma vez, com o que houver quando ficar pronto
  }, [ready]);

  // avanço ao vivo: a posição mudou (painel, GPS, sync) ou chegaram eventos novos
  useEffect(() => {
    // com um movimento na fila (o replay recém-decidido, por exemplo), espera ele acabar
    if (!decidedAt || phase !== 'idle' || motion.busy) return;
    const target = placement.s;
    const unseen = catchup.events.filter((e) => !shown.current.has(e.id));
    if (Math.abs(motion.s - target) < 0.01 && unseen.length === 0) return;
    for (const e of unseen) shown.current.add(e.id);
    // as deixas são das paradas do trecho mostrado; as de outro trecho só contam como vistas
    const fresh = ofLayout(unseen, layout);
    const elsewhere = unseen.filter((e) => !fresh.includes(e));
    if (elsewhere.length > 0) catchup.markSeen(elsewhere.map((e) => e.id));
    const live = placement.source === 'gps';
    const plan = live
      ? planLiveAdvance(motion.s, target, [], layout, { duration_ms: 1000 })
      : planLiveAdvance(motion.s, target, fresh, layout);
    if (!plan || reducedMotion) {
      motion.jumpTo(target);
      if (fresh.length > 0) catchup.markSeen(fresh.map((e) => e.id));
      runtime.invalidate();
      return;
    }
    motion.enqueue(motion.fromPlan(plan, 'live'), performance.now());
    runtime.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage à posição, à fase e aos eventos; o resto é estável
  }, [decidedAt, phase, placement.s, placement.source, catchup.events]);

  const onMotionEvents = useCallback(
    (events: MotionEvent[]) => {
      const now = performance.now();
      for (const e of events) {
        if (e.type === 'start') {
          const kind = e.move.kind;
          if (import.meta.env.DEV)
            console.debug(
              'viajei:movimento',
              kind,
              Math.round(e.move.from_s),
              Math.round(e.move.to_s),
              e.move.plan?.mode ?? null,
              e.move.cues.length,
            );
          if (kind === 'replay' || kind === 'review' || kind === 'live') {
            setHidden(
              new Set(e.move.cues.flatMap((c) => (c.kind === 'event' ? [c.event.stop_id] : []))),
            );
            if (kind !== 'live') audio.engineStart();
          }
          setPhase(kind === 'smooth' ? 'live' : kind);
        } else if (e.type === 'cue') {
          if (e.cue.kind === 'event') {
            const ev = e.cue.event;
            setHidden((h) => {
              if (!h.has(ev.stop_id)) return h;
              const next = new Set(h);
              next.delete(ev.stop_id);
              return next;
            });
            setPops((prev) => ({ ...prev, [ev.stop_id]: now }));
            const byOther = ev.by !== null && ev.by !== uid;
            if (ev.kind === 'team_arrived' || (byOther && ev.kind === 'arrived')) {
              const name = (ev.by ? p.profiles.get(ev.by)?.name : undefined) ?? 'Alguém do time';
              const time = ev.at ? formatStamp(ev.at) : null;
              setTeamChips((c) => ({ ...c, [ev.stop_id]: { name, time } }));
              later(4000, () => setTeamChips((c) => withoutKey(c, ev.stop_id)));
            }
          } else if (e.cue.kind === 'photo') {
            // o cartão de foto sobre a pílula, só com o arquivo já no aparelho; nada sob reduzir movimento
            if (!reducedMotion) {
              const cue = e.cue;
              const color = p.profiles.get(cue.created_by)?.color ?? 'sunset';
              setPhotoCards((c) => ({
                ...c,
                [cue.stop_id]: {
                  attachment_id: cue.attachment_id,
                  color,
                  extra: cue.extra,
                  at: now,
                },
              }));
              later(PHOTO_CARD_MS, () =>
                setPhotoCards((c) => (c[cue.stop_id]?.at === now ? withoutKey(c, cue.stop_id) : c)),
              );
            }
          } else {
            const text = e.cue.caption;
            setCaption(text);
            if (!reducedMotion) setDiving(true);
            later(e.cue.duration_ms + 150, () => {
              setCaption((c) => (c === text ? null : c));
              setDiving(false);
            });
          }
        } else {
          const kind = e.move.kind;
          if (kind === 'opening') {
            runtime.setOpening(null);
            setOpening(null);
          }
          if (kind === 'replay' || kind === 'review') audio.engineStop();
          // o "Rever o dia" de vários trechos (fase 28): ao fim de um, o seguinte, até o da vez; o
          // "Pular" (ou um layout novo no meio) encerra a sequência
          if (kind === 'review' && reviewLeg !== null) {
            const next = reviewLeg + 1;
            onReviewLeg(!e.skipped && next <= currentLeg && next < dayLegs.length ? next : null);
          }
          if (kind === 'replay') {
            void catchup.dismissEvents();
            const extra = e.move.plan?.overflow ?? 0;
            if (extra > 0) {
              setOverflow(extra);
              later(3500, () => setOverflow(0));
            }
          }
          if (kind === 'live' && e.move.plan) catchup.markSeen(e.move.plan.event_ids);
          setHidden(new Set());
          setPhase('idle');
        }
      }
    },
    [
      uid,
      p.profiles,
      catchup,
      later,
      reducedMotion,
      runtime,
      reviewLeg,
      currentLeg,
      dayLegs.length,
      onReviewLeg,
    ],
  );

  // o layout vivo no runtime (a cena já o pôs ao renderizar). O mesmo trecho refeito corta o movimento e
  // recoloca o carro; outro trecho (fase 28: a troca no Chegamos! do objetivo, o espiar, o "Rever o dia")
  // se constrói como a abertura do dia, no repouso dele, com o carro entrando do toco; com reduzir
  // movimento, de uma vez
  const onLayout = useEffectEvent((swapped: boolean) => {
    runtime.setLayout(layout);
    if (!decided.current) return;
    const now = performance.now();
    // o que estava na fila era do layout de antes (as posições `s` são dele)
    motion.clear();
    onMotionEvents(motion.skip(now));
    const reviewing = p.reviewLeg !== null;
    const first = layout.nodes[0]?.s ?? 0;
    const target = reviewing ? first : placeHere(layout).s;
    if (swapped && !reducedMotion) {
      const op = planOpening(layout, false);
      const started: Opening = { plan: op, startedAt: now };
      runtime.setOpening(started);
      setOpening(started);
      motion.jumpTo(op.enter_s);
      const [carFrom, carTo] = OPENING_TIMELINE.car;
      motion.enqueue(
        {
          kind: 'opening',
          from_s: op.enter_s,
          to_s: target,
          duration_ms: carTo - carFrom,
          delay_ms: carFrom,
          cues: [],
          plan: null,
        },
        now,
      );
    } else {
      motion.jumpTo(target);
    }
    if (p.reviewLeg !== null) {
      const plan = reviewOf(layout, p.reviewLeg);
      if (plan) motion.enqueue(motion.fromPlan(plan, 'review'), now);
      else p.onReviewLeg(null);
    }
  });
  useLayoutEffect(() => {
    if (handled.current.layout !== layout) {
      const swapped = handled.current.legKey !== legKey;
      handled.current = { layout, legKey };
      onLayout(swapped);
    }
    runtime.invalidate();
  }, [runtime, layout, legKey]);

  const multi = p.dayLegs.length > 1;
  const reviewing = p.reviewLeg !== null;
  const skippable = phase === 'replay' || phase === 'review' || reviewing;
  const skip = () => {
    // no "Rever o dia" de vários trechos, o "Pular" encerra a sequência inteira
    if (reviewing) motion.clear();
    onMotionEvents(motion.skip(performance.now()));
    if (reviewing) p.onReviewLeg(null);
    runtime.invalidate();
  };
  // num dia de um trecho, o "Rever o dia" de sempre; num dia de trechos, a sequência, a partir do 1º
  const reviewPlan =
    phase === 'idle' && !multi
      ? planReview(
          layout,
          state.stops,
          uid,
          placement.s,
          reducedMotion ? [] : (p.reviewPhotos ?? []),
        )
      : null;
  const canReview = multi
    ? phase === 'idle' &&
      !reviewing &&
      (p.current > 0 ||
        dayEvents(state.stops, uid).length > 0 ||
        (p.relation === 'current' && placement.s > (layout.nodes[0]?.s ?? 0) + 1e-6))
    : reviewPlan !== null;
  const startReview = () => {
    if (multi) {
      p.onPeek(null);
      if (p.shown === 0) {
        // o primeiro trecho já está na tela: o plano entra na fila sem troca de layout
        const plan = reviewOf(layout, 0);
        if (plan) {
          p.onReviewLeg(0);
          motion.enqueue(motion.fromPlan(plan, 'review'), performance.now());
        } else if (p.current > 0) {
          p.onReviewLeg(1);
        }
      } else {
        p.onReviewLeg(0);
      }
      runtime.invalidate();
      return;
    }
    if (!reviewPlan) return;
    motion.enqueue(motion.fromPlan(reviewPlan, 'review'), performance.now());
    runtime.invalidate();
  };

  const [firstFrame, setFirstFrame] = useState(false);
  const [mountedAt] = useState(() => performance.now());
  const onFirstFrame = useCallback(() => {
    setFirstFrame(true);
    if (import.meta.env.DEV) {
      console.info(
        `viajei: maquete no primeiro quadro em ${Math.round(performance.now() - mountedAt)} ms`,
      );
    }
  }, [mountedAt]);

  const { onBackend: reportBackend } = p;
  const onBackend = useCallback(
    (b: Backend) => {
      setBackend(b);
      reportBackend(b);
    },
    [reportBackend],
  );
  const leaveClose = useCallback(() => runtime.leaveClose(), [runtime]);

  // o desfoque das bordas de cima e de baixo (a maquete de mesa): só em Alta, por CSS, sem
  // pós-processamento; fica entre o canvas e o HUD, então as pílulas continuam nítidas
  const blur = quality.tier.level === 'alta';
  const bottomInset = Math.max(NOW_BAR_INSET, p.bottomInset);

  return (
    <>
      <WorldCanvas
        key={String(forceWebGL)}
        runtime={runtime}
        tier={quality.tier}
        forceWebGL={forceWebGL}
        onBackend={onBackend}
        onFail={p.onFail}
        onPointerMissed={leaveClose}
      >
        <WorldScene
          runtime={runtime}
          layout={layout}
          palette={palette}
          tier={quality.tier}
          statuses={statuses}
          pops={pops}
          car={car}
          onMotionEvents={onMotionEvents}
          onFrame={quality.onFrame}
          onFirstFrame={onFirstFrame}
          onTapStop={p.onOpenStop}
          convoy={p.relation === 'current' ? p.convoy : undefined}
          carFor={carFor}
          catalog={p.catalog}
        />
      </WorldCanvas>
      {blur && firstFrame ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0"
            data-world-blur="bottom"
            style={{
              bottom: bottomInset,
              height: BLUR_BOTTOM.height,
              backdropFilter: `blur(${String(BLUR_BOTTOM.px)}px)`,
              WebkitBackdropFilter: `blur(${String(BLUR_BOTTOM.px)}px)`,
              maskImage: 'linear-gradient(transparent 0%, #000 65%, #000 100%)',
              WebkitMaskImage: 'linear-gradient(transparent 0%, #000 65%, #000 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 90% at 50% 45%, transparent 55%, rgb(6 9 16 / 0.45) 100%)',
            }}
          />
        </>
      ) : null}
      {!firstFrame ? (
        <p
          className="pointer-events-none absolute inset-0 grid place-items-center bg-stage mv-text-14 text-ink-2"
          role="status"
        >
          Montando a maquete…
        </p>
      ) : null}
      <WorldHud
        runtime={runtime}
        nodes={layout.nodes}
        places={layout.places}
        stops={stops}
        statuses={statuses}
        pops={pops}
        teamChips={teamChips}
        photoCards={photoCards}
        hidePills={diving}
        caption={caption}
        opening={opening}
        reducedMotion={reducedMotion}
        rainy={rainy}
        onOpenStop={p.onOpenStop}
        bottomInset={p.bottomInset}
      />
      {weatherBig ? (
        <div
          ref={weatherAnchor}
          className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
          hidden
        >
          <WeatherChip
            summary={p.weather?.summary ?? null}
            size="big"
            reducedMotion={reducedMotion}
          />
        </div>
      ) : null}
      {/* a faixa de cima: clima, diagnóstico, fora da rota e "+N paradas" à esquerda; "Rever o dia"
          ou o "Pular" do replay à direita (a barra do "Agora" ocupa o pé da maquete, fase 14) */}
      <div className="pointer-events-none absolute inset-x-3 top-2 flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-start gap-2">
          {/* os trechos do dia (fase 28): "ida · volta", ou o número de cada um; um toque espia */}
          <LegIndicator
            names={p.names}
            shown={p.shown}
            current={p.current}
            done={p.dayLegs.map((l) => l.to.done_at !== null || l.to.skipped)}
            disabled={reviewing}
            onPick={(i) => p.onPeek(i === p.current ? null : i)}
          />
          {offRouteM !== null ? (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-late px-3 mv-text-13 font-semibold text-white">
              <MapPinOff className="size-4" aria-hidden="true" />
              Fora da rota · {formatDistance(offRouteM)}
            </span>
          ) : null}
          {overflow > 0 ? (
            <span className="inline-flex min-h-8 items-center rounded-full bg-hud px-3 mv-text-13 font-semibold text-hud-ink">
              +{overflow} {overflow === 1 ? 'parada' : 'paradas'}
            </span>
          ) : null}
          {!weatherBig ? (
            <WeatherChip
              summary={p.weather?.summary ?? null}
              size="small"
              reducedMotion={reducedMotion}
            />
          ) : null}
          {p.diag ? (
            <DiagChip
              fps={quality.fps}
              backend={backend}
              prefs={quality.prefs}
              onCycle={quality.cycle}
              night={{ on: night, toggle: () => setNightOverride((v) => !(v ?? p.night)) }}
              forceWebGL={forceWebGL}
              onToggleWebGL={() => setForceWebGL((v) => !v)}
              sound={soundPref}
              onToggleSound={() => writeSoundPref(!soundPref)}
            />
          ) : null}
        </div>
        {skippable ? (
          <button
            type="button"
            onClick={skip}
            className="pointer-events-auto inline-flex min-h-12 items-center gap-1.5 rounded-full bg-hud px-4 mv-text-15 font-semibold text-hud-ink backdrop-blur-sm"
          >
            Pular
            <SkipForward className="size-4" aria-hidden="true" />
          </button>
        ) : canReview ? (
          <button
            type="button"
            onClick={startReview}
            className="pointer-events-auto inline-flex min-h-12 items-center gap-1.5 rounded-full bg-hud px-3 mv-text-13 font-semibold text-hud-ink backdrop-blur-sm"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Rever o dia
          </button>
        ) : null}
      </div>
    </>
  );
}
