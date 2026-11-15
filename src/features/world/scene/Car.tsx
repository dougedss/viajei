import { useEffect, useMemo } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import {
  BufferGeometry,
  CircleGeometry,
  Float32BufferAttribute,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Group,
} from 'three/webgpu';
import { buildCar, type CarRig, type CarSpec } from '@/art/cars/index.ts';
import { carScaleFor, farness } from '../camera.ts';
import { OPENING_TIMELINE } from '../opening.ts';
import { heightAt, type HeightField } from './heightfield.ts';
import type { WorldRuntime } from './runtime.ts';

/**
 * O carro de quem olha na estrada (o da pessoa, fase 16): posição pelo `s` do controlador de
 * movimento, orientado pela tangente, rodas girando com o deslocamento, faróis pela noite. Fora da
 * rota, sai do traçado na perpendicular, com uma linha tracejada até a estrada. No repouso do dia
 * inteiro (fase 22) o carro é desenhado maior que a escala, pelo enquadramento, com um anel claro no
 * chão, para continuar sendo o que o olho acha primeiro; de perto, a escala natural e sem o anel. Um
 * toque nele (no carro ou no anel) liga o modo de perto.
 */
type Props = {
  runtime: WorldRuntime;
  field: HeightField;
  car: CarSpec;
  group: Group;
  /** o toque no carro: de quem olha a tela, nunca de quem dirige */
  onTap?: (() => void) | undefined;
};

type Tether = Line<BufferGeometry, LineDashedMaterial>;
type Halo = {
  ring: Mesh<RingGeometry, MeshBasicMaterial>;
  disc: Mesh<CircleGeometry, MeshBasicMaterial>;
};

/** o anel claro em volta do carro, em unidades do próprio carro (escala com ele) */
const HALO = { inner: 1.65, outer: 1.86 } as const;

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
  halo: Halo,
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
  // um acessório encaixando (a fase 9 chama `attach` quando uma conquista sai) pede mais quadros
  if (rig.update(now)) runtime.requestFrame();
  rig.group.scale.setScalar(carScaleFor(runtime.view));
  // o anel claro só quando a câmera está longe: de perto o carro fala por si
  const far = farness(runtime.view);
  halo.ring.material.opacity = 0.85 * far;
  halo.ring.visible = far > 0.02;
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

export function Car({ runtime, field, car, group, onTap }: Props) {
  const invalidate = useThree((s) => s.invalidate);
  // um carro por modelo; cor, acabamento, rodas, acessórios e placa mudam no carro já montado
  const rig = useMemo(
    () =>
      buildCar(
        {
          model: car.model,
          color: 'sunset',
          finish: 'solid',
          wheels: 'classic',
          accessories: [],
          plate: null,
        },
        { wake: invalidate },
      ),
    [car.model, invalidate],
  );
  useEffect(() => {
    rig.setColor(car.color);
    rig.setFinish(car.finish);
    rig.setWheels(car.wheels);
    rig.setAccessories(car.accessories);
    rig.setPlate(car.plate);
    invalidate();
  }, [rig, car, invalidate]);
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
  // o anel claro no chão e, por dentro dele, um disco invisível que recebe o toque (o alvo é maior
  // que a carroceria); os dois filhos do carro, na escala dele
  const halo = useMemo<Halo>(() => {
    const ring = new Mesh(
      new RingGeometry(HALO.inner, HALO.outer, 48),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.04;
    const disc = new Mesh(
      new CircleGeometry(HALO.outer, 24),
      new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.05;
    return { ring, disc };
  }, []);

  useEffect(() => {
    rig.group.add(halo.ring, halo.disc);
    group.add(tether);
    invalidate();
    return () => {
      rig.group.remove(halo.ring, halo.disc);
      group.remove(tether);
      rig.dispose();
      halo.ring.geometry.dispose();
      halo.ring.material.dispose();
      halo.disc.geometry.dispose();
      halo.disc.material.dispose();
      tether.geometry.dispose();
      tether.material.dispose();
    };
  }, [group, rig, tether, halo, invalidate]);

  useEffect(() => {
    const d: Drive = { lastS: null, ahead: new Vector3() };
    return runtime.register(({ now }) => drive(rig, tether, halo, runtime, field, d, now));
  }, [runtime, rig, tether, halo, field]);

  return (
    <primitive
      object={rig.group}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onTap?.();
      }}
    />
  );
}
