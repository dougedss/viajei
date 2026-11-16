import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldLayout } from '../layout.ts';
import type { CameraFrame } from '../math.ts';
import type { MotionController } from '../motion.ts';
import { WorldRuntime, type CameraStatus } from './runtime.ts';

// os quadros de animação na mão: cada `frame()` roda o que estava esperando o próximo quadro
let pending: (() => void)[] = [];
const frame = () => {
  const now = pending;
  pending = [];
  for (const cb of now) cb();
};

const REST: CameraFrame = { target: [0, 0, 0], distance: 300, tilt: 52, yaw: Math.PI, fov: 26 };

function runtime(): { rt: WorldRuntime; seen: CameraStatus[] } {
  const rt = new WorldRuntime({} as WorldLayout, {} as MotionController, false, REST);
  const seen: CameraStatus[] = [];
  rt.onCamera((s) => seen.push(s));
  return { rt, seen };
}

describe('a câmera assentada (fase 24, D223)', () => {
  beforeEach(() => {
    pending = [];
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => pending.push(cb));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parada, só conta como assentada dois quadros depois: o desenhado e o apresentado', () => {
    const { rt, seen } = runtime();
    rt.cameraMoved(false);
    expect(rt.cameraSettled).toBe(false);
    frame();
    expect(rt.cameraSettled).toBe(false);
    frame();
    expect(rt.cameraSettled).toBe(true);
    expect(seen.at(-1)).toEqual({ mode: 'repouso', settled: true });
  });

  it('o modo novo tira o assentado na hora, e a câmera andando segura a espera', () => {
    const { rt, seen } = runtime();
    rt.cameraMoved(false);
    frame();
    frame();
    rt.setCameraMode('perto');
    expect(seen.at(-1)).toEqual({ mode: 'perto', settled: false });
    rt.cameraMoved(true);
    rt.cameraMoved(true);
    frame();
    frame();
    expect(rt.cameraSettled).toBe(false);
    rt.cameraMoved(false);
    frame();
    frame();
    expect(seen.at(-1)).toEqual({ mode: 'perto', settled: true });
  });

  it('andou no meio da espera: a espera de antes não vale, e a do quadro parado seguinte sim', () => {
    const { rt } = runtime();
    rt.cameraMoved(false);
    frame();
    rt.cameraMoved(true);
    frame();
    expect(rt.cameraSettled).toBe(false);
    rt.cameraMoved(false);
    frame();
    frame();
    expect(rt.cameraSettled).toBe(true);
  });

  it('só avisa quando muda', () => {
    const { rt, seen } = runtime();
    rt.cameraMoved(false);
    frame();
    frame();
    rt.cameraMoved(false);
    frame();
    frame();
    rt.setCameraMode('repouso');
    expect(seen).toHaveLength(1);
  });
});
