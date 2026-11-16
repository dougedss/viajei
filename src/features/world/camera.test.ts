import { describe, expect, it } from 'vitest';
import seedDay1 from '@/lib/geo/__fixtures__/seed-dia-1.json';
import type { DayRoute } from '@/lib/db/schema.ts';
import { readPlace } from '@/lib/geo/index.ts';
import { makeStop } from '@/test/factories.ts';
import { gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import { MINIATURE_BOX } from '@/art/stops/types.ts';
import {
  aheadOf,
  approachFrame,
  atNode,
  CAR_FRACTION,
  CAR_LENGTH,
  CAR_SCALE,
  carScaleFor,
  CLOSE_MS,
  closeActive,
  diveCamera,
  DIVE,
  farness,
  FOLLOW_FAR,
  FOLLOW_FOV,
  FOLLOW_GAP_K,
  FOLLOW_NEAR,
  FOLLOW_TILT,
  followCamera,
  followDistance,
  headingAt,
  headingYaw,
  nextNodeS,
  REST_FOV,
  REST_TILT,
  REST_YAW,
  restCamera,
  tapCar,
  arriveClose,
  wantedFrame,
  type RestViewport,
} from './camera.ts';
import { buildLayout, type WorldLayout } from './layout.ts';
import { cameraPosition, projectPoint, type CameraFrame, type Vec3 } from './math.ts';
import { HUD_TOP, PILL_LIFT, pillInView, projectNodes, projectWorld } from './project.ts';

const route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> = {
  geometry: seedDay1.geometry as [number, number][],
  elevation: seedDay1.elevation as [number, number][],
  legs: seedDay1.legs,
};
const seed = buildLayout({ dayId: 'dia-1', stops: gemeoStops(), route, place: readPlace(route) });
const flat = buildLayout({
  dayId: 'plano',
  stops: [
    makeStop({ kind: 'origin', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'nature', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'hotel' }),
  ],
  route: null,
  place: null,
});
const two = buildLayout({
  dayId: 'dois',
  stops: [makeStop({ kind: 'origin', travel_minutes_to_next: 25 }), makeStop({ kind: 'food' })],
  route: null,
  place: null,
});
const eight = buildLayout({
  dayId: 'oito',
  stops: Array.from({ length: 8 }, (_, i) =>
    makeStop({
      kind: i === 0 ? 'origin' : i === 7 ? 'hotel' : 'nature',
      travel_minutes_to_next: 90,
    }),
  ),
  route: null,
  place: null,
});

/** os palcos da fase 22: o Safari sem instalar (563 px), o app instalado (620) e o Android menor */
const STAGES = [
  { width: 393, height: 563 },
  { width: 393, height: 620 },
  { width: 360, height: 640 },
] as const;
/**
 * a altura medida do que está sobre o pé do palco: nada, a barra, o cartão pequeno, o grande, e o
 * pior caso (o cartão de posição mais o "Agora", ~400 px num palco de 564, como o iPhone 15 do
 * Playwright: sobram ~120 px para o dia inteiro, e ele tem de caber)
 */
const INSETS = [0, 136, 170, 250, 400] as const;
const viewportOf = (stage: { width: number; height: number }, inset: number): RestViewport => ({
  width: stage.width,
  height: stage.height,
  hudTop: HUD_TOP,
  hudBottom: inset,
});

/** O carro do hatch na escala da cena, como uma caixa deitada na tangente do caminho. */
function carBox(layout: WorldLayout, s: number, k: number): Vec3[] {
  const p = layout.pathAt(s);
  const L = CAR_LENGTH * k;
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

describe('o quadro de repouso: o dia inteiro na tela', () => {
  it.each(STAGES.flatMap((s) => INSETS.map((i) => [s.width, s.height, i] as const)))(
    'em %i × %i com %i px cobertos, todas as pílulas e o caminho inteiro cabem na área útil',
    (width, height, inset) => {
      for (const layout of [two, flat, seed, eight]) {
        const viewport = viewportOf({ width, height }, inset);
        const rest = restCamera(layout, viewport);
        expect(rest.tilt).toBe(REST_TILT);
        expect(rest.fov).toBe(REST_FOV);
        expect(rest.yaw).toBe(REST_YAW);
        // cada pílula em cena, pela mesma regra do HUD (a âncora, com a altura da pílula de folga)
        for (const pin of projectNodes(layout, viewport, rest)) {
          const node = layout.nodes.find((n) => n.stop_id === pin.stop_id);
          expect(node).toBeDefined();
          if (!node) continue;
          const p = projectWorld(rest, viewport, [
            node.position[0],
            node.position[1] + PILL_LIFT,
            node.position[2],
          ]);
          expect(pillInView(p, viewport, inset), `pílula ${pin.stop_id}`).toBe(true);
        }
        // o caminho inteiro, o fundo da base e o alto de cada peça, dentro do palco
        const inside = (pt: Vec3) => {
          const q = projectWorld(rest, viewport, pt);
          return q.depth > 0 && q.x >= 0 && q.x <= width && q.y >= HUD_TOP && q.y <= height - inset;
        };
        for (const p of layout.path.filter((_, i) => i % 25 === 0)) {
          expect(inside([p.x, p.y, p.z])).toBe(true);
          expect(inside([layout.bounds.x0, p.y + 5, p.z])).toBe(true);
          expect(inside([layout.bounds.x1, p.y + 5, p.z])).toBe(true);
        }
        const { bounds, yRange } = layout;
        for (const x of [bounds.x0, bounds.x1])
          for (const z of [bounds.z0, bounds.z1]) expect(inside([x, yRange.y0, z])).toBe(true);
        for (const n of layout.nodes) {
          const box = MINIATURE_BOX[n.kind];
          const far = n.position[0] + n.side * (layout.roadHalfWidth + 2.5 + box.d);
          expect(inside([far, n.position[1] + box.h, n.position[2] + box.w / 2])).toBe(true);
          expect(inside([far, n.position[1] + box.h, n.position[2] - box.w / 2])).toBe(true);
        }
      }
    },
  );

  it('a estrada sobe na tela: a saída embaixo, a chegada em cima, e a caixa centrada na área útil', () => {
    for (const layout of [flat, seed]) {
      const viewport = viewportOf(STAGES[1], 136);
      const rest = restCamera(layout, viewport);
      const first = layout.nodes[0]!;
      const last = layout.nodes.at(-1)!;
      const a = projectWorld(rest, viewport, first.position);
      const b = projectWorld(rest, viewport, last.position);
      expect(a.y).toBeGreaterThan(b.y);
      // o centro vertical do que há na maquete (o fundo da base e o alto das coisas) no centro da área útil
      const ys: number[] = [];
      for (const x of [layout.bounds.x0, layout.bounds.x1])
        for (const z of [layout.bounds.z0, layout.bounds.z1])
          ys.push(projectWorld(rest, viewport, [x, layout.yRange.y0, z]).y);
      for (const p of layout.path.filter((_, i) => i % 25 === 0))
        for (const x of [layout.bounds.x0, layout.bounds.x1])
          ys.push(projectWorld(rest, viewport, [x, p.y + 5, p.z]).y);
      for (const n of layout.nodes) {
        const box = MINIATURE_BOX[n.kind];
        ys.push(
          projectWorld(rest, viewport, [n.position[0], n.position[1] + box.h, n.position[2]]).y,
        );
      }
      const center = (Math.min(...ys) + Math.max(...ys)) / 2;
      const want = (HUD_TOP + 8 + (viewport.height - 136 - 8)) / 2;
      expect(Math.abs(center - want)).toBeLessThan(10);
    }
  });

  it('a altura medida só move a câmera: com um cartão na tela a maquete fica menor e mais alta', () => {
    const base = restCamera(seed, viewportOf(STAGES[0], 136));
    const card = restCamera(seed, viewportOf(STAGES[0], 250));
    expect(card.distance).toBeGreaterThan(base.distance);
    const low = projectWorld(base, STAGES[0], seed.nodes[0]!.position).y;
    const high = projectWorld(card, STAGES[0], seed.nodes[0]!.position).y;
    expect(high).toBeLessThan(low);
    expect(high).toBeLessThan(563 - 250);
  });

  it('o carro é maior que a escala no repouso: a fração da altura do palco em todo nó', () => {
    for (const layout of [two, flat, seed, eight]) {
      for (const stage of STAGES) {
        const viewport = viewportOf(stage, 136);
        const rest = restCamera(layout, viewport);
        const k = carScaleFor(rest);
        expect(k).toBeGreaterThan(CAR_SCALE.near);
        expect(k).toBeLessThanOrEqual(CAR_SCALE.max);
        for (const node of layout.nodes) {
          const pts = carBox(layout, node.s, k).map((c) => projectWorld(rest, viewport, c));
          const w = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x));
          const h = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
          const size = Math.max(w, h) / stage.height;
          expect(size, `nó ${String(node.index)}`).toBeGreaterThan(0.05);
          expect(size).toBeLessThan(0.14);
        }
      }
    }
  });

  it('a escala do carro sai do enquadramento, não da distância em si', () => {
    // no alvo da câmera o carro ocupa CAR_FRACTION da altura: a conta fecha para qualquer palco
    const frame = { distance: 370, fov: REST_FOV };
    const visible = 2 * frame.distance * Math.tan((REST_FOV / 2) * (Math.PI / 180));
    expect(carScaleFor(frame) * CAR_LENGTH).toBeCloseTo(CAR_FRACTION * visible, 6);
    // de perto e no mergulho, a escala natural de perto
    expect(carScaleFor({ distance: FOLLOW_NEAR, fov: FOLLOW_FOV })).toBe(CAR_SCALE.near);
    expect(carScaleFor({ distance: DIVE.distance, fov: FOLLOW_FOV })).toBe(CAR_SCALE.near);
    expect(carScaleFor({ distance: 5000, fov: REST_FOV })).toBe(CAR_SCALE.max);
    expect(farness({ distance: FOLLOW_NEAR, fov: FOLLOW_FOV })).toBe(0);
    expect(farness({ distance: 5000, fov: REST_FOV })).toBe(1);
    expect(farness(frame)).toBeGreaterThan(0.3);
  });
});

