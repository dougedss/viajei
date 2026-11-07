import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RenderTarget,
  RGBAFormat,
  UnsignedByteType,
  type PerspectiveCamera,
  type WebGPURenderer,
} from 'three/webgpu';
import { readPalette } from '@/art/palette.ts';
import type { CarSpec } from '@/art/cars/types.ts';
import type { StopStatus } from '@/features/travel-mode/rules.ts';
import type { WorldLayout } from '@/features/world/layout.ts';
import { cameraPosition } from '@/features/world/math.ts';
import { MotionController } from '@/features/world/motion.ts';
import { tierFor } from '@/features/world/quality.ts';
import { WorldCanvas } from '@/features/world/scene/WorldCanvas.tsx';
import { WorldRuntime } from '@/features/world/scene/runtime.ts';
import { WorldScene } from '@/features/world/scene/WorldScene.tsx';
import { FrameDriver } from '@/lib/three/FrameDriver.tsx';
import { backendOf, type Backend } from '@/lib/three/renderer.ts';
import { useQuality } from '@/lib/three/useQuality.ts';
import { filmCamera, type FilmClock } from '../film.ts';
import { sAt, type FilmPlan } from '../rules.ts';

/**
 * O palco 3D do filme, num chunk próprio (o three já está em cache desde a maquete): o cenário da
 * maquete com a rota da viagem inteira, o carro da viagem e a câmera do filme, que segue o relógio.
 * Também desenha os quadros da exportação: no tamanho do vídeo, fora da tela (`setOutputRenderTarget`,
 * com o mesmo tone mapping e espaço de cor da tela), lidos de volta da GPU — igual em WebGPU e WebGL2.
 */
export type FilmHandle = {
  /** desenha o instante `t` do filme em 1080 × 1920 e devolve os pixels, na ordem de cima para baixo */
  renderFrame: (t: number) => Promise<ImageData>;
  /** pede quadros de novo (o relógio voltou a andar, ou parou noutro instante) */
  wake: () => void;
  backend: Backend;
};

export type FilmStageProps = {
  layout: WorldLayout;
  car: CarSpec;
  plan: FilmPlan;
  clock: FilmClock;
  forceWebGL: boolean;
  video: { width: number; height: number };
  onHandle: (handle: FilmHandle | null) => void;
  onFirstFrame: () => void;
  onEnd: () => void;
  onFail: (reason: string) => void;
};

/** Põe o carro e a câmera no instante `t` do filme (função de módulo: o three é mutado aqui, fora do React). */
function poseFilm(
  camera: PerspectiveCamera,
  runtime: WorldRuntime,
  plan: FilmPlan,
  t: number,
  aspect?: number,
): void {
  runtime.motion.jumpTo(sAt(plan, t));
  const frame = filmCamera(runtime.layout, plan, t);
  runtime.setCameraDistance(frame.distance);
  const eye = cameraPosition(frame);
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.lookAt(frame.target[0], frame.target[1], frame.target[2]);
  Object.assign(camera, { fov: frame.fov, ...(aspect ? { aspect } : {}) });
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

export default function FilmStage(p: FilmStageProps) {
  const quality = useQuality(tierFor);
  const palette = useMemo(() => readPalette(), []);
  const [motion] = useState(() => new MotionController(p.plan.flight.from_s, false));
  const [runtime] = useState(() => new WorldRuntime(p.layout, motion, false));
  const statuses = useMemo(
    () => Object.fromEntries(p.layout.nodes.map((n): [string, StopStatus] => [n.stop_id, 'done'])),
    [p.layout],
  );
  const noEvents = useCallback(() => undefined, []);
  const onBackend = useCallback(() => undefined, []);
  return (
    <WorldCanvas
      runtime={runtime}
      tier={quality.tier}
      forceWebGL={p.forceWebGL}
      onBackend={onBackend}
      onFail={p.onFail}
    >
      <WorldScene
        runtime={runtime}
        palette={palette}
        tier={quality.tier}
        statuses={statuses}
        pops={{}}
        car={p.car}
        onMotionEvents={noEvents}
        onFrame={quality.onFrame}
        onFirstFrame={p.onFirstFrame}
        controls={
          <FilmControls
            runtime={runtime}
            plan={p.plan}
            clock={p.clock}
            video={p.video}
            onHandle={p.onHandle}
            onFirstFrame={p.onFirstFrame}
            onFrame={quality.onFrame}
            onEnd={p.onEnd}
          />
        }
      />
    </WorldCanvas>
  );
}

function FilmControls({
  runtime,
  plan,
  clock,
  video,
  onHandle,
  onFirstFrame,
  onFrame,
  onEnd,
}: {
  runtime: WorldRuntime;
  plan: FilmPlan;
  clock: FilmClock;
  video: { width: number; height: number };
  onHandle: (handle: FilmHandle | null) => void;
  onFirstFrame: () => void;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
  onEnd: () => void;
}) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  const pose = useCallback(
    (t: number, aspect?: number) => poseFilm(camera, runtime, plan, t, aspect),
    [runtime, plan, camera],
  );

  const step = useCallback(
    (now: number, dt: number) => {
      pose(clock.t(now));
      runtime.beginFrame();
      runtime.runUpdaters({ now, dt });
      if (clock.settle(now)) onEnd();
      return clock.playing || runtime.needsFrame;
    },
    [pose, clock, runtime, onEnd],
  );

  // a exportação: um alvo fora da tela no tamanho do vídeo, criado e descartado com a cena
  useEffect(() => {
    const { width, height } = video;
    const target = new RenderTarget(width, height, {
      type: UnsignedByteType,
      format: RGBAFormat,
      depthBuffer: true,
    });
    const flip = new Uint8ClampedArray(width * height * 4);
    const backend = backendOf(gl);
    const handle: FilmHandle = {
      backend,
      wake: () => runtime.invalidate(),
      renderFrame: async (t: number) => {
        const screenAspect = camera.aspect;
        pose(t, width / height);
        runtime.beginFrame();
        runtime.runUpdaters({ now: t, dt: 1 / 30 });
        // o alvo de saída só durante este desenho: o laço da tela, se rodar no meio, vai para a tela
        gl.setOutputRenderTarget(target);
        gl.render(scene, camera);
        gl.setOutputRenderTarget(null);
        pose(clock.t(performance.now()), screenAspect);
        const pixels = await gl.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
        const row = width * 4;
        if (backend === 'webgl2') {
          // o WebGL lê de baixo para cima; o vídeo vai de cima para baixo
          for (let y = 0; y < height; y++) {
            flip.set(bytes.subarray((height - 1 - y) * row, (height - y) * row), y * row);
          }
        } else {
          flip.set(bytes.subarray(0, row * height));
        }
        return new ImageData(flip, width, height);
      },
    };
    onHandle(handle);
    return () => {
      onHandle(null);
      target.dispose();
    };
  }, [gl, scene, camera, pose, runtime, clock, video, onHandle]);

  return <FrameDriver step={step} onFrame={onFrame} onFirstFrame={onFirstFrame} />;
}
