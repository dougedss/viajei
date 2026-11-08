import { useEffect, useRef, useState } from 'react';
import type { Fix } from '@/lib/geo/geofence.ts';
import { isWithin } from '@/lib/geo/geofence.ts';
import { liveDecision, LOW_POWER_INTERVAL_MS, pushFix, STATIONARY_RADIUS_M } from './live-rules.ts';
import type { DayState } from './rules.ts';
import { createTrackRecorder, type TrackContext } from './track-recorder.ts';

/**
 * O acompanhamento da posição enquanto o mapa está na tela (fase 14): `watchPosition` de alta
 * precisão movendo o carrinho, Partiu! e Chegamos! automáticos por presença (as regras puras de
 * `live-rules.ts`, D47) e a trilha gravada. Parado por 10 min, troca para leituras de baixa precisão
 * a cada 60 s; movimento volta ao normal. Liga e desliga com `enabled` (a tela visível, o dia de
 * hoje, a viagem em andamento, a posição permitida: `liveEnabled`). A tela acesa é outro assunto
 * (`useWakeLock`): sem ela, o sistema apaga a tela e corta o GPS, e está tudo bem.
 */
const AUTO_REPEAT_GUARD_MS = 10 * 60_000;

export type LiveArgs = {
  enabled: boolean;
  ctx: TrackContext | null;
  state: DayState;
  onAutoDepart: () => void;
  onAutoArrive: () => void;
};

export type Live = {
  /** acompanhando agora */
  tracking: boolean;
  supported: boolean;
  lowPower: boolean;
  fix: Fix | null;
  /** o navegador negou a posição: a frase diz isso uma vez, sem insistir */
  denied: boolean;
};

export function useLivePosition({
  enabled,
  ctx,
  state,
  onAutoDepart,
  onAutoArrive,
}: LiveArgs): Live {
  const [lowPower, setLowPower] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [denied, setDenied] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const latest = useRef({ state, onAutoDepart, onAutoArrive });
  useEffect(() => {
    latest.current = { state, onAutoDepart, onAutoArrive };
  }, [state, onAutoDepart, onAutoArrive]);

  const running = enabled && supported && ctx !== null;

  useEffect(() => {
    if (!enabled || !supported || ctx === null) return;
    const recorder = createTrackRecorder(ctx);
    let fixes: Fix[] = [];
    let watchId: number | null = null;
    let lowTimer: ReturnType<typeof setInterval> | null = null;
    let anchor: Fix | null = null;
    let lastAuto: { key: string; t: number } | null = null;
    let stopped = false;

    const fire = (key: string, t: number, action: () => void) => {
      if (lastAuto?.key === key && t - lastAuto.t < AUTO_REPEAT_GUARD_MS) return;
      lastAuto = { key, t };
      action();
    };

    const handle = (pos: GeolocationPosition) => {
      if (stopped) return;
      // a hora é a de quando a leitura chegou, não o carimbo do aparelho: o relógio do app é um só
      // (e o de mentira dos testes vale aqui também)
      const f: Fix = { lng: pos.coords.longitude, lat: pos.coords.latitude, t: Date.now() };
      fixes = pushFix(fixes, f);
      setFix(f);
      setDenied(false);
      recorder.push(f);
      const { state: s, onAutoDepart: dep, onAutoArrive: arr } = latest.current;
      const decision = liveDecision(fixes, s, f.t);
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
      if (err.code === err.PERMISSION_DENIED) setDenied(true);
      console.warn('viajei: posição', err.message);
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

    startWatch();

    return () => {
      stopped = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (lowTimer !== null) clearInterval(lowTimer);
      void recorder.flush();
      setLowPower(false);
    };
  }, [enabled, supported, ctx]);

  return {
    tracking: running && !denied,
    supported,
    lowPower: running && lowPower,
    fix: running ? fix : null,
    denied,
  };
}
