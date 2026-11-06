import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3, type Camera } from 'three/webgpu';
import { cameraPosition, type CameraFrame } from '../math.ts';
import { lerp } from '../noise.ts';
import { MOMENT_DIST } from './Car.tsx';
import type { WorldRuntime } from './runtime.ts';

/**
 * A câmera parada do dia inteiro, e o único movimento que ela faz: nas curiosidades, mergulha até
 * o carro e volta. Interpola o enquadramento atual para o desejado e avisa o laço enquanto ainda
 * não chegou; parada, não pede quadro nenhum.
 */
export const MOMENT_TILT = (58 * Math.PI) / 180;

type Rig = { view: CameraFrame; want: CameraFrame; pos: Vector3; look: Vector3; first: boolean };

function wanted(rig: Rig, runtime: WorldRuntime): void {
  const frame = runtime.layout.camera;
  const dive = runtime.motion.dive;
  if (dive && !runtime.motion.reducedMotion) {
    const p = runtime.layout.pathAt(runtime.motion.s);
    rig.want.target = [p.x, p.y, p.z];
    rig.want.distance = MOMENT_DIST;
    rig.want.tilt = MOMENT_TILT;
  } else {
    rig.want.target = [...frame.target];
    rig.want.distance = frame.distance;
    rig.want.tilt = frame.tilt;
  }
  rig.want.fov = frame.fov;
}

/** Aproxima o enquadramento atual do desejado e devolve se ainda está a caminho. */
function approach(rig: Rig, k: number): boolean {
  let moving = false;
  const step = (a: number, b: number) => {
    const v = a + (b - a) * k;
    if (Math.abs(b - v) > 0.05) moving = true;
    return v;
  };
  const { view, want } = rig;
  view.target = [
    step(view.target[0], want.target[0]),
    step(view.target[1], want.target[1]),
    step(view.target[2], want.target[2]),
  ];
  view.distance = step(view.distance, want.distance);
  view.tilt = lerp(view.tilt, want.tilt, k);
  view.fov = want.fov;
  if (Math.abs(want.tilt - view.tilt) > 0.001) moving = true;
  return moving;
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
    const frame = runtime.layout.camera;
    const rig: Rig = {
      view: { ...frame, target: [...frame.target] },
      want: { ...frame, target: [...frame.target] },
      pos: new Vector3(),
      look: new Vector3(),
      first: true,
    };
    const update = ({ dt }: { dt: number }) => {
      wanted(rig, runtime);
      const k = rig.first || runtime.motion.reducedMotion ? 1 : Math.min(1, dt * 2.6);
      rig.first = false;
      if (approach(rig, k)) runtime.requestFrame();
      runtime.setCameraDistance(rig.view.distance);
      apply(camera, rig);
    };
    update({ dt: 1 });
    invalidate();
    return runtime.register(update);
  }, [runtime, camera, invalidate]);

  return null;
}
