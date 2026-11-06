import type { RootState } from '@react-three/fiber';
import { useCallback, type ReactNode } from 'react';
import type { Backend } from '@/lib/three/renderer.ts';
import { ThreeCanvas, type ThreeCamera } from '@/lib/three/ThreeCanvas.tsx';
import { FOV } from '../layout.ts';
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
  children: ReactNode;
};

const CAMERA: ThreeCamera = { fov: FOV, near: 0.5, far: 1400, position: [0, 200, 200] };

export function WorldCanvas({ runtime, tier, forceWebGL, onBackend, onFail, children }: Props) {
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
    >
      {children}
    </ThreeCanvas>
  );
}