describe('o modo de perto, ao tocar no carro', () => {
  const rest = restCamera(flat, viewportOf(STAGES[1], 136));
  const base = {
    rest,
    layout: flat,
    s: flat.nodes[0]!.s,
    nextS: flat.nodes[1]!.s,
    parked: true,
    diving: false,
    reducedMotion: false,
  };

  it('sem toque, o repouso; com o toque, a câmera da fase 14; passado o tempo, o repouso de novo', () => {
    expect(wantedFrame({ ...base, close: null, now: 1000 }).mode).toBe('repouso');
    expect(wantedFrame({ ...base, close: null, now: 1000 }).frame).toBe(rest);
    const close = tapCar(1000);
    expect(close).toEqual({ until: 1000 + CLOSE_MS, arrived: false, limit: 1000 + 30_000 });
    expect(close?.until).toBe(1000 + CLOSE_MS);
    const near = wantedFrame({ ...base, close, now: 1200 });
    expect(near.mode).toBe('perto');
    expect(near.frame).toEqual(
      followCamera({ layout: flat, s: base.s, nextS: base.nextS, parked: true }),
    );
    expect(closeActive(close, 1000 + CLOSE_MS - 1)).toBe(true);
    // chegou: 6 s depois da chegada, o repouso
    const arrived = arriveClose(close, 1500);
    expect(closeActive(arrived, 1500 + CLOSE_MS - 1)).toBe(true);
    expect(closeActive(arrived, 1500 + CLOSE_MS)).toBe(false);
    expect(wantedFrame({ ...base, close: arrived, now: 1500 + CLOSE_MS }).mode).toBe('repouso');
    // um toque de novo estende; um toque fora (close = null) volta na hora
    expect(tapCar(5000)?.until).toBe(5000 + CLOSE_MS);
    expect(wantedFrame({ ...base, close: null, now: 5100 }).mode).toBe('repouso');
  });

  it('os 6 s contam da chegada da câmera, uma vez por toque (fase 24: a máquina lenta)', () => {
    const close = tapCar(1000);
    // a câmera levou 4 s para chegar: o modo dura até 6 s depois disso
    // enquanto não chega, o modo continua além dos 6 s do toque (a máquina lenta), até o teto
    expect(closeActive(close, 1000 + CLOSE_MS + 3000)).toBe(true);
    expect(closeActive(close, 1000 + 30_000)).toBe(false);
    const arrived = arriveClose(close, 5000);
    expect(arrived).toEqual({ until: 5000 + CLOSE_MS, arrived: true, limit: 1000 + 30_000 });
    // chegou de novo no mesmo toque: não estende de novo
    expect(arriveClose(arrived, 9000)).toBe(arrived);
    // chegou logo: 6 s da chegada; e nunca encurta o que um toque mais novo deu
    expect(arriveClose(tapCar(1000), 1200)?.until).toBe(1200 + CLOSE_MS);
    expect(arriveClose({ until: 20_000, arrived: false, limit: 40_000 }, 1200)?.until).toBe(20_000);
    expect(arriveClose(null, 1000)).toBeNull();
  });

  it('em movimento no modo de perto, a câmera recua como na fase 14', () => {
    const close = tapCar(0);
    const moving = wantedFrame({ ...base, close, now: 100, parked: false, s: base.s + 2 });
    expect(moving.mode).toBe('perto');
    expect(moving.frame.distance).toBeGreaterThan(FOLLOW_NEAR);
  });

  it('a curiosidade mergulha a partir do repouso, mesmo no modo de perto, e não com reduzir movimento', () => {
    const dive = wantedFrame({ ...base, close: null, now: 0, diving: true });
    expect(dive.mode).toBe('mergulho');
    expect(dive.frame.distance).toBe(DIVE.distance);
    const over = wantedFrame({ ...base, close: tapCar(0), now: 10, diving: true });
    expect(over.mode).toBe('mergulho');
    const reduced = wantedFrame({
      ...base,
      close: null,
      now: 0,
      diving: true,
      reducedMotion: true,
    });
    expect(reduced.mode).toBe('repouso');
  });

  it('com reduzir movimento o modo de perto continua existindo (a câmera só corta)', () => {
    const r = wantedFrame({ ...base, close: tapCar(0), now: 10, reducedMotion: true });
    expect(r.mode).toBe('perto');
  });
});

