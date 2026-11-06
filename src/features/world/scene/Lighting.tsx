import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Vector3,
  type Scene,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import type { Palette } from '@/art/palette.ts';
import { lerp, smooth } from '../noise.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * Luz, céu e névoa com dois presets, DIA e NOITE, interpolados em 1,5 s. O sol segue o alvo da
 * câmera para a sombra cobrir o que se vê; à noite os faróis e as janelas acendem em quem lê
 * `runtime.night.t` (carro, torres). Portado do protótipo com as cores dos tokens.
 */
type Preset = {
  bg: Color;
  sun: number;
  sunCol: Color;
  hemi: number;
  hemiSky: Color;
  hemiGround: Color;
  env: number;
  exposure: number;
  water: Color;
};
type Presets = { DAY: Preset; NIGHT: Preset };

export const NIGHT_FADE_PER_S = 1 / 1.5;
const SUN_OFF = new Vector3(-70, 130, -44);

export type LightingHandle = {
  sun: DirectionalLight;
  hemi: HemisphereLight;
  fog: Fog;
  background: Color;
  waterColor: Color;
};

type Props = {
  runtime: WorldRuntime;
  palette: Palette;
  environment: Texture | null;
  shadowMapSize: number;
  /** quem desenha a água lê a cor daqui */
  onReady?: (handle: LightingHandle) => void;
};

function makePresets(palette: Palette): Presets {
  return {
    DAY: {
      bg: new Color(palette.skyDayTop).lerp(new Color(palette.skyDayBottom), 0.5),
      sun: 2.8,
      sunCol: new Color(0xffe2b8),
      hemi: 0.9,
      hemiSky: new Color(0xcfe0ff),
      hemiGround: new Color(0x8d7b5c),
      env: 0.3,
      exposure: 1.0,
      water: new Color(0x1e6d92),
    },
    NIGHT: {
      bg: new Color(palette.skyNightTop).lerp(new Color(palette.skyNightBottom), 0.35),
      sun: 0.4,
      sunCol: new Color(0x9bb4ff),
      hemi: 0.75,
      hemiSky: new Color(0x2c3a5e),
      hemiGround: new Color(0x0a0d14),
      env: 0.16,
      exposure: 0.9,
      water: new Color(0x12395a),
    },
  };
}

function makeHandle(presets: Presets): LightingHandle {
  const sun = new DirectionalLight(0xffe2b8, 2.8);
  sun.castShadow = true;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, {
    left: -70,
    right: 70,
    top: 70,
    bottom: -70,
    near: 1,
    far: 400,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const hemi = new HemisphereLight(0xcfe0ff, 0x8d7b5c, 0.9);
  return {
    sun,
    hemi,
    fog: new Fog(presets.DAY.bg.clone(), 95, 240),
    background: presets.DAY.bg.clone(),
    waterColor: presets.DAY.water.clone(),
  };
}

/** Liga os presets interpolados nos objetos da cena. */
function applyNight(
  scene: Scene,
  gl: WebGPURenderer,
  handle: LightingHandle,
  presets: Presets,
  t: number,
): void {
  const { DAY, NIGHT } = presets;
  const m = (a: number, b: number) => lerp(a, b, t);
  handle.background.copy(DAY.bg).lerp(NIGHT.bg, t);
  handle.fog.color.copy(handle.background);
  handle.sun.intensity = m(DAY.sun, NIGHT.sun);
  handle.sun.color.copy(DAY.sunCol).lerp(NIGHT.sunCol, t);
  handle.hemi.intensity = m(DAY.hemi, NIGHT.hemi);
  handle.hemi.color.copy(DAY.hemiSky).lerp(NIGHT.hemiSky, t);
  handle.hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, t);
  handle.waterColor.copy(DAY.water).lerp(NIGHT.water, t);
  Object.assign(scene, { environmentIntensity: m(DAY.env, NIGHT.env) });
  Object.assign(gl, { toneMappingExposure: m(DAY.exposure, NIGHT.exposure) });
  // janelas das torres: quem instancia lê isto
  scene.userData.windowGlow = 1.4 * smooth(0.3, 0.9, t);
}

/** O sol acompanha o alvo da câmera; a névoa, a distância dela. */
function followCamera(
  handle: LightingHandle,
  runtime: WorldRuntime,
  nightT: number,
  target: Vector3,
): void {
  const cam = runtime.layout.camera;
  target.set(cam.target[0], runtime.layout.yMid, cam.target[2]);
  handle.sun.position.copy(target).add(SUN_OFF);
  handle.sun.target.position.copy(target);
  const ext = Math.max(45, Math.min(150, cam.distance * 0.42));
  if (Math.abs(handle.sun.shadow.camera.right - ext) > 2) {
    Object.assign(handle.sun.shadow.camera, {
      left: -ext,
      right: ext,
      top: ext,
      bottom: -ext,
      far: ext * 2 + 120,
    });
    handle.sun.shadow.camera.updateProjectionMatrix();
  }
  handle.fog.near = cam.distance * lerp(0.85, 0.75, nightT);
  handle.fog.far = cam.distance * lerp(2.1, 1.6, nightT);
}

function setShadowSize(handle: LightingHandle, size: number): void {
  handle.sun.shadow.mapSize.set(size, size);
  if (handle.sun.shadow.map) {
    handle.sun.shadow.map.dispose();
    handle.sun.shadow.map = null;
  }
}

export function Lighting({ runtime, palette, environment, shadowMapSize, onReady }: Props) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const presets = useMemo(() => makePresets(palette), [palette]);
  const handleRef = useRef<LightingHandle | null>(null);

  useEffect(() => {
    const handle = makeHandle(presets);
    handleRef.current = handle;
    scene.add(handle.sun, handle.sun.target, handle.hemi);
    Object.assign(scene, { fog: handle.fog, background: handle.background });
    onReady?.(handle);
    return () => {
      scene.remove(handle.sun, handle.sun.target, handle.hemi);
      handle.sun.shadow.map?.dispose();
      handle.sun.dispose();
      handle.hemi.dispose();
      Object.assign(scene, { fog: null, background: null });
      handleRef.current = null;
    };
  }, [scene, presets, onReady]);

  useEffect(() => {
    Object.assign(scene, { environment });
    return () => {
      Object.assign(scene, { environment: null });
    };
  }, [scene, environment]);

  useEffect(() => {
    if (handleRef.current) setShadowSize(handleRef.current, shadowMapSize);
  }, [shadowMapSize, presets]);

  // a interpolação dia/noite e o sol que acompanha a câmera, a cada quadro em movimento
  useEffect(() => {
    const target = new Vector3();
    const update = ({ dt }: { dt: number }) => {
      const handle = handleRef.current;
      if (!handle) return;
      const t = runtime.stepNight(
        Math.min(1, dt * NIGHT_FADE_PER_S * 2.2),
        runtime.motion.reducedMotion,
      );
      applyNight(scene, gl, handle, presets, t);
      followCamera(handle, runtime, t, target);
    };
    update({ dt: 1 });
    return runtime.register(update);
  }, [runtime, scene, gl, presets]);

  return null;
}
