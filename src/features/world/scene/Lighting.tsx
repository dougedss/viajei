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
import { clamp, lerp, smooth } from '../noise.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * Luz, fundo e névoa com dois presets, DIA e NOITE, interpolados em 1,5 s. A maquete é uma maquete
 * de mesa (fase 22): o fundo é o palco (o token do tema), não um céu, e a névoa começa além da base,
 * só tingindo a mesa ao longe; de perto, o fim da maquete ganha um pouco de profundidade. O sol tem
 * sombra suave (o PCF do three/webgpu com `radius`, nos dois backends) numa caixa que cobre a maquete
 * inteira no repouso e encolhe em volta do alvo da câmera de perto. À noite os faróis, as janelas e
 * as poças de luz acendem em quem lê `runtime.night.t` (carro, torres, peças): nenhuma luz entra ou
 * sai da cena (a armadilha da fase 6).
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
/** a suavidade da sombra, em texels do mapa */
const SHADOW_RADIUS = 2.5;
/** a caixa do sol de perto, e a folga em volta da maquete no repouso */
const SHADOW_NEAR = 45;
const SHADOW_PAD = 12;

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
      bg: new Color(palette.stage),
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
      bg: new Color(palette.skyNightTop).lerp(new Color(palette.skyNightBottom), 0.25),
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
  sun.shadow.radius = SHADOW_RADIUS;
  sun.shadow.intensity = 0.9;
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
    fog: new Fog(presets.DAY.bg.clone(), 300, 700),
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

/**
 * O sol acompanha o alvo da câmera, preso à caixa da maquete: no repouso a sombra cobre o dia
 * inteiro; de perto a caixa encolhe em volta do que se vê, para a resolução por unidade subir. A
 * névoa fica além da base no repouso e dá profundidade ao fim da maquete de perto.
 */
function followCamera(
  handle: LightingHandle,
  runtime: WorldRuntime,
  nightT: number,
  target: Vector3,
): void {
  const cam = runtime.view;
  const { bounds, yMid } = runtime.layout;
  const halfW = (bounds.x1 - bounds.x0) / 2;
  const halfL = (bounds.z1 - bounds.z0) / 2;
  const baseExt = Math.max(halfW, halfL) + SHADOW_PAD;
  const ext = clamp(cam.distance * 0.42, SHADOW_NEAR, baseExt);
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.z0 + bounds.z1) / 2;
  // o centro da caixa: o alvo da câmera, sem sair da maquete
  const tx = ext >= baseExt ? cx : clamp(cam.target[0], bounds.x0 + ext, bounds.x1 - ext);
  const tz = ext >= baseExt ? cz : clamp(cam.target[2], bounds.z0 + ext, bounds.z1 - ext);
  target.set(tx, yMid, tz);
  handle.sun.position.copy(target).add(SUN_OFF);
  handle.sun.target.position.copy(target);
  if (Math.abs(handle.sun.shadow.camera.right - ext) > 2) {
    Object.assign(handle.sun.shadow.camera, {
      left: -ext,
      right: ext,
      top: ext,
      bottom: -ext,
      far: ext * 2 + 160,
    });
    handle.sun.shadow.camera.updateProjectionMatrix();
  }
  handle.fog.near = cam.distance * lerp(1.3, 1.15, nightT);
  handle.fog.far = cam.distance * lerp(2.6, 2.2, nightT);
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