describe('a câmera da fase 14, que virou o modo de perto', () => {
  it('parado, o carro ocupa cerca de um quinto da altura da tela e cai no terço de baixo', () => {
    const PHONE = { width: 393, height: 620 };
    for (const layout of [flat, seed]) {
      for (const node of layout.nodes) {
        const frame = followCamera({ layout, s: node.s, nextS: null, parked: true });
        const aspect = PHONE.width / PHONE.height;
        const k = carScaleFor(frame);
        const ys = carBox(layout, node.s, k).map((c) => projectPoint(frame, aspect, c).y);
        const height = (Math.max(...ys) - Math.min(...ys)) / 2;
        expect(height).toBeGreaterThan(0.15);
        expect(height).toBeLessThan(0.27);
        const p = layout.pathAt(node.s);
        const car = projectPoint(frame, aspect, [p.x, p.y, p.z]);
        expect(car.y).toBeCloseTo(-0.4, 1);
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
    expect(frame.fov).toBe(FOLLOW_FOV);
    const p = flat.pathAt(s);
    const n = flat.pathAt(nextS);
    const dir = headingAt(flat, s, nextS);
    expect(dir.x * (n.x - p.x) + dir.z * (n.z - p.z)).toBeGreaterThan(0);
    expect(frame.yaw).toBeCloseTo(headingYaw(dir), 9);
    const eye = cameraPosition(frame);
    const along = (q: readonly number[]) => (q[0]! - p.x) * dir.x + (q[2]! - p.z) * dir.z;
    expect(along(eye)).toBeLessThan(0);
    expect(eye[1]).toBeGreaterThan(p.y + 20);
    expect(along(frame.target)).toBeGreaterThan(0);
    expect(aheadOf(FOLLOW_NEAR, FOLLOW_TILT, 30)).toBeGreaterThan(0);
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
});

describe('a suavização do enquadramento', () => {
  const a: CameraFrame = { target: [0, 0, 0], distance: 400, tilt: 1.1, yaw: 0, fov: 26 };
  const b: CameraFrame = { target: [10, 2, 60], distance: 55, tilt: 0.87, yaw: 2.5, fov: 30 };

  it('com k = 1 corta direto para o desejado (reduzir movimento, o primeiro quadro)', () => {
    const r = approachFrame(a, b, 1);
    expect(r.moving).toBe(false);
    expect(r.view).toBe(b);
  });

  it('com k menor anda uma fração (inclusive o campo de visão) e avisa que ainda está a caminho', () => {
    const r = approachFrame(a, b, 0.5);
    expect(r.moving).toBe(true);
    expect(r.view.distance).toBeCloseTo(227.5, 6);
    expect(r.view.target[2]).toBeCloseTo(30, 6);
    expect(r.view.yaw).toBeCloseTo(1.25, 6);
    expect(r.view.fov).toBeCloseTo(28, 6);
    let v = r.view;
    for (let i = 0; i < 60; i++) v = approachFrame(v, b, 0.5).view;
    expect(approachFrame(v, b, 0.5).moving).toBe(false);
  });

  it('o giro vai pelo arco menor: do repouso (π) para atrás do carro nunca dá a volta inteira', () => {
    const from: CameraFrame = { ...a, yaw: Math.PI };
    const to: CameraFrame = { ...b, yaw: -Math.PI + 0.4 };
    const r = approachFrame(from, to, 0.5);
    // o caminho curto é 0,4 rad adiante de π, não 2π − 0,4 para trás
    expect(r.view.yaw).toBeCloseTo(Math.PI + 0.2, 6);
  });

  it('um `yaw` ausente vale zero; o repouso olha para +z (a câmera antes do começo do dia)', () => {
    const wide: CameraFrame = { target: [0, 0, 50], distance: 300, tilt: 1.1, fov: 30 };
    expect(cameraPosition(wide)[2]).toBeGreaterThan(50);
    const rest = restCamera(flat, viewportOf(STAGES[1], 136));
    expect(cameraPosition(rest)[2]).toBeLessThan(rest.target[2]);
  });
});
