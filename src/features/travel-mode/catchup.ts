import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LngLat } from '@shared/geo.ts';
import type { TravelState, TripTrack } from '@/lib/db/schema.ts';
import { catchup, type CatchupResult } from '@/lib/geo/catchup.ts';
import type { Fix } from '@/lib/geo/geofence.ts';
import { eventsSince, snapshotTravelState, type TravelEvent } from './events.ts';
import type { DayState } from './rules.ts';
import { recordCatchupFix } from './track-recorder.ts';
import { loadTravelState, markEventsSeen, saveTravelState } from './travel-state.ts';

/**
 * O catch-up com efeitos: uma leitura de posição ao abrir o Modo Viagem e ao voltar do plano de
 * fundo (no máximo a cada 2 min), o `travel_state` salvo ao ir para o fundo, a cada 30 s visível e
 * ao sair da tela, e a lista de eventos desde a última vez. A regra é a de `lib/geo/catchup.ts`.
 */
export const CATCHUP_MIN_INTERVAL_MS = 2 * 60_000;
export const TRAVEL_STATE_SAVE_MS = 30_000;
export const POSITION_TIMEOUT_MS = 8_000;
export const POSITION_MAX_AGE_MS = 60_000;

/** `getCurrentPosition` sem alta precisão; `null` em qualquer falha (sem permissão, sem sinal, tempo). */
export function readPosition(): Promise<Fix | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      // a hora é a de quando a leitura chega ao app, como no acompanhamento (D176): um relógio só
      (pos) => resolve({ lng: pos.coords.longitude, lat: pos.coords.latitude, t: Date.now() }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS },
    );
  });
}

export type CatchupArgs = {
  tripId: string;
  dayId: string;
  uid: string;
  state: DayState;
  route: readonly LngLat[] | null;
  teamTracks: readonly Pick<TripTrack, 'user_id' | 'points'>[];
  /** a pessoa já permitiu usar a posição neste aparelho */
  geoAllowed: boolean;
  /** o dia é hoje e a viagem está acontecendo */
  active: boolean;
  /** a última leitura do acompanhamento com o mapa aberto, quando há */
  liveFix: Fix | null;
  /**
   * o acompanhamento está ligado: a leitura única é a primeira leitura dele depois de abrir (ou de
   * permitir, ou de voltar à tela), sem um `getCurrentPosition` à parte; só sem ele se lê uma vez
   */
  liveTracking: boolean;
};

export type Catchup = CatchupResult & {
  events: TravelEvent[];
  /** a posição deste aparelho agora: a do acompanhamento quando há, senão a leitura única */
  fix: Fix | null;
  /** a leitura única ao abrir (ou ao permitir, ou ao voltar à tela): é dela que vem o Chegamos! do catch-up */
  readFix: Fix | null;
  /** o estado anterior deste aparelho, para a fase 5 animar o replay */
  prev: TravelState | null;
  /** o estado anterior já foi lido (mesmo que não exista): a maquete pode decidir o replay */
  loaded: boolean;
  dismissEvents: () => Promise<void>;
  /** eventos produzidos por uma ação feita neste aparelho: não são "desde a última vez" */
  markSeen: (ids: readonly string[]) => void;
  run: () => void;
};

type Reading = { before: TravelState | null; read: Fix | null };

