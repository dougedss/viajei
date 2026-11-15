import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3, type Camera } from 'three/webgpu';
import { approachFrame, atNode, closeActive, nextNodeS, wantedFrame } from '../camera.ts';
import { cameraPosition, type CameraFrame } from '../math.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * Quem move a câmera (fase 22): o enquadramento desejado sai de `camera.ts` (o repouso com o dia
 * inteiro, o modo de perto enquanto dura, o mergulho da curiosidade), e aqui só se suaviza o atual
 * para o desejado, avisando o laço enquanto ainda não chegou. O modo decidido vai ao runtime, que
 * avisa o React só quando muda (o atributo `data-world-camera`). Com reduzir movimento, corta.
 * Parada, não pede quadro nenhum; a abertura do dia inteira acontece no repouso.
 */
type Rig = { view: CameraFrame; pos: Vector3; look: Vector3; first: boolean };

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
      const { layout, motion } = runtime;
      // o tempo do modo de perto acabou: volta ao repouso (um toque fora já teria tirado)
      if (runtime.close !== null && !closeActive(runtime.close, now)) runtime.leaveClose();
      const nextS = nextNodeS(layout.nodes, motion.s);
      const { frame: want, mode } = wantedFrame({
        rest: runtime.rest,
        layout,
        s: motion.s,
        nextS,
        parked: !motion.busy && atNode(layout.nodes, motion.s),
        diving: motion.dive !== null,
        close: runtime.close,
        now,
        reducedMotion: motion.reducedMotion,
      });
      runtime.setCameraMode(mode);
      const k = rig.first || motion.reducedMotion ? 1 : Math.min(1, dt * 2.6);
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
