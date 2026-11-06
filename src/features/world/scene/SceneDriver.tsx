import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { MotionEvent } from '../motion.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O único `useFrame` da cena, para a ordem ser determinística: avança o controlador de movimento,
 * entrega os eventos discretos ao React, roda os atualizadores dos objetos e pede o próximo quadro
 * só enquanto algo se move. Parado, nenhum quadro.
 */
type Props = {
  runtime: WorldRuntime;
  onMotionEvents: (events: MotionEvent[]) => void;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
  /** o primeiro quadro desenhado: a cortina sai e o tempo até ele fica medido */
  onFirstFrame: () => void;
};

export function SceneDriver({ runtime, onMotionEvents, onFrame, onFirstFrame }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const first = useRef(true);
  useFrame((_, delta) => {
    const now = performance.now();
    if (first.current) {
      first.current = false;
      onFirstFrame();
    }
    const dt = Math.min(0.05, Math.max(0.001, delta));
    const events = runtime.motion.step(now);
    runtime.beginFrame();
    runtime.runUpdaters({ now, dt });
    const busy = runtime.busy(now);
    onFrame(now, delta * 1000, busy);
    if (events.length > 0) onMotionEvents(events);
    if (busy) invalidate();
  });
  return null;
}
