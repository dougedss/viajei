import { Canvas, type RootState } from '@react-three/fiber';
import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, type WebGPURenderer } from 'three/webgpu';
import type { Tier } from './quality.ts';
import { backendOf, createRenderer, type Backend } from './renderer.ts';
import { ThreeBoundary } from './ThreeBoundary.tsx';

/**
 * O Canvas do R3F que as duas cenas usam: o renderer do three criado de forma assíncrona
 * (`WebGPURenderer`, com WebGL2 forçado quando não há WebGPU), render sob demanda, `dpr` e sombras
 * pelo nível, tone mapping filmico. O R3F é o dono do renderer que a fábrica cria e o descarta ao
 * desmontar (StrictMode incluído). Um limite de erro em volta: se o renderer não nascer ou o
 * contexto se perder, `onFail` avisa e quem usa troca para a versão sem 3D. Para trocar de motor,
 * remonte com outra `key`: o R3F não religa um renderer novo ao canvas que já criou.
 */
export type ThreeCamera = {
  fov: number;
  near: number;
  far: number;
  position: [number, number, number];
};

type Props = {
  tier: Tier;
  forceWebGL: boolean;
  camera: ThreeCamera;
  /** a cena liga o `invalidate` do R3F na classe que guarda o estado dela */
  onCreated?: (state: RootState) => void;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
  style?: CSSProperties;
  children: ReactNode;
};

const FILL: CSSProperties = { position: 'absolute', inset: 0 };

export function ThreeCanvas({
  tier,
  forceWebGL,
  camera,
  onCreated,
  onBackend,
  onFail,
  style = FILL,
  children,
}: Props) {
  const gl = useCallback(
    async (props: { canvas: unknown }) => {
      const renderer = await createRenderer(props.canvas as HTMLCanvasElement, { forceWebGL });
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      return renderer;
    },
    [forceWebGL],
  );
  const created = useCallback(
    (state: RootState) => {
      const renderer = state.gl as unknown as WebGPURenderer;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PCFShadowMap;
      onCreated?.(state);
      onBackend(backendOf(renderer));
      renderer.domElement.addEventListener('webglcontextlost', () => onFail('context-lost'), {
        once: true,
      });
    },
    [onCreated, onBackend, onFail],
  );

  return (
    <ThreeBoundary
      fallback={null}
      onError={(err) => onFail(err instanceof Error ? err.message : 'erro')}
    >
      <Canvas
        gl={gl}
        frameloop="demand"
        dpr={tier.dpr}
        shadows
        camera={camera}
        onCreated={created}
        style={style}
        aria-hidden="true"
      >
        {children}
      </Canvas>
    </ThreeBoundary>
  );
}
