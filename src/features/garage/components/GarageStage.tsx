import { useCallback, useEffect, useRef, useState } from 'react';
import type { RootState } from '@react-three/fiber';
import type { CarSpec } from '@/art/cars/types.ts';
import { audio, useSoundPref, writeSoundPref } from '@/lib/audio/index.ts';
import { DiagChip } from '@/lib/three/DiagChip.tsx';
import { tierFor } from '@/lib/three/quality.ts';
import type { Backend } from '@/lib/three/renderer.ts';
import { ThreeCanvas, type ThreeCamera } from '@/lib/three/ThreeCanvas.tsx';
import { useQuality } from '@/lib/three/useQuality.ts';
import { GARAGE_FOV, GarageRuntime } from '../scene/runtime.ts';
import { Showroom } from '../scene/Showroom.tsx';

/**
 * O palco 3D da garagem, num chunk próprio (o three já está em cache desde a maquete): o Canvas
 * comum, o estúdio, o gesto do disco no dedo e o chip de diagnóstico. Recebe o carro a mostrar (o
 * da viagem ou a prévia) e anima as trocas; quem decide o que mostrar e o que gravar é a página.
 */
export type GarageStageProps = {
  car: CarSpec;
  reducedMotion: boolean;
  support: Backend;
  diag: boolean;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
  /** o acessório pedido assentou */
  onSeat: () => void;
  /**
   * O cartão de desbloqueio (fase 9): o palco monta já com `car` (o acessório ou o modelo novo), para
   * a compilação dos shaders cair na abertura, e no primeiro quadro volta para `reveal` sem animação;
   * em seguida anima até `car`. Assim o encaixe nunca engasga com um material novo.
   */
  reveal?: CarSpec;
  /** o palco já mostra `reveal` e vai animar (o cartão tira a cortina) */
  onReady?: () => void;
};

/** quanto o palco espera, depois de voltar ao carro de antes, para animar o desbloqueio */
const REVEAL_DELAY_MS = 650;

const CAMERA: ThreeCamera = { fov: GARAGE_FOV, near: 0.1, far: 140, position: [8, 3, 8] };

function visible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

export default function GarageStage(p: GarageStageProps) {
  const { car, reducedMotion, onSeat } = p;
  const quality = useQuality(tierFor);
  const soundPref = useSoundPref();
  const [runtime] = useState(
    () => new GarageRuntime(car, performance.now(), { reduced: reducedMotion, hidden: !visible() }),
  );
  const [forceWebGL, setForceWebGL] = useState(p.support === 'webgl2');
  const [backend, setBackend] = useState<Backend | null>(null);
  const [mountedAt] = useState(() => performance.now());
  // o primeiro quadro desenhado: até ele, a compilação dos shaders pode segurar a tela
  const [drawn, setDrawn] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  // o carro a mostrar: o da viagem ou a prévia; a troca anima (sem movimento reduzido)
  const { reveal, onReady } = p;
  const revealing = reveal !== undefined;
  useEffect(() => {
    if (revealing) return;
    runtime.show(car, {
      animate: !reducedMotion,
      onSeat,
      onSwap: () => {
        const stop = audio.engineStart();
        setTimeout(stop, 900);
      },
    });
  }, [runtime, car, reducedMotion, onSeat, revealing]);

  // o desbloqueio: no primeiro quadro, o carro de antes; depois, o encaixe ou a troca animada
  useEffect(() => {
    if (!drawn || !reveal) return;
    runtime.show(reveal, { animate: false });
    onReady?.();
    const t = setTimeout(() => {
      runtime.show(car, {
        animate: !reducedMotion,
        onSeat,
        onSwap: () => {
          const stop = audio.engineStart();
          setTimeout(stop, 900);
        },
      });
    }, REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [drawn, reveal, runtime, car, reducedMotion, onSeat, onReady]);

  // o giro sozinho para com a aba escondida e sob reduzir movimento
  useEffect(() => {
    const update = () => runtime.setEnv({ reduced: reducedMotion, hidden: !visible() });
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, [runtime, reducedMotion]);

  // a roda do mouse aproxima sem rolar a página (o listener do React é passivo)
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      runtime.wheel(e.deltaY, performance.now());
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [runtime]);

  const onCreated = useCallback(
    (state: RootState) => runtime.bindInvalidate(state.invalidate),
    [runtime],
  );
  const { onBackend: report } = p;
  const onBackend = useCallback(
    (b: Backend) => {
      setBackend(b);
      report(b);
    },
    [report],
  );
  const onFirstFrame = useCallback(() => {
    setDrawn(true);
    if (import.meta.env.DEV) {
      console.info(
        `viajei: garagem no primeiro quadro em ${Math.round(performance.now() - mountedAt)} ms`,
      );
    }
  }, [mountedAt]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 touch-none select-none"
      data-frame={drawn ? 'ready' : 'pending'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        runtime.pointerDown(e.pointerId, e.clientX, e.clientY, performance.now());
      }}
      onPointerMove={(e) =>
        runtime.pointerMove(e.pointerId, e.clientX, e.clientY, performance.now())
      }
      onPointerUp={(e) => runtime.pointerUp(e.pointerId, performance.now())}
      onPointerCancel={(e) => runtime.pointerUp(e.pointerId, performance.now())}
    >
      <ThreeCanvas
        key={String(forceWebGL)}
        tier={quality.tier}
        forceWebGL={forceWebGL}
        camera={CAMERA}
        onCreated={onCreated}
        onBackend={onBackend}
        onFail={p.onFail}
      >
        <Showroom
          runtime={runtime}
          tier={quality.tier}
          onFrame={quality.onFrame}
          onFirstFrame={onFirstFrame}
        />
      </ThreeCanvas>
      {p.diag ? (
        // o palco captura o ponteiro: sem isto, o toque no chip viraria arrasto do disco
        <div
          className="pointer-events-none absolute bottom-2 left-2 z-10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <DiagChip
            fps={quality.fps}
            backend={backend}
            prefs={quality.prefs}
            onCycle={quality.cycle}
            forceWebGL={forceWebGL}
            onToggleWebGL={() => setForceWebGL((v) => !v)}
            sound={soundPref}
            onToggleSound={() => writeSoundPref(!soundPref)}
          />
        </div>
      ) : null}
    </div>
  );
}
