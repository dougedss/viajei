import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { Group, type WebGPURenderer } from 'three/webgpu';
import { createEnvironment } from '@/art/environment.ts';
import type { Palette } from '@/art/palette.ts';
import { createSceneTextures } from '@/art/textures.ts';
import type { CarSpec } from '@/art/cars/types.ts';
import type { StopStatus } from '@/features/travel-mode/rules.ts';
import type { MotionEvent } from '../motion.ts';
import type { WorldTier } from '../quality.ts';
import { Car } from './Car.tsx';
import { CameraRig } from './CameraRig.tsx';
import { buildHeightField } from './heightfield.ts';
import { Lighting, type LightingHandle } from './Lighting.tsx';
import { NodeRings } from './NodeRings.tsx';
import { Props } from './Props.tsx';
import { Road } from './Road.tsx';
import { SceneDriver } from './SceneDriver.tsx';
import { Terrain } from './Terrain.tsx';
import { Water } from './Water.tsx';
import type { WorldRuntime } from './runtime.ts';

/**
 * A cena montada: luz, terreno (com a água e a decoração no mesmo grupo, para subirem juntos na
 * abertura), estrada, anéis, carro e câmera, mais o laço único. Texturas e ambiente nascem uma vez
 * por Canvas e morrem com ele.
 */
export type WorldSceneProps = {
  runtime: WorldRuntime;
  palette: Palette;
  tier: WorldTier;
  statuses: Record<string, StopStatus>;
  pops: Record<string, number>;
  car: CarSpec;
  onMotionEvents: (events: MotionEvent[]) => void;
  onFrame: (now: number, dt_ms: number, moving: boolean) => void;
  onFirstFrame: () => void;
  /**
   * A câmera e o laço de outra cena sobre o mesmo cenário (o filme da retrospectiva, fase 9). Sem
   * isto, a câmera parada do dia e o laço da maquete.
   */
  controls?: ReactNode;
};

export function WorldScene({
  runtime,
  palette,
  tier,
  statuses,
  pops,
  car,
  onMotionEvents,
  onFrame,
  onFirstFrame,
  controls,
}: WorldSceneProps) {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  const scene = useThree((s) => s.scene);
  const layout = runtime.layout;
  const field = useMemo(() => buildHeightField(layout), [layout]);
  const [lighting, setLighting] = useState<LightingHandle | null>(null);

  const textures = useMemo(
    () => createSceneTextures({ road: palette.road, lane: palette.lane }),
    [palette],
  );
  useEffect(() => () => textures.dispose(), [textures]);

  const environment = useMemo(() => createEnvironment(gl), [gl]);
  useEffect(() => () => environment.dispose(), [environment]);

  const groups = useMemo(
    () => ({ ground: new Group(), road: new Group(), objects: new Group() }),
    [],
  );
  useEffect(() => {
    scene.add(groups.ground, groups.road, groups.objects);
    return () => {
      scene.remove(groups.ground, groups.road, groups.objects);
    };
  }, [scene, groups]);

  // em dev, a cena fica ao alcance do console: `__viajeiWorld.scene`, `.gl`, `.runtime`
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    Object.assign(window, { __viajeiWorld: { scene, gl, runtime } });
    return () => {
      Object.assign(window, { __viajeiWorld: undefined });
    };
  }, [scene, gl, runtime]);

  return (
    <>
      <Lighting
        runtime={runtime}
        palette={palette}
        environment={environment.texture}
        shadowMapSize={tier.shadowMapSize}
        onReady={setLighting}
      />
      <Terrain runtime={runtime} palette={palette} field={field} group={groups.ground} />
      <Water
        runtime={runtime}
        normal={textures.waterNormal}
        lighting={lighting}
        group={groups.ground}
      />
      <Props
        runtime={runtime}
        field={field}
        textures={{ facade: textures.facade, windows: textures.windows }}
        instanceRatio={tier.instanceRatio}
        treeShadows={tier.treeShadows}
        group={groups.ground}
      />
      <Road runtime={runtime} texture={textures.road} group={groups.road} />
      <NodeRings
        runtime={runtime}
        palette={palette}
        statuses={statuses}
        pops={pops}
        group={groups.objects}
      />
      <Car runtime={runtime} field={field} car={car} group={groups.objects} />
      {controls ?? (
        <>
          <CameraRig runtime={runtime} />
          <SceneDriver
            runtime={runtime}
            onMotionEvents={onMotionEvents}
            onFrame={onFrame}
            onFirstFrame={onFirstFrame}
          />
        </>
      )}
    </>
  );
}
