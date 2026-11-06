import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Color, Mesh, MeshStandardMaterial, TorusGeometry, type Group } from 'three/webgpu';
import type { Palette } from '@/art/palette.ts';
import type { StopStatus } from '@/features/travel-mode/rules.ts';
import { lerp, smooth } from '../noise.ts';
import { stepProgress } from '../opening.ts';
import { MOMENT_DIST } from './Car.tsx';
import type { WorldRuntime } from './runtime.ts';

/**
 * Os anéis no chão de cada nó, com cor e emissão pelo estado: concluída (verde), próxima (acento,
 * mais forte, pulsando enquanto a cena se move), pendente (clara, apagada) e pulada (apagada e
 * menor). Na abertura caem em sequência; quando o carro passa por um nó no replay, o anel salta.
 */
type Props = {
  runtime: WorldRuntime;
  palette: Palette;
  /** estado visível de cada nó (durante um replay, o estado anterior até o carro passar) */
  statuses: Record<string, StopStatus>;
  /** instante (performance.now) em que cada nó foi revelado pelo carro: o salto do anel */
  pops: Record<string, number>;
  group: Group;
};

type Ring = { mesh: Mesh<TorusGeometry, MeshStandardMaterial>; stopId: string };
type RingColors = Record<StopStatus, Color>;

const POP_MS = 450;

function paint(ring: Ring, status: StopStatus, colors: RingColors): void {
  const mat = ring.mesh.material;
  mat.color.copy(colors[status]);
  mat.emissive.copy(colors[status]);
  mat.emissiveIntensity =
    status === 'next' ? 1.1 : status === 'done' ? 0.5 : status === 'skipped' ? 0.05 : 0.12;
}

function animate(
  ring: Ring,
  status: StopStatus,
  runtime: WorldRuntime,
  pops: Record<string, number>,
  now: number,
): void {
  const op = runtime.opening;
  const elapsed = runtime.openingElapsed(now);
  // o dia inteiro na tela pede anéis maiores; no mergulho eles voltam ao tamanho natural
  let scale = lerp(
    1,
    1.9,
    smooth(MOMENT_DIST, runtime.layout.camera.distance, runtime.cameraDistance),
  );
  let visible = true;
  if (op) {
    const pin = op.plan.pins.find((p) => p.stop_id === ring.stopId);
    const t = pin ? Math.min(1, Math.max(0, (elapsed - pin.at_ms) / 400)) : 1;
    const over = t < 1 ? 1.25 - 0.25 * (1 - (1 - t) * (1 - t)) : 1;
    scale *= stepProgress(op.plan, 'pins', elapsed) > 0 ? t * over : 0;
    visible = t > 0;
  }
  const popAt = pops[ring.stopId];
  if (popAt !== undefined && now - popAt < POP_MS) {
    const p = (now - popAt) / POP_MS;
    scale *= 1 + 0.6 * Math.sin(p * Math.PI);
    runtime.requestFrame();
  }
  if (status === 'next' && runtime.motion.busy) scale *= 1 + 0.08 * Math.sin(now / 260);
  if (status === 'skipped') scale *= 0.7;
  ring.mesh.scale.set(scale, scale, 1);
  ring.mesh.visible = visible;
}

export function NodeRings({ runtime, palette, statuses, pops, group }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;
  const colors = useMemo<RingColors>(
    () => ({
      done: new Color(palette.onTime),
      next: new Color(palette.accent),
      pending: new Color('#d9d2c5'),
      skipped: new Color('#8a8f99'),
    }),
    [palette],
  );

  const rings = useMemo<Ring[]>(() => {
    const geo = new TorusGeometry(2.0, 0.15, 8, 48);
    return layout.nodes.map((node) => {
      const mesh = new Mesh(
        geo,
        new MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.4,
          roughness: 0.5,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(node.position[0], node.position[1] + 0.2, node.position[2]);
      mesh.receiveShadow = true;
      return { mesh, stopId: node.stop_id };
    });
  }, [layout]);

  useEffect(() => {
    for (const r of rings) group.add(r.mesh);
    return () => {
      for (const r of rings) {
        group.remove(r.mesh);
        r.mesh.material.dispose();
      }
      rings[0]?.mesh.geometry.dispose();
    };
  }, [group, rings]);

  useEffect(() => {
    for (const r of rings) paint(r, statuses[r.stopId] ?? 'pending', colors);
    invalidate();
  }, [rings, statuses, colors, invalidate]);

  useEffect(
    () =>
      runtime.register(({ now }) => {
        for (const r of rings) animate(r, statuses[r.stopId] ?? 'pending', runtime, pops, now);
      }),
    [runtime, rings, pops, statuses],
  );

  return null;
}
