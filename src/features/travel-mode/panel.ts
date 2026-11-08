import { useEffect, useRef, useState } from 'react';
import type { Fix } from '@/lib/geo/geofence.ts';
import {
  LOW_POWER_INTERVAL_MS,
  panelDecision,
  pushFix,
  STATIONARY_RADIUS_M,
} from './panel-rules.ts';
import type { DayState } from './rules.ts';
import { createTrackRecorder, type TrackContext } from './track-recorder.ts';
import { isWithin } from '@/lib/geo/geofence.ts';

/**
 * Modo painel: para quem deixa o celular no suporte. Ligado: tela acesa (Wake Lock, repedido ao
 * voltar à aba), GPS contínuo de alta precisão movendo o carrinho, Partiu! e Chegamos! automáticos
 * por presença (as regras puras de panel-rules.ts) e a trilha gravada. Parado por 10 min, troca para
 * leituras de baixa precisão a cada 60 s; movimento volta ao normal. Desligado, nada disso roda.
 */
const AUTO_REPEAT_GUARD_MS = 10 * 60_000;

export type PanelArgs = {
  /** o botão do topo está ligado */
  on: boolean;
  /** o dia é hoje e a viagem está acontecendo */
  enabled: boolean;
  ctx: TrackContext | null;
  state: DayState;
  onAutoDepart: () => void;
  onAutoArrive: () => void;
};

export type Panel = {
  /** ligado e rodando (o dia é hoje e a viagem está acontecendo) */
  on: boolean;
  supported: boolean;
  lowPower: boolean;
  fix: Fix | null;
};

// a lib do TS declara wakeLock como obrigatório; nem todo navegador o tem
type WakeLockNavigator = Partial<Pick<Navigator, 'wakeLock'>>;

export function usePanelMode({
  on,
  enabled,
  ctx,
  state,
  onAutoDepart,
  onAutoArrive,
}: PanelArgs): Panel {
  const [lowPower, setLowPower] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const latest = useRef({ state, onAutoDepart, onAutoArrive });
  useEffect(() => {
    latest.current = { state, onAutoDepart, onAutoArrive };
  }, [state, onAutoDepart, onAutoArrive]);

  // ligado só enquanto o dia é hoje e a viagem está acontecendo; fora disso, nada roda
  const running = on && enabled;

  useEffect(() => {
    if (!running || !ctx || !supported) return;
    const recorder = createTrackRecorder(ctx);
    let fixes: Fix[] = [];
    let watchId: number | null = null;
    let lowTimer: ReturnType<typeof setInterval> | null = null;
    let anchor: Fix | null = null;
    let lastAuto: { key: string; t: number } | null = null;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const requestLock = async () => {
      const nav: WakeLockNavigator = navigator;
      if (!nav.wakeLock) return;
      try {
        lock = await nav.wakeLock.request('screen');
      } catch {
        /* sem Wake Lock (bateria baixa, aba oculta): o GPS continua */
      }
    };

    const fire = (key: string, t: number, action: () => void) => {
      if (lastAuto?.key === key && t - lastAuto.t < AUTO_REPEAT_GUARD_MS) return;
      lastAuto = { key, t };
      action();
    };

    const handle = (pos: GeolocationPosition) => {
      if (stopped) return;
      const f: Fix = { lng: pos.coords.longitude, lat: pos.coords.latitude, t: pos.timestamp };
      fixes = pushFix(fixes, f);
      setFix(f);
      recorder.push(f);
      const { state: s, onAutoDepart: dep, onAutoArrive: arr } = latest.current;
      const decision = panelDecision(fixes, s, f.t);
      if (decision.autoDepart) {
        const from = s.at && !s.onRoad ? s.at : s.next;
        fire(`depart:${from?.id ?? ''}`, f.t, dep);
      } else if (decision.autoArrive && s.next) {
        fire(`arrive:${s.next.id}`, f.t, arr);
      }
      if (decision.lowPower && lowTimer === null) enterLowPower(f);
      else if (
        !decision.lowPower &&
        lowTimer !== null &&
        anchor &&
        !isWithin(f, anchor, STATIONARY_RADIUS_M)
      ) {
        leaveLowPower();
      }
    };
    const onError = (err: GeolocationPositionError) => {
      console.warn('viajei: GPS do painel', err.message);
    };
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(handle, onError, {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 20_000,
      });
    };
    const enterLowPower = (at: Fix) => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      anchor = at;
      setLowPower(true);
      lowTimer = setInterval(() => {
        navigator.geolocation.getCurrentPosition(handle, onError, {
          enableHighAccuracy: false,
          maximumAge: 30_000,
          timeout: 20_000,
        });
      }, LOW_POWER_INTERVAL_MS);
    };
    const leaveLowPower = () => {
      if (lowTimer !== null) clearInterval(lowTimer);
      lowTimer = null;
      anchor = null;
      setLowPower(false);
      startWatch();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requestLock();
    };

    void requestLock();
    document.addEventListener('visibilitychange', onVisible);
    startWatch();

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (lowTimer !== null) clearInterval(lowTimer);
      void lock?.release();
      void recorder.flush();
      setLowPower(false);
    };
  }, [running, ctx, supported]);

  return { on: running, supported, lowPower, fix: running ? fix : null };
}
