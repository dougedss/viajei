import { useThree } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import type { PerspectiveCamera, WebGPURenderer } from 'three/webgpu';
import { createEnvironment } from '@/art/environment.ts';
import { readPalette } from '@/art/palette.ts';
import { FrameDriver } from '@/lib/three/FrameDriver.tsx';
import type { Tier } from '@/lib/three/quality.ts';
import type { GarageRuntime } from './runtime.ts';
import { createStudio, type Studio } from './studio.ts';

/**
 * A cena da garagem montada: o estúdio, a luz de ambiente por PMREM (sem HDR da rede), o palco do
 * runtime com o carro, e o laço único que gira o disco, anda a troca e as animações do carro e põe
 * a câmera. Sombra e reflexo seguem o nível de qualidade. Tudo o que é da GPU nasce e morre no
 * mesmo efeito, para a dupla montagem do StrictMode não reaproveitar nada já descartado.
 */
type Props = {
  runtime: GarageRuntime;
  tier: Tier;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
  onFirstFrame: () => void;
};

export function Showroom({ runtime, tier, onFrame, onFirstFrame }: Props) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const studioRef = useRef<Studio | null>(null);

  useEffect(() => {
    const studio = createStudio(readPalette().accent);
    const environment = createEnvironment(gl);
    studioRef.current = studio;
    scene.add(studio.root);
    Object.assign(scene, {
      background: studio.background,
      environment: environment.texture,
      environmentIntensity: 0.4,
    });
    runtime.attach(scene);
    // o carro novo de uma troca compila antes de entrar em cena (sem engasgar a animação)
    runtime.bindCompile((object) => gl.compileAsync(object, camera, scene));
    return () => {
      runtime.bindCompile(null);
      runtime.detach();
      studio.dispose();
      environment.dispose();
      studioRef.current = null;
      Object.assign(scene, { background: null, environment: null });
    };
  }, [scene, gl, camera, runtime]);

  useEffect(() => {
    const studio = studioRef.current;
    if (!studio) return;
    studio.setShadowSize(tier.shadowMapSize);
    studio.setReflection(tier.level === 'alta');
    runtime.invalidate();
  }, [tier.shadowMapSize, tier.level, runtime]);

  useEffect(() => {
    runtime.setViewport(size.width, size.height);
  }, [runtime, size.width, size.height]);

  // em dev, a cena fica ao alcance do console: `__viajeiGarage.runtime`, `.scene`, `.gl`
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, { __viajeiGarage: { runtime, scene, gl } });
    return () => {
      Object.assign(window, { __viajeiGarage: undefined });
    };
  }, [runtime, scene, gl]);

  const step = useCallback(
    (now: number, dt: number) => {
      const busy = runtime.step(now, dt);
      runtime.applyCamera(camera);
      return busy;
    },
    [runtime, camera],
  );

  return <FrameDriver step={step} onFrame={onFrame} onFirstFrame={onFirstFrame} />;
}
