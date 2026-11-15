import type { RootState } from '@react-three/fiber';
import { useCallback, type ReactNode } from 'react';
import type { Backend } from '@/lib/three/renderer.ts';
import { ThreeCanvas, type ThreeCamera } from '@/lib/three/ThreeCanvas.tsx';
import { REST_FOV } from '../camera.ts';
import type { WorldTier } from '../quality.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O Canvas da maquete: o `ThreeCanvas` comum com a câmera da maquete e o `invalidate` do R3F ligado
 * ao `WorldRuntime`, que é quem pede quadros quando algo se move.
 */
type Props = {
  runtime: WorldRuntime;
  tier: WorldTier;
  forceWebGL: boolean;
  onBackend: (backend: Backend) => void;
  onFail: (reason: string) => void;
  /** um toque fora de tudo o que recebe toque (o carro, as peças) */
  onPointerMissed?: (() => void) | undefined;
  children: ReactNode;
};

/**
 * O plano de corte distante dá para o repouso mais afastado que existe (um palco baixo com um cartão
 * alto sobre ele leva a câmera a mais de 2.000 de distância); o próximo começa em 1 porque nada
 * fica a menos disso da câmera (o mergulho olha o carro de 40).
 */
const CAMERA: ThreeCamera = { fov: REST_FOV, near: 1, far: 6000, position: [0, 200, -200] };

export function WorldCanvas({
  runtime,
  tier,
  forceWebGL,
  onBackend,
  onFail,
  onPointerMissed,
  children,
}: Props) {
  const onCreated = useCallback(
    (state: RootState) => runtime.bindInvalidate(state.invalidate),
    [runtime],
  );
  return (
    <ThreeCanvas
      tier={tier}
      forceWebGL={forceWebGL}
      camera={CAMERA}
      onCreated={onCreated}
      onBackend={onBackend}
      onFail={onFail}
      onPointerMissed={onPointerMissed}
    >
      {children}
    </ThreeCanvas>
  );
}
