import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3, type Group } from 'three/webgpu';
import { buildCar, type CarRig, type CarSpec } from '@/art/cars/index.ts';
import { carScale } from '../camera.ts';
import type { ConvoyCar } from '../convoy.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O comboio (fase 14, D179): quem do time está em outro carro aparece pequeno na estrada, na última
 * posição que mandou, numa cor apagada; nada de nomes nem rastros. Um carro por pessoa, construído
 * pelo mesmo `buildCar` (sem os feixes dos faróis), na faixa da direita, olhando para a frente. A
 * especificação do carro vem por membro (`carFor`): hoje é o carro da viagem em névoa; a fase 16
 * troca pelo carro de cada pessoa.
 */
type Props = {
  runtime: WorldRuntime;
  cars: readonly ConvoyCar[];
  /** o carro de cada membro; por padrão, o carro da viagem em névoa */
  carFor: (userId: string) => CarSpec;
  group: Group;
};

/** menor que o carro da viagem, para a hierarquia ficar clara */
export const CONVOY_SCALE = 0.85;
/** na faixa da direita (em unidades da cena), para não se sobrepor ao carro da viagem */
const LANE_OFFSET = 0.9;

type Placed = { userId: string; rig: CarRig; fraction: number };

export function ConvoyCars({ runtime, cars, carFor, group }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const key = cars.map((c) => `${c.user_id}:${c.fraction.toFixed(4)}`).join(',');

  const placed = useMemo<Placed[]>(
    () =>
      cars.map((c) => ({
        userId: c.user_id,
        fraction: c.fraction,
        rig: buildCar(carFor(c.user_id), { beams: false }),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- um carro por pessoa e posição; `carFor` é estável
    [key],
  );

  useEffect(() => {
    for (const p of placed) group.add(p.rig.group);
    invalidate();
    return () => {
      for (const p of placed) {
        group.remove(p.rig.group);
        p.rig.dispose();
      }
    };
  }, [group, placed, invalidate]);

  useEffect(() => {
    const ahead = new Vector3();
    return runtime.register(() => {
      const { layout } = runtime;
      for (const p of placed) {
        const s = layout.fractionToS(p.fraction);
        const q = layout.pathAt(s);
        // à direita da tangente (o lado da mão de quem anda em +z)
        const nx = q.tz;
        const nz = -q.tx;
        p.rig.group.position.set(q.x + nx * LANE_OFFSET, q.y + 0.12, q.z + nz * LANE_OFFSET);
        ahead.set(q.x + nx * LANE_OFFSET + q.tx, q.y + 0.12 + q.ty, q.z + nz * LANE_OFFSET + q.tz);
        p.rig.group.lookAt(ahead);
        p.rig.group.scale.setScalar(carScale(runtime.cameraDistance) * CONVOY_SCALE);
        p.rig.setNight(runtime.night.t);
      }
    });
  }, [runtime, placed]);

  return null;
}
