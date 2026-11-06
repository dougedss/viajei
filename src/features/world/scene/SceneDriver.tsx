import { useCallback } from 'react';
import { FrameDriver } from '@/lib/three/FrameDriver.tsx';
import type { MotionEvent } from '../motion.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O passo da maquete no laço único (`FrameDriver`): avança o controlador de movimento, roda os
 * atualizadores dos objetos, entrega os eventos discretos ao React e diz se algo ainda se move.
 * Parado, nenhum quadro.
 */
type Props = {
  runtime: WorldRuntime;
  onMotionEvents: (events: MotionEvent[]) => void;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
  /** o primeiro quadro desenhado: a cortina sai e o tempo até ele fica medido */
  onFirstFrame: () => void;
};

export function SceneDriver({ runtime, onMotionEvents, onFrame, onFirstFrame }: Props) {
  const step = useCallback(
    (now: number, dt: number) => {
      const events = runtime.motion.step(now);
      runtime.beginFrame();
      runtime.runUpdaters({ now, dt });
      const busy = runtime.busy(now);
      if (events.length > 0) onMotionEvents(events);
      return busy;
    },
    [runtime, onMotionEvents],
  );
  return <FrameDriver step={step} onFrame={onFrame} onFirstFrame={onFirstFrame} />;
}
