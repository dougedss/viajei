import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Vector3,
  type Group,
} from 'three/webgpu';
import { buildCar, type CarRig } from '@/art/cars/index.ts';
import { lerp, smooth } from '../noise.ts';
import { OPENING_TIMELINE } from '../opening.ts';
import { heightAt, type HeightField } from './heightfield.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O carro da viagem na estrada: posição pelo `s` do controlador de movimento, orientado pela
 * tangente, rodas girando com o deslocamento, faróis pela noite. Fora da rota, sai do traçado na
 * perpendicular, com uma linha tracejada até a estrada. Escala pela distância da câmera, para
 * continuar legível quando o dia inteiro está na tela e não ficar gigante no mergulho.
 */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  car: { model: string | null; color: string | null; accessories: readonly string[] };
  group: Group;
};

export const MOMENT_DIST = 105;

type Tether = Line<BufferGeometry, LineDashedMaterial>;

function nearestSide(runtime: WorldRuntime, s: number): -1 | 1 {
  let side: -1 | 1 = 1;
  let best = Number.POSITIVE_INFINITY;
  for (const n of runtime.layout.nodes) {
    const d = Math.abs(n.s - s);
    if (d < best) {
      best = d;
      side = n.side;
    }
  }
  return side;
}

type Drive = { lastS: number | null; ahead: Vector3 };

/** Coloca o carro (e a linha para a estrada) no quadro: posição, orientação, rodas, escala, luzes. */
function drive(
  rig: CarRig,
  tether: Tether,
  runtime: WorldRuntime,
  field: HeightField,
  d: Drive,
  now: number,
): void {
  const { layout, motion } = runtime;
  const p = layout.pathAt(motion.s);
  // fora da rota: deslocado na perpendicular, do lado de fora do S
  let ox = 0;
  let oz = 0;
  let oy = 0;
  if (runtime.offRoute) {
    const side = nearestSide(runtime, motion.s);
    const mag = Math.min(9, 3 + runtime.offRoute.distance_m / 500);
    ox = -p.tz * side * mag;
    oz = p.tx * side * mag;
    oy = Math.max(0, heightAt(field, p.x + ox, p.z + oz) - p.y);
  }
  rig.group.position.set(p.x + ox, p.y + 0.12 + oy, p.z + oz);
  d.ahead.set(p.x + ox + p.tx, p.y + 0.12 + oy + p.ty, p.z + oz + p.tz);
  rig.group.lookAt(d.ahead);
  if (d.lastS !== null && motion.s !== d.lastS) rig.roll(motion.s - d.lastS);
  d.lastS = motion.s;
  rig.setNight(runtime.night.t);
  const far = smooth(MOMENT_DIST, layout.camera.distance, runtime.cameraDistance);
  rig.group.scale.setScalar(lerp(1.3, 2.4, far));
  // na abertura o carro só entra na hora dele
  const visible = !runtime.opening || runtime.openingElapsed(now) >= OPENING_TIMELINE.car[0];
  rig.group.visible = visible;
  tether.visible = runtime.offRoute !== null && visible;
  if (tether.visible) {
    const pos = tether.geometry.getAttribute('position');
    pos.setXYZ(0, p.x + ox, p.y + 0.3 + oy, p.z + oz);
    pos.setXYZ(1, p.x, p.y + 0.3, p.z);
    pos.needsUpdate = true;
    tether.computeLineDistances();
  }
}

export function Car({ runtime, field, car, group }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  const rig = useMemo(
    () => buildCar(car.model, car.color, car.accessories),
    [car.model, car.color, car.accessories],
  );
  const tether = useMemo<Tether>(() => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    const line = new Line(
      geo,
      new LineDashedMaterial({ color: 0xd94b4b, dashSize: 0.9, gapSize: 0.6 }),
    );
    line.visible = false;
    return line;
  }, []);

  useEffect(() => {
    group.add(rig.group, tether);
    invalidate();
    return () => {
      group.remove(rig.group, tether);
      rig.dispose();
      tether.geometry.dispose();
      tether.material.dispose();
    };
  }, [group, rig, tether, invalidate]);

  useEffect(() => {
    const d: Drive = { lastS: null, ahead: new Vector3() };
    return runtime.register(({ now }) => drive(rig, tether, runtime, field, d, now));
  }, [runtime, rig, tether, field]);

  return null;
}
