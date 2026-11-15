import { useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { StopKind } from '@shared/constants.ts';
import { buildMiniature, type Miniature } from '@/art/stops/index.ts';
import { stepProgress } from '../opening.ts';
import { heightAt, type HeightField } from './heightfield.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * As peças das paradas na cena (fases 14 e 22): uma por nó, ao lado da estrada e virada para ela,
 * assentada no piso plano que o layout abre para ela. Entram no R3F como `primitive` para receberem
 * o toque (o raio do ponteiro acha a malha): tocar numa abre a folha da parada, como a pílula. Na
 * abertura do dia, cada uma cresce no instante do pino dela; à noite acende as janelas e a poça de
 * luz no chão (por emissão, sem luz nova na cena).
 */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  onTap?: ((stopId: string) => void) | undefined;
};

type Placed = { stopId: string; mini: Miniature };

/**
 * A peça de cada parada: a do lugar, quando houver (fase 23, os cartões-postais), senão a miniatura
 * do tipo. Hoje a resposta é sempre a miniatura do tipo: esta é a única porta por onde a peça do
 * lugar vai entrar.
 */
function pieceFor(kind: StopKind, seed: number): Miniature {
  return buildMiniature(kind, seed);
}

export function Miniatures({ runtime, field, onTap }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const layout = runtime.layout;

  const placed = useMemo<Placed[]>(() => {
    const out: Placed[] = [];
    for (const f of layout.features) {
      if (f.kind !== 'miniature') continue;
      const mini = pieceFor(f.stop, (layout.seed ^ (f.x * 31) ^ (f.z * 17)) >>> 0);
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

  // a abertura: cada peça cresce no instante do pino dela; a noite acende as janelas e a poça
  useEffect(
    () =>
      runtime.register(({ now }) => {
        const op = runtime.opening;
        const night = runtime.night.t;
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
          p.mini.setNight(night);
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
            // um toque fora do carro: o modo de perto acaba
            runtime.leaveClose();
            onTap?.(p.stopId);
          }}
        />
      ))}
    </>
  );
}
