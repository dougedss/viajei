import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

/**
 * O único `useFrame` de uma cena, para a ordem ser determinística: avança o que a cena tem de
 * avançar (`step` devolve se algo ainda se move), conta o quadro para a medição de fps e pede o
 * próximo quadro só enquanto há movimento. Parada, nenhum quadro (render sob demanda, D59).
 */
type Props = {
  /** avança a cena um quadro; `dt` em segundos, preso entre 1 e 50 ms */
  step: (now: number, dt: number) => boolean;
  onFrame?: (now: number, dt_ms: number, moving: boolean) => void;
  /** o primeiro quadro desenhado: a cortina sai e o tempo até ele fica medido */
  onFirstFrame?: () => void;
};

export function FrameDriver({ step, onFrame, onFirstFrame }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const first = useRef(true);
  useFrame((_, delta) => {
    const now = performance.now();
    if (first.current) {
      first.current = false;
      onFirstFrame?.();
    }
    const dt = Math.min(0.05, Math.max(0.001, delta));
    const busy = step(now, dt);
    onFrame?.(now, delta * 1000, busy);
    if (busy) invalidate();
  });
  return null;
}
