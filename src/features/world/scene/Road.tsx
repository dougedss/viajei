import { useEffect, useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  type Group,
  type Texture,
} from 'three/webgpu';

import { stepProgress } from '../opening.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * A estrada: uma fita ao longo do caminho amostrado, com a textura de asfalto e faixa repetida pelo
 * comprimento. Na abertura do dia ela se desenha da origem ao fim pelo `drawRange`.
 */
type Props = { runtime: WorldRuntime; texture: Texture; group: Group };

type RoadMesh = Mesh<BufferGeometry, MeshStandardMaterial>;

function draw(mesh: RoadMesh, total: number, progress: number): void {
  if (progress >= 1) {
    mesh.geometry.setDrawRange(0, Number.POSITIVE_INFINITY);
    mesh.visible = true;
    return;
  }
  const count = Math.floor((progress * total) / 6) * 6;
  mesh.geometry.setDrawRange(0, count);
  mesh.visible = count > 0;
}

export function Road({ runtime, texture, group }: Props) {
  const layout = runtime.layout;
  const mesh = useMemo<RoadMesh>(() => {
    const pts = layout.path;
    const n = pts.length;
    const pos = new Float32Array(n * 6);
    const uv = new Float32Array(n * 4);
    const idx: number[] = [];
    pts.forEach((p, i) => {
      const nx = -p.tz;
      const nz = p.tx;
      const l = Math.hypot(nx, nz) || 1;
      const y = p.y + 0.12;
      pos.set(
        [
          p.x + (nx / l) * layout.roadHalfWidth,
          y,
          p.z + (nz / l) * layout.roadHalfWidth,
          p.x - (nx / l) * layout.roadHalfWidth,
          y,
          p.z - (nz / l) * layout.roadHalfWidth,
        ],
        i * 6,
      );
      uv.set([0, p.s / 9, 1, p.s / 9], i * 4);
      if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    });
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('uv', new BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new Mesh(geo, new MeshStandardMaterial({ map: texture, roughness: 0.92 }));
    m.receiveShadow = true;
    return m;
  }, [layout, texture]);

  useEffect(() => {
    group.add(mesh);
    return () => {
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    };
  }, [group, mesh]);

  useEffect(() => {
    const total = mesh.geometry.index?.count ?? 0;
    return runtime.register(({ now }) => {
      const op = runtime.opening;
      draw(mesh, total, op ? stepProgress(op.plan, 'road', runtime.openingElapsed(now)) : 1);
    });
  }, [runtime, mesh]);

  return null;
}
