import { Canvas, useThree, type RootState } from '@react-three/fiber';
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ACESFilmicToneMapping, PCFShadowMap, type WebGPURenderer } from 'three/webgpu';
import type { Tier } from './quality.ts';
import { backendOf, createRenderer, type Backend } from './renderer.ts';
import { ThreeBoundary } from './ThreeBoundary.tsx';

/**
 * O Canvas do R3F que as cenas usam: o renderer do three criado de forma assíncrona
 * (`WebGPURenderer`, com WebGL2 forçado quando não há WebGPU), render sob demanda, `dpr` e sombras
 * pelo nível, tone mapping filmico. O R3F é o dono do renderer que a fábrica cria e o descarta ao
 * desmontar (StrictMode incluído). Um limite de erro em volta: se o renderer não nascer ou o
 * contexto se perder, `onFail` avisa e quem usa troca para a versão sem 3D. Para trocar de motor,
 * remonte com outra `key`: o R3F não religa um renderer novo ao canvas que já criou.
 *
 * **Os shaders compilam antes do primeiro quadro, sem segurar a thread principal (fase 13).** O
 * primeiro `render()` de uma cena compila todos os programas dela de forma síncrona: o link de
 * cada um é uma ida e volta ao processo da GPU, e numa máquina fraca (ou em WebGL por software) a
 * página inteira congela por segundos, com o sync e os toques parados junto. O laboratório viu o
 * rack de um "Usar no carro" esperar o palco do cartão de conquista compilar. Agora a cena nasce
 * com `frameloop="never"`, o `compileAsync` do three compila em paralelo onde o navegador oferece
 * `KHR_parallel_shader_compile` (e no WebGPU por natureza), e só depois o laço sob demanda liga e
 * desenha o primeiro quadro. Onde não há compilação paralela, o custo é o mesmo de antes.
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

/** Se a compilação paralela não responder até aqui, a cena desenha do jeito antigo (síncrono). */
const PRECOMPILE_CAP_MS = 20_000;

/**
 * Compila a cena montada pelos filhos (este componente vem depois deles na árvore, então o efeito
 * dele roda depois dos efeitos deles) e, quando o Canvas passa a `demand`, pede o primeiro quadro:
 * o R3F não invalida sozinho ao trocar o `frameloop`.
 */
function Precompile({ compiled, onCompiled }: { compiled: boolean; onCompiled: () => void }) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let alive = true;
    const cap = new Promise<void>((resolve) => setTimeout(resolve, PRECOMPILE_CAP_MS));
    void Promise.race([gl.compileAsync(scene, camera).catch(() => undefined), cap]).then(() => {
      if (alive) onCompiled();
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onCompiled]);
  useEffect(() => {
    if (compiled) invalidate();
  }, [compiled, invalidate]);
  return null;
}

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
  const [compiled, setCompiled] = useState(false);
  const onCompiled = useCallback(() => setCompiled(true), []);
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
        frameloop={compiled ? 'demand' : 'never'}
        dpr={tier.dpr}
        shadows
        camera={camera}
        onCreated={created}
        style={style}
        aria-hidden="true"
      >
        {children}
        <Precompile compiled={compiled} onCompiled={onCompiled} />
      </Canvas>
    </ThreeBoundary>
  );
}
