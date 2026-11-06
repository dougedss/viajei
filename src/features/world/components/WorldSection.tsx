import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { readPalette } from '@/art/palette.ts';
import { normalizeCar } from '@/features/garage/rules.ts';
import { statusOf, type StopStatus } from '@/features/travel-mode/rules.ts';
import { audio, useSoundPref, writeSoundPref } from '@/lib/audio/index.ts';
import { db, type Stop } from '@/lib/db/schema.ts';
import type { PlaceReading } from '@/lib/geo/index.ts';
import { useReducedMotion } from '@/lib/reduced-motion.ts';
import { DiagChip } from '@/lib/three/DiagChip.tsx';
import { readUrlFlags } from '@/lib/three/prefs.ts';
import type { Backend } from '@/lib/three/renderer.ts';
import { useQuality } from '@/lib/three/useQuality.ts';
import { useSupport } from '@/lib/three/useSupport.ts';
import { formatStamp } from '@/lib/time/index.ts';
import { placeCar } from '../car-position.ts';
import { useElementSize } from '../hooks/useElementSize.ts';
import { usePlace } from '../hooks/usePlace.ts';
import { buildLayout, type WorldLayout } from '../layout.ts';
import { MotionController, type MotionEvent } from '../motion.ts';
import { OPENING_TIMELINE, openedKey, planOpening } from '../opening.ts';
import { writeRenderPref } from '../prefs.ts';
import { tierFor } from '../quality.ts';
import { projectNodes } from '../project.ts';
import { PHOTO_CARD_MS, planLiveAdvance, planReplay, planReview } from '../replay.ts';
import { WorldRuntime, type Opening } from '../scene/runtime.ts';
import { WorldCanvas } from '../scene/WorldCanvas.tsx';
import { WorldScene } from '../scene/WorldScene.tsx';
import { ListView, type WorldSlotProps } from '../WorldSlot.tsx';
import { DayList } from './DayList.tsx';
import { HUD_BOTTOM, HUD_TOP, WorldHud, type PhotoCard, type TeamChip } from './WorldHud.tsx';

/**
 * A maquete do dia no Modo Viagem. Esta casca decide se há como desenhar (WebGPU, WebGL2 ou nada),
 * mede o espaço, lê o lugar da rota e constrói o layout; o palco (`WorldStage`) desenha, anima e
 * reage ao que acontece. A "Lista do dia" fica logo abaixo, recolhida, e é o fallback de tudo.
 */
