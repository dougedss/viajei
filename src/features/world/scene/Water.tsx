import { useEffect, useMemo } from 'react';
import {
  CircleGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector2,
  type Group,
  type Texture,
} from 'three/webgpu';
import type { WorldRuntime } from './runtime.ts';
import type { LightingHandle } from './Lighting.tsx';

/**
 * Água: o mar, um plano no nível do mar que aparece onde o terreno mergulha (só com praia), e os
 * lagos das represas, um círculo por nó. A normal ondula devagar enquanto a cena se move; a cor
 * segue o preset dia/noite.
 */
type Props = {
  runtime: WorldRuntime;
  normal: Texture;
  lighting: LightingHandle | null;
  group: Group;
};

export function Water({ runtime, normal, lighting, group }: Props) {
  const layout = runtime.layout;
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: 0x1e6d92,
        roughness: 0.16,
        metalness: 0.05,
        normalMap: normal,
        normalScale: new Vector2(0.35, 0.35),
      }),
    [normal],
  );

  const meshes = useMemo(() => {
    const out: Mesh[] = [];
    const { bounds } = layout;
    if (layout.seaLevel !== null) {
      const sea = new Mesh(
        new PlaneGeometry(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0),
        material,
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set((bounds.x0 + bounds.x1) / 2, layout.seaLevel, (bounds.z0 + bounds.z1) / 2);
      out.push(sea);
    }
    for (const f of layout.features) {
      if (f.kind !== 'lake') continue;
      const lake = new Mesh(new CircleGeometry(1, 48), material);
      lake.rotation.x = -Math.PI / 2;
      lake.scale.set(f.rx * 0.98, f.rz * 0.98, 1);
      lake.position.set(f.x, f.level, f.z);
      out.push(lake);
    }
    normal.repeat.set(48, 14);
    return out;
  }, [layout, material, normal]);

  useEffect(() => {
    for (const m of meshes) group.add(m);
    return () => {
      for (const m of meshes) {
        group.remove(m);
        m.geometry.dispose();
      }
    };
  }, [group, meshes]);

  useEffect(() => () => material.dispose(), [material]);

  useEffect(
    () =>
      runtime.register(({ dt }) => {
        normal.offset.set(normal.offset.x + dt * 0.015, normal.offset.y + dt * 0.01);
        if (lighting) material.color.copy(lighting.waterColor);
      }),
    [runtime, normal, material, lighting],
  );

  return null;
}
