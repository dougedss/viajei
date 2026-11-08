import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type { Group } from 'three/webgpu';
import type { HeightField } from './heightfield.ts';
import { buildProps, setWindowGlow, type PropTextures } from './props-builder.ts';
import type { WorldRuntime } from './runtime.ts';

/** A decoração instanciada na cena: construída uma vez por layout, afinada pelo nível de qualidade. */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  textures: PropTextures;
  instanceRatio: number;
  treeShadows: boolean;
  group: Group;
};

export function Props({ runtime, field, textures, instanceRatio, treeShadows, group }: Props) {
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;
  // a câmera segue o carro de perto (fase 14): tudo no tamanho natural
  const built = useMemo(() => buildProps(layout, field, textures), [layout, field, textures]);

  useEffect(() => {
    for (const m of built.meshes) group.add(m);
    invalidate();
    return () => {
      for (const m of built.meshes) group.remove(m);
      built.dispose();
    };
  }, [group, built, invalidate]);

  useEffect(() => {
    built.applyTier(instanceRatio, treeShadows);
    invalidate();
  }, [built, instanceRatio, treeShadows, invalidate]);

  useEffect(
    () =>
      runtime.register(() => {
        const glow: unknown = scene.userData.windowGlow;
        setWindowGlow(built, typeof glow === 'number' ? glow : 0);
      }),
    [runtime, scene, built],
  );

  return null;
}
