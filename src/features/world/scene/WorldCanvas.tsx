import { Canvas, type RootState } from '@react-three/fiber';
import { useCallback, type ReactNode } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, type WebGPURenderer } from 'three/webgpu';
import { WorldBoundary } from '../components/Boundary.tsx';
import { FOV } from '../layout.ts';
import type { Tier } from '../quality.ts';
import { backendOf, createRenderer, type Backend } from '../renderer.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O Canvas do R3F com o renderer do three criado de forma assíncrona (`WebGPURenderer`, WebGL2
 * forçado quando não há WebGPU), render sob demanda, `dpr` e sombras pelo nível. O R3F é o dono do
 * renderer que a fábrica cria e o descarta ao desmontar (StrictMode incluído). Um limite de erro em
 * volta: se o renderer não nascer ou o contexto se perder, a seção troca para a lista.
 */
type Props = {
  runtime: WorldRuntime;
  tier: Tier;
  forceWebGL: boolean;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
  children: ReactNode;
};

export function WorldCanvas({ runtime, tier, forceWebGL, onBackend, onFail, children }: Props) {
  const gl = useCallback(
    async (props: { canvas: unknown }) => {
      const renderer = await createRenderer(props.canvas as HTMLCanvasElement, { forceWebGL });
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      return renderer;
    },
    [forceWebGL],
  );
  const onCreated = useCallback(
    (state: RootState) => {
      const renderer = state.gl as unknown as WebGPURenderer;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFShadowMap;
      runtime.bindInvalidate(state.invalidate);
      onBackend(backendOf(renderer));
      renderer.domElement.addEventListener('webglcontextlost', () => onFail('context-lost'), {
        once: true,
      });
    },
    [runtime, onBackend, onFail],
  );

  return (
    <WorldBoundary
      fallback={null}
      onError={(err) => onFail(err instanceof Error ? err.message : 'erro')}
    >
      <Canvas
        gl={gl}
        frameloop="demand"
        dpr={tier.dpr}
        shadows
        camera={{ fov: FOV, near: 0.5, far: 1400, position: [0, 200, 200] }}
        onCreated={onCreated}
        style={{ position: 'absolute', inset: 0 }}
        aria-hidden="true"
      >
        {children}
      </Canvas>
    </WorldBoundary>
  );
}
