import { useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { buildMiniature, type Miniature } from '@/art/stops/index.ts';
import { stepProgress } from '../opening.ts';
import { heightAt, type HeightField } from './heightfield.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * As miniaturas das paradas na cena (fase 14): uma por nó, do tipo da parada, ao lado da estrada e
 * virada para ela, assentada no relevo. Entram no R3F como `primitive` para receberem o toque (o
 * raio do ponteiro acha a malha): tocar numa abre a folha da parada, como a pílula. Na abertura do
 * dia, cada uma cresce no instante do pino dela.
 */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  onTap?: ((stopId: string) => void) | undefined;
};

type Placed = { stopId: string; mini: Miniature };

export function Miniatures({ runtime, field, onTap }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;

  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = [];
    for (const f of layout.features) {
      if (f.kind !== 'miniature') continue;
      const mini = buildMiniature(f.stop, (layout.seed ^ (f.x * 31) ^ (f.z * 17)) >>> 0);
      mini.group.position.set(f.x, heightAt(field, f.x, f.z) - 0.05, f.z);
      mini.group.rotation.y = f.angle;
      mini.group.userData.stopId = f.stop_id;
      out.push({ stopId: f.stop_id, mini });
    }
    return out;
  }, [layout, field]);

  useEffect(() => {
    invalidate();
    return () => {
      for (const p of placed) p.mini.dispose();
    };
  }, [placed, invalidate]);

  // a abertura: cada miniatura cresce no instante do pino dela
  useEffect(
    () =>
      runtime.register(({ now }) => {
        const op = runtime.opening;
        for (const p of placed) {
          let k = 1;
          if (op) {
            const pin = op.plan.pins.find((x) => x.stop_id === p.stopId);
            const elapsed = runtime.openingElapsed(now);
            const t = pin ? Math.min(1, Math.max(0, (elapsed - pin.at_ms) / 400)) : 1;
            k = stepProgress(op.plan, 'pins', elapsed) > 0 ? t * (1.15 - 0.15 * t) : 0;
          }
          p.mini.group.scale.setScalar(Math.max(0.001, k));
          p.mini.group.visible = k > 0;
        }
      }),
    [runtime, placed],
  );

  return (
    <>
      {placed.map((p) => (
        <primitive
          key={p.stopId}
          object={p.mini.group}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onTap?.(p.stopId);
          }}
        />
      ))}
    </>
  );
}