export default function WorldSection(props: WorldSlotProps) {
  const support = useSupport();
  const reducedMotion = useReducedMotion();
  const place = usePlace(props.route);
  const hostRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(hostRef);
  const [failed, setFailed] = useState<string | null>(null);
  const [backend, setBackend] = useState<Backend | null>(null);
  const { search } = useLocation();
  const diag = import.meta.env.DEV || readUrlFlags(search).diag;
  const { onEventsOwner, state, route, day } = props;

  const unavailable = support === 'none' || failed !== null;
  useEffect(() => {
    if (unavailable) onEventsOwner('card');
  }, [unavailable, onEventsOwner]);

  // o layout só muda quando muda o que o define; `dayState` devolve um array novo a cada render
  const stopsKey = state.stops
    .map((s) => [s.id, s.kind, s.name, s.lat, s.lng, s.travel_minutes_to_next].join('|'))
    .join(';');
  const layout = useMemo<WorldLayout | null>(
    () =>
      size.width > 0 && size.height > 0
        ? buildLayout({
            dayId: day.id,
            stops: state.stops,
            route,
            place,
            viewport: {
              width: size.width,
              height: size.height,
              hudTop: HUD_TOP,
              hudBottom: HUD_BOTTOM,
            },
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as paradas entram pela chave estável; a rota pelo hash
    [day.id, stopsKey, route?.hash, place, size.width, size.height],
  );

  if (unavailable) {
    return <ListView {...props} notice="Maquete indisponível neste aparelho." action={null} />;
  }

  return (
    <div className="grid gap-3">
      <div
        ref={hostRef}
        className="relative h-[clamp(380px,58svh,620px)] overflow-hidden rounded-card bg-stage shadow-card"
        data-world={backend ?? undefined}
      >
        {layout && support !== 'pending' ? (
          <WorldStage
            {...props}
            layout={layout}
            size={size}
            place={place}
            reducedMotion={reducedMotion}
            support={support}
            diag={diag}
            onBackend={setBackend}
            onFail={setFailed}
          />
        ) : (
          <p className="grid h-full place-items-center text-[14px] text-ink-2" role="status">
            Montando a maquete…
          </p>
        )}
      </div>
      <DayList
        state={state}
        legs={props.legs}
        profiles={props.profiles}
        route={route}
        defaultOpen={false}
        stopExtras={props.stopExtras}
        footer={
          <Button variant="ghost" size="sm" onClick={() => writeRenderPref('list')}>
            Ver como lista
          </Button>
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ o palco
type Phase = 'idle' | 'opening' | 'replay' | 'live' | 'review';

type StageProps = WorldSlotProps & {
  layout: WorldLayout;
  size: { width: number; height: number };
  place: PlaceReading | null;
  reducedMotion: boolean;
  support: Backend;
  diag: boolean;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
};

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function WorldStage(p: StageProps) {
  const { layout, state, catchup, panelOn, uid, reducedMotion, onEventsOwner } = p;
  const quality = useQuality(tierFor);
  const soundPref = useSoundPref();
  const palette = useMemo(() => readPalette(), []);
  const car = useMemo(() => normalizeCar(p.trip), [p.trip]);
  const [motion] = useState(() => new MotionController(layout.nodes[0]?.s ?? 0, reducedMotion));
  const [runtime] = useState(() => new WorldRuntime(layout, motion, p.night));
  const [backend, setBackend] = useState<Backend | null>(null);
  const [forceWebGL, setForceWebGL] = useState(p.support === 'webgl2');
  const [nightOverride, setNightOverride] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [pops, setPops] = useState<Record<string, number>>({});
  const [teamChips, setTeamChips] = useState<Record<string, TeamChip>>({});
  const [photoCards, setPhotoCards] = useState<Record<string, PhotoCard>>({});
  const [caption, setCaption] = useState<string | null>(null);
  const [overflow, setOverflow] = useState(0);
  const [diving, setDiving] = useState(false);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [decidedAt, setDecidedAt] = useState(0);
  const decided = useRef(false);
  const shown = useRef(new Set<string>());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const night = nightOverride ?? p.night;
  const placement = placeCar({ state, position: catchup.position, panelOn, layout });
  const stops = new Map<string, Stop>(state.stops.map((s) => [s.id, s]));
  const nodes = useMemo(() => projectNodes(layout, p.size), [layout, p.size]);

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

  // o layout vivo no runtime; um layout novo com movimento em curso corta o movimento e recoloca o carro
  useLayoutEffect(() => {
    if (runtime.layout !== layout) {
      runtime.setLayout(layout);
      if (decided.current) {
        motion.skip(performance.now());
        motion.jumpTo(placeCar({ state, position: catchup.position, panelOn, layout }).s);
      }
    }
    runtime.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recoloca o carro só quando o layout muda
  }, [runtime, layout, motion]);

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
    (p.route === null || p.place !== null);
  useEffect(() => {
    if (decided.current || !ready) return;
    decided.current = true;
    let cancelled = false;
    let settled = false;
    void db.sync_state.get(openedKey(p.day.id)).then((row) => {
      settled = true;
      if (cancelled) return;
      const now = performance.now();
      const current = placeCar({ state, position: catchup.position, panelOn, layout }).s;
      const plan = planReplay({
        prev: catchup.prev,
        current_s: current,
        events: catchup.events,
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
    const fresh = catchup.events.filter((e) => !shown.current.has(e.id));
    if (Math.abs(motion.s - target) < 0.01 && fresh.length === 0) return;
    for (const e of fresh) shown.current.add(e.id);
    const live = placement.source === 'panel' || placement.source === 'gps';
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
    [uid, p.profiles, catchup, later, reducedMotion, runtime],
  );

  const skippable = phase === 'replay' || phase === 'review';
  const skip = () => {
    onMotionEvents(motion.skip(performance.now()));
    runtime.invalidate();
  };
  const reviewPlan =
    phase === 'idle'
      ? planReview(
          layout,
          state.stops,
          uid,
          placement.s,
          reducedMotion ? [] : (p.reviewPhotos ?? []),
        )
      : null;
  const startReview = () => {
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

  return (
    <>
      <WorldCanvas
        key={String(forceWebGL)}
        runtime={runtime}
        tier={quality.tier}
        forceWebGL={forceWebGL}
        onBackend={onBackend}
        onFail={p.onFail}
      >
        <WorldScene
          runtime={runtime}
          palette={palette}
          tier={quality.tier}
          statuses={statuses}
          pops={pops}
          car={car}
          onMotionEvents={onMotionEvents}
          onFrame={quality.onFrame}
          onFirstFrame={onFirstFrame}
        />
      </WorldCanvas>
      {!firstFrame ? (
        <p
          className="pointer-events-none absolute inset-0 grid place-items-center bg-stage text-[14px] text-ink-2"
          role="status"
        >
          Montando a maquete…
        </p>
      ) : null}
      <WorldHud
        nodes={nodes}
        stops={stops}
        statuses={statuses}
        pops={pops}
        teamChips={teamChips}
        photoCards={photoCards}
        hidePills={diving}
        caption={caption}
        offRouteM={offRouteM}
        overflow={overflow}
        skippable={skippable}
        onSkip={skip}
        opening={opening}
        reducedMotion={reducedMotion}
      />
      <div className="pointer-events-none absolute inset-x-3 top-2 flex items-start justify-between gap-2">
        <div>
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
        {reviewPlan && !skippable ? (
          <button
            type="button"
            onClick={startReview}
            className="pointer-events-auto inline-flex min-h-9 items-center gap-1.5 rounded-full bg-hud px-3 text-[13px] font-semibold text-hud-ink backdrop-blur-sm"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Rever o dia
          </button>
        ) : null}
      </div>
    </>
  );
}
