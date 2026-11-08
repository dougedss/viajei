import { describe, expect, it } from 'vitest';
import seedDay1 from '@/lib/geo/__fixtures__/seed-dia-1.json';
import type { DayRoute } from '@/lib/db/schema.ts';
import { readPlace } from '@/lib/geo/index.ts';
import { makeStop } from '@/test/factories.ts';
import { gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import {
  aheadOf,
  approachFrame,
  atNode,
  CAR_SCALE,
  CAR_SCREEN_Y,
  carScale,
  diveCamera,
  DIVE,
  farness,
  FOLLOW_FAR,
  FOLLOW_GAP_K,
  FOLLOW_NEAR,
  FOLLOW_TILT,
  followCamera,
  followDistance,
  headingAt,
  headingYaw,
  nextNodeS,
} from './camera.ts';
import { buildLayout, type LayoutViewport } from './layout.ts';
import { cameraPosition, projectPoint, type CameraFrame, type Vec3 } from './math.ts';
import { projectWorld } from './project.ts';

const PHONE: LayoutViewport = { width: 393, height: 620, hudTop: 44, hudBottom: 136 };
const route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> = {
  geometry: seedDay1.geometry as [number, number][],
  elevation: seedDay1.elevation as [number, number][],
  legs: seedDay1.legs,
};
const seed = buildLayout({
  dayId: 'dia-1',
  stops: gemeoStops(),
  route,
  place: readPlace(route),
  viewport: PHONE,
});
const flat = buildLayout({
  dayId: 'plano',
  stops: [
    makeStop({ kind: 'origin', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'nature', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'hotel' }),
  ],
  route: null,
  place: null,
  viewport: PHONE,
});

/** O carro do hatch na escala da cena, como uma caixa deitada na tangente do caminho. */
function carBox(layout: typeof flat, s: number): Vec3[] {
  const p = layout.pathAt(s);
  const k = carScale(FOLLOW_NEAR);
  const L = 4.62 * k;
  const H = 1.56 * k;
  const W = 1.7 * k;
  const nx = -p.tz;
  const nz = p.tx;
  const out: Vec3[] = [];
  for (const a of [-L / 2, L / 2]) {
    for (const b of [-W / 2, W / 2]) {
      for (const h of [0, H]) {
        out.push([p.x + p.tx * a + nx * b, p.y + h, p.z + p.tz * a + nz * b]);
      }
    }
  }
  return out;
}

describe('a câmera que segue o carro', () => {
  it('parado, o carro ocupa cerca de um quinto da altura da tela e cai no terço de baixo', () => {
    for (const layout of [flat, seed]) {
      for (const node of layout.nodes) {
        const frame = followCamera({ layout, s: node.s, nextS: null, parked: true });
        const aspect = PHONE.width / PHONE.height;
        const ys = carBox(layout, node.s).map((c) => projectPoint(frame, aspect, c).y);
        const height = (Math.max(...ys) - Math.min(...ys)) / 2;
        expect(height).toBeGreaterThan(0.15);
        expect(height).toBeLessThan(0.27);
        const p = layout.pathAt(node.s);
        const car = projectPoint(frame, aspect, [p.x, p.y, p.z]);
        expect(car.y).toBeCloseTo(CAR_SCREEN_Y, 1);
        expect(Math.abs(car.x)).toBeLessThan(0.35);
        expect(car.depth).toBeGreaterThan(0);
      }
    }
  });

  it('atrás do carro e alta, olhando para a próxima parada', () => {
    const s = flat.nodes[0]!.s;
    const nextS = flat.nodes[1]!.s;
    const frame = followCamera({ layout: flat, s, nextS, parked: true });
    expect(frame.tilt).toBe(FOLLOW_TILT);
    const p = flat.pathAt(s);
    const n = flat.pathAt(nextS);
    const dir = headingAt(flat, s, nextS);
    // a direção é a reta até o próximo nó, e o yaw põe a câmera atrás dela
    expect(dir.x * (n.x - p.x) + dir.z * (n.z - p.z)).toBeGreaterThan(0);
    expect(frame.yaw).toBeCloseTo(headingYaw(dir), 9);
    const eye = cameraPosition(frame);
    const along = (q: readonly number[]) => (q[0]! - p.x) * dir.x + (q[2]! - p.z) * dir.z;
    expect(along(eye)).toBeLessThan(0);
    expect(eye[1]).toBeGreaterThan(p.y + 20);
    expect(along(frame.target)).toBeGreaterThan(0);
    expect(aheadOf(FOLLOW_NEAR, FOLLOW_TILT, 30)).toBeGreaterThan(0);
    // no último nó, a direção é a da estrada
    const last = flat.nodes[2]!.s;
    const t = flat.pathAt(last);
    const tail = headingAt(flat, last, null);
    expect(tail.x * t.tx + tail.z * t.tz).toBeGreaterThan(0.99);
  });

  it('em movimento recua até a estrada caber, com um teto; parado, não recua', () => {
    expect(followDistance(null, false)).toBe(FOLLOW_NEAR);
    expect(followDistance(100, true)).toBe(FOLLOW_NEAR);
    expect(followDistance(10, false)).toBe(FOLLOW_NEAR);
    expect(followDistance(50, false)).toBeCloseTo(50 * FOLLOW_GAP_K, 6);
    expect(followDistance(500, false)).toBe(FOLLOW_FAR);
    const far = followCamera({ layout: flat, s: 0, nextS: 500, parked: false });
    expect(far.distance).toBe(FOLLOW_FAR);
  });

  it('a caminho de uma parada que cabe no recuo, o próximo nó entra na cena', () => {
    const aspect = PHONE.width / PHONE.height;
    for (const layout of [flat, seed]) {
      for (let i = 0; i < layout.nodes.length - 1; i++) {
        const a = layout.nodes[i]!;
        const b = layout.nodes[i + 1]!;
        const gap = b.s - a.s;
        if (gap * FOLLOW_GAP_K > FOLLOW_FAR) continue;
        // logo depois de sair do nó
        const s = a.s + 2;
        const frame = followCamera({ layout, s, nextS: nextNodeS(layout.nodes, s), parked: false });
        const p = projectPoint(frame, aspect, b.position);
        expect(p.depth).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(1);
        expect(p.y).toBeGreaterThan(-1);
        expect(Math.abs(p.x)).toBeLessThan(1.1);
      }
    }
  });

  it('a próxima parada longe demais fica fora da cena, à frente (a pílula presa ao topo)', () => {
    const s = seed.nodes[0]!.s + 2;
    const frame = followCamera({ layout: seed, s, nextS: nextNodeS(seed.nodes, s), parked: false });
    const next = seed.nodes[1]!;
    const p = projectWorld(frame, PHONE, next.position);
    expect(p.depth).toBeGreaterThan(0);
    expect(p.visible).toBe(false);
    expect(p.y).toBeLessThan(0);
  });

  it('a curiosidade mergulha: mais perto e mais baixa, olhando o carro', () => {
    const dive = diveCamera(flat, 10, nextNodeS(flat.nodes, 10));
    expect(dive.distance).toBe(DIVE.distance);
    expect(dive.distance).toBeLessThan(FOLLOW_NEAR);
    expect(dive.tilt).toBeLessThan(FOLLOW_TILT);
    expect(dive.target).toEqual([flat.pathAt(10).x, flat.pathAt(10).y, flat.pathAt(10).z]);
  });

  it('o próximo nó e "no nó"', () => {
    const nodes = flat.nodes;
    expect(nextNodeS(nodes, nodes[0]!.s)).toBe(nodes[1]!.s);
    expect(nextNodeS(nodes, nodes[2]!.s)).toBeNull();
    expect(atNode(nodes, nodes[1]!.s + 0.3)).toBe(true);
    expect(atNode(nodes, nodes[1]!.s + 3)).toBe(false);
  });

  it('o carro e os anéis crescem só quando a câmera recua', () => {
    expect(carScale(FOLLOW_NEAR)).toBe(CAR_SCALE.near);
    expect(carScale(DIVE.distance)).toBe(CAR_SCALE.near);
    expect(carScale(FOLLOW_FAR)).toBeGreaterThan(CAR_SCALE.near);
    expect(carScale(600)).toBe(CAR_SCALE.far);
    expect(farness(FOLLOW_NEAR)).toBe(0);
    expect(farness(600)).toBe(1);
  });
});

describe('a suavização do enquadramento', () => {
  const a: CameraFrame = { target: [0, 0, 0], distance: 400, tilt: 1.1, yaw: 0, fov: 30 };
  const b: CameraFrame = { target: [10, 2, 60], distance: 55, tilt: 0.87, yaw: 2.5, fov: 30 };

  it('com k = 1 corta direto para o desejado (reduzir movimento, o primeiro quadro)', () => {
    const r = approachFrame(a, b, 1);
    expect(r.moving).toBe(false);
    expect(r.view).toBe(b);
  });

  it('com k menor anda uma fração e avisa que ainda está a caminho', () => {
    const r = approachFrame(a, b, 0.5);
    expect(r.moving).toBe(true);
    expect(r.view.distance).toBeCloseTo(227.5, 6);
    expect(r.view.target[2]).toBeCloseTo(30, 6);
    expect(r.view.yaw).toBeCloseTo(1.25, 6);
    // chegando perto, para
    let v = r.view;
    for (let i = 0; i < 60; i++) v = approachFrame(v, b, 0.5).view;
    expect(approachFrame(v, b, 0.5).moving).toBe(false);
  });

  it('um `yaw` ausente vale zero (o quadro parado do dia inteiro)', () => {
    const wide: CameraFrame = { target: [0, 0, 50], distance: 300, tilt: 1.1, fov: 30 };
    const eye = cameraPosition(wide);
    expect(eye[0]).toBeCloseTo(0, 9);
    expect(eye[2]).toBeGreaterThan(50);
  });
});
