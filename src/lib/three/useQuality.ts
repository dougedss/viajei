import { useCallback, useMemo, useRef, useState } from 'react';
import { useQualityPrefs, writeQualityPrefs } from './prefs.ts';
import {
  cycleMode,
  downgrade,
  effectiveLevel,
  emptyStats,
  medianFps,
  pushFrame,
  shouldDowngrade,
  WARMUP_MS,
  type FrameStats,
  type QualityLevel,
  type QualityPrefs,
  type Tier,
} from './quality.ts';

/**
 * O nível de qualidade em uso e a medição de fps que o rebaixa. `onFrame` é chamado pela cena a
 * cada quadro desenhado, dizendo se havia movimento: só quadros em movimento contam. O fps
 * mostrado no chip atualiza no máximo uma vez por segundo, para não redesenhar o HUD a cada quadro.
 * Cada cena diz como monta o próprio `Tier` a partir do nível (a maquete acrescenta o cenário).
 */
export type Quality<T extends Tier> = {
  prefs: QualityPrefs;
  tier: T;
  /** mediana recente em movimento; null parado */
  fps: number | null;
  cycle: () => void;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
};

export type TierMaker<T extends Tier> = (level: QualityLevel, devicePixelRatio: number) => T;

export function useQuality<T extends Tier>(makeTier: TierMaker<T>): Quality<T> {
  const prefs = useQualityPrefs();
  const [fps, setFps] = useState<number | null>(null);
  const stats = useRef<FrameStats>(emptyStats());
  const lastShown = useRef(0);
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
  const tier = useMemo(() => makeTier(effectiveLevel(prefs), dpr), [makeTier, prefs, dpr]);

  const firstAt = useRef<number | null>(null);
  const onFrame = useCallback(
    (now: number, dt_ms: number, moving: boolean) => {
      firstAt.current ??= now;
      if (now - firstAt.current < WARMUP_MS) return;
      if (!moving) {
        if (stats.current.frames.length > 0) {
          stats.current = emptyStats();
          setFps(null);
        }
        return;
      }
      stats.current = pushFrame(stats.current, now, dt_ms);
      if (now - lastShown.current >= 1000) {
        lastShown.current = now;
        setFps(medianFps(stats.current));
      }
      if (shouldDowngrade(stats.current, now)) {
        const next = downgrade(prefs);
        if (next !== prefs) {
          writeQualityPrefs(next);
          stats.current = emptyStats();
        }
      }
    },
    [prefs],
  );

  const cycle = useCallback(() => {
    writeQualityPrefs({ ...prefs, mode: cycleMode(prefs.mode) });
    stats.current = emptyStats();
  }, [prefs]);

  return { prefs, tier, fps, cycle, onFrame };
}
