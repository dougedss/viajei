import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3, type Camera } from 'three/webgpu';
import { approachFrame, atNode, diveCamera, followCamera, nextNodeS } from '../camera.ts';
import { cameraPosition, type CameraFrame } from '../math.ts';
import { OPENING_TIMELINE } from '../opening.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * A câmera que segue o carro (fase 14): o enquadramento desejado sai de `camera.ts` (atrás e a três
 * quartos; perto parado, recuando em movimento; a curiosidade mais perto e mais baixa; a abertura
 * do dia larga até o carro entrar), e aqui só se suaviza o atual para o desejado, avisando o laço
 * enquanto ainda não chegou. Com reduzir movimento, corta. Parada, não pede quadro nenhum.
 */
type Rig = { view: CameraFrame; pos: Vector3; look: Vector3; first: boolean };

function wanted(runtime: WorldRuntime, now: number): CameraFrame {
  const { layout, motion } = runtime;
  // a abertura começa larga, com o dia inteiro; quando o carro entra, a câmera desce até ele
  if (runtime.opening && runtime.openingElapsed(now) < OPENING_TIMELINE.car[0]) {
    return layout.camera;
  }
  const nextS = nextNodeS(layout.nodes, motion.s);
  if (motion.dive && !motion.reducedMotion) return diveCamera(layout, motion.s, nextS);
  const parked = !motion.busy && atNode(layout.nodes, motion.s);
  return followCamera({ layout, s: motion.s, nextS, parked });
}

function apply(camera: Camera, rig: Rig): void {
  const eye = cameraPosition(rig.view);
  rig.pos.set(eye[0], eye[1], eye[2]);
  rig.look.set(rig.view.target[0], rig.view.target[1], rig.view.target[2]);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  if (camera instanceof PerspectiveCamera && Math.abs(camera.fov - rig.view.fov) > 0.01) {
    Object.assign(camera, { fov: rig.view.fov });
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

export function CameraRig({ runtime }: { runtime: WorldRuntime }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    const rig: Rig = {
      view: { ...runtime.view, target: [...runtime.view.target] },
      pos: new Vector3(),
      look: new Vector3(),
      first: true,
    };
    const update = ({ now, dt }: { now: number; dt: number }) => {
      const want = wanted(runtime, now);
      const k = rig.first || runtime.motion.reducedMotion ? 1 : Math.min(1, dt * 2.6);
      rig.first = false;
      const next = approachFrame(rig.view, want, k);
      rig.view = next.view;
      if (next.moving) runtime.requestFrame();
      runtime.setView(rig.view);
      apply(camera, rig);
    };
    update({ now: performance.now(), dt: 1 });
    invalidate();
    return runtime.register(update);
  }, [runtime, camera, invalidate]);

  return null;
}