export function useCatchup(args: CatchupArgs): Catchup {
  const {
    tripId,
    dayId,
    uid,
    state,
    route,
    teamTracks,
    geoAllowed,
    active,
    liveFix,
    liveTracking,
  } = args;
  const [prev, setPrev] = useState<TravelState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);
  const [gpsFix, setGpsFix] = useState<Fix | null>(null);
  const lastRunRef = useRef(0);
  const seenRef = useRef(new Set<string>());
  const fix = liveFix && (!gpsFix || liveFix.t >= gpsFix.t) ? liveFix : gpsFix;
  // o que o `save` lê sem entrar nas dependências dele: com `fix` nelas, cada leitura do
  // acompanhamento refazia o efeito de montagem, que chama `run()`, que lia a posição de novo (uma
  // leitura única nova a cada leitura do GPS), e o Chegamos! do catch-up disparava sem os 3 min
  const latest = useRef({ state, route, fix });
  useEffect(() => {
    latest.current = { state, route, fix };
  }, [state, route, fix]);

  // a posição e as "passadas" pela leitura mais nova; o Chegamos! automático só pela leitura única
  // ao abrir: com o mapa aberto, quem decide a chegada é a presença de 3 min (`live-rules.ts`), e
  // cada leitura do acompanhamento não pode valer uma chegada (fase 14)
  const result = useMemo(() => {
    const now = catchup({
      stops: state.stops,
      at: state.at,
      next: state.next,
      route,
      fix,
      teamTracks,
    });
    if (fix === gpsFix) return now;
    const once = catchup({
      stops: state.stops,
      at: state.at,
      next: state.next,
      route,
      fix: gpsFix,
      teamTracks,
    });
    return { ...now, autoArrive: once.autoArrive };
  }, [state.stops, state.at, state.next, route, fix, gpsFix, teamTracks]);

  const events = useMemo(
    () => eventsSince(prev, state.stops, uid, result.passed),
    [prev, state.stops, uid, result.passed],
  );

  const save = useCallback(async () => {
    const { state: s, route: r, fix: f } = latest.current;
    // antes da primeira leitura, ou com as paradas ainda por carregar, o snapshot seria vazio e apagaria o anterior
    if (!loadedRef.current || s.stops.length === 0) return;
    const fraction =
      r && f
        ? (catchup({ stops: s.stops, at: s.at, next: s.next, route: r, fix: f, teamTracks: [] })
            .position?.fraction ?? null)
        : null;
    await saveTravelState(
      snapshotTravelState(dayId, tripId, s.stops, s.at, fraction, [...seenRef.current], new Date()),
    );
  }, [dayId, tripId]);

  /** Lê o estado anterior e, com permissão, a posição. Sem setState: quem chama aplica no `.then`. */
  const reading = useCallback(async (): Promise<Reading | null> => {
    const now = Date.now();
    if (now - lastRunRef.current < CATCHUP_MIN_INTERVAL_MS) return null;
    lastRunRef.current = now;
    const before = await loadTravelState(dayId);
    // com o acompanhamento ligado, a leitura única é a primeira leitura dele (o efeito abaixo): um
    // `getCurrentPosition` a mais, pedido logo depois do `watchPosition`, ficava à espera de uma
    // posição nova que uma posição parada não dá (o Chromium emulado do laboratório nunca a dá) e
    // vencia o tempo
    const read = active && geoAllowed && !liveTracking ? await readPosition() : null;
    if (read) void recordCatchupFix({ tripId, dayId, uid }, read);
    return { before, read };
  }, [dayId, tripId, uid, active, geoAllowed, liveTracking]);

  // a primeira leitura do acompanhamento depois da última leitura do estado vale como leitura única
  useEffect(() => {
    if (!liveFix || liveFix.t < lastRunRef.current) return;
    setGpsFix((g) => (g && g.t >= lastRunRef.current ? g : liveFix));
  }, [liveFix]);

  const apply = useCallback((r: Reading | null) => {
    if (!r) return;
    if (r.before) seenRef.current = new Set([...seenRef.current, ...r.before.seen_event_ids]);
    setPrev(r.before);
    setLoaded(true);
    loadedRef.current = true;
    if (r.read) setGpsFix(r.read);
  }, []);

  const run = useCallback(() => {
    lastRunRef.current = 0;
    void reading().then(apply);
  }, [reading, apply]);

  // ao abrir e ao voltar do plano de fundo; salva ao ir para o fundo, a cada 30 s visível e ao sair
  useEffect(() => {
    run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void reading().then(apply);
      else void save();
    };
    const onHide = () => void save();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void save();
    }, TRAVEL_STATE_SAVE_MS);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      clearInterval(timer);
      void save();
    };
  }, [run, reading, apply, save]);

  const markSeen = useCallback((ids: readonly string[]) => {
    for (const id of ids) seenRef.current.add(id);
    setPrev((p) => (p ? { ...p, seen_event_ids: [...new Set([...p.seen_event_ids, ...ids])] } : p));
  }, []);

  const dismissEvents = useCallback(async () => {
    const ids = events.map((e) => e.id);
    for (const id of ids) seenRef.current.add(id);
    await markEventsSeen(dayId, ids);
    setPrev((p) => (p ? { ...p, seen_event_ids: [...new Set([...p.seen_event_ids, ...ids])] } : p));
  }, [events, dayId]);

  return { ...result, events, fix, readFix: gpsFix, prev, loaded, dismissEvents, markSeen, run };
}
