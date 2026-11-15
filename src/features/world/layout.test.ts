import { describe, expect, it } from 'vitest';
import seedDay1 from '@/lib/geo/__fixtures__/seed-dia-1.json';
import { readPlace, type PlaceReading } from '@/lib/geo/index.ts';
import type { DayRoute } from '@/lib/db/schema.ts';
import { makeStop } from '@/test/factories.ts';
import { gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import { MINIATURE_BOX, MINIATURE_ROAD_GAP } from '@/art/stops/types.ts';
import { indexRoute, projectOntoRoute } from '@/lib/geo/project.ts';
import {
  BASE_DEPTH,
  bendsFor,
  BLOCKS_RADIUS,
  buildLayout,
  LAKE_RX,
  MAX_PLACES,
  MIN_VIRTUAL_KM,
  NODE_GAP,
  SIDE_REACH,
  STUB,
  STUB_SINGLE,
  X_HALF,
  X_HALF_MAX,
  Z_MAX,
  Z_MIN,
  type LayoutInput,
  type WorldLayout,
} from './layout.ts';

const route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> = {
  geometry: seedDay1.geometry as [number, number][],
  elevation: seedDay1.elevation as [number, number][],
  legs: seedDay1.legs,
};
let placeCache: PlaceReading | null = null;
const place = (): PlaceReading => (placeCache ??= readPlace(route));

function dayOne(over: Partial<LayoutInput> = {}): LayoutInput {
  return { dayId: 'dia-1', stops: gemeoStops(), route, place: place(), ...over };
}

/** A proporção da caixa da maquete (largura / comprimento), a do esboço é 64 / 132 ≈ 0,49. */
const aspectOf = (l: WorldLayout) => (l.bounds.x1 - l.bounds.x0) / (l.bounds.z1 - l.bounds.z0);

/** O retângulo (no chão) de uma peça: a frente ao longo de z (a peça vira para a estrada), o fundo em x. */
function footprint(l: WorldLayout, stopId: string) {
  const m = l.features.find((f) => f.kind === 'miniature' && f.stop_id === stopId);
  if (m?.kind !== 'miniature') throw new Error('sem peça');
  const box = MINIATURE_BOX[m.stop];
  return { x0: m.x - box.d / 2, x1: m.x + box.d / 2, z0: m.z - box.w / 2, z1: m.z + box.w / 2 };
}

/** Quantas vezes o caminho cruza o eixo x = 0 entre dois `s`. */
function crossings(l: WorldLayout, s0: number, s1: number): number {
  let n = 0;
  let last = Math.sign(l.pathAt(s0).x);
  for (let s = s0 + 0.5; s <= s1; s += 0.5) {
    const sign = Math.sign(l.pathAt(s).x);
    if (sign !== 0 && sign !== last) {
      n++;
      last = sign;
    }
  }
  return n;
}

describe('layout com rota real (dia 1 do seed)', () => {
  const layout = buildLayout(dayOne());

  it('tem um nó por parada, na quilometragem dos trechos, alternando os lados do S', () => {
    expect(layout.hasRoute).toBe(true);
    expect(layout.nodes).toHaveLength(4);
    expect(layout.nodes.map((n) => n.side)).toEqual([-1, 1, -1, 1]);
    expect(layout.nodes[0]?.km).toBe(0);
    expect(layout.nodes[1]?.km).toBeCloseTo(448.063, 2);
    expect(layout.nodes[3]?.km).toBeCloseTo(478.85, 1);
    expect(layout.realTotalKm).toBeCloseTo(layout.totalKm, 6);
    for (const node of layout.nodes) {
      expect(Math.abs(node.position[0])).toBeCloseTo(layout.xHalf, 5);
      expect(layout.xHalf).toBeGreaterThanOrEqual(X_HALF);
      expect(layout.xHalf).toBeLessThanOrEqual(X_HALF_MAX);
      // o nó está no caminho, e o caminho ali tem a quilometragem do nó
      const p = layout.pathAt(node.s);
      expect(p.x).toBeCloseTo(node.position[0], 3);
      expect(p.z).toBeCloseTo(node.position[2], 3);
      expect(p.km).toBeCloseTo(node.km, 1);
    }
  });

  it('s cresce com km, e km → s → km volta ao mesmo lugar', () => {
    let last = -1;
    for (const p of layout.path) {
      expect(p.km).toBeGreaterThanOrEqual(last - 1e-9);
      last = p.km;
    }
    for (const km of [0, 10, 120, 300, 448, 478]) {
      const s = layout.kmToS(km);
      expect(layout.sToKm(s)).toBeCloseTo(km, 1);
    }
  });

  it('a serra rende mais caminho por km do que o plano', () => {
    // entre Papanduva e a serra o perfil varia; o trecho final é curto e plano
    const sPerKmSerra = (layout.kmToS(440) - layout.kmToS(400)) / 40;
    const sPerKmPlano = (layout.kmToS(100) - layout.kmToS(60)) / 40;
    expect(sPerKmSerra).toBeGreaterThan(sPerKmPlano);
  });

  it('fractionToS cobre do primeiro ao último nó com coordenada', () => {
    expect(layout.fractionToS(0)).toBeCloseTo(layout.nodes[0]?.s ?? -1, 6);
    expect(layout.fractionToS(1)).toBeCloseTo(layout.nodes[3]?.s ?? -1, 6);
    expect(layout.fractionToS(-2)).toBe(layout.fractionToS(0));
    expect(layout.fractionToS(5)).toBe(layout.fractionToS(1));
    const half = layout.fractionToS(0.5);
    expect(half).toBeGreaterThan(layout.fractionToS(0.4));
    expect(half).toBeLessThan(layout.fractionToS(0.6));
  });

  it('o relevo segue o perfil de altitude e a estrada fica suave', () => {
    const ys = layout.path.map((p) => p.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5);
    for (let i = 1; i < layout.path.length; i++) {
      expect(Math.abs((ys[i] ?? 0) - (ys[i - 1] ?? 0))).toBeLessThan(0.6);
    }
  });

  it('as faixas vêm dos segmentos da leitura do lugar e cobrem o caminho inteiro', () => {
    expect(layout.bands.length).toBeGreaterThanOrEqual(3);
    expect(layout.bands[0]?.from_km).toBe(0);
    expect(layout.bands.at(-1)?.to_km).toBeCloseTo(layout.totalKm, 6);
    for (let i = 1; i < layout.bands.length; i++) {
      expect(layout.bands[i]?.from_km).toBeCloseTo(layout.bands[i - 1]?.to_km ?? -1, 6);
    }
    const kinds = new Set(layout.bands.map((b) => b.kind));
    expect(kinds.has('serra')).toBe(true);
    for (const km of [0, 50, 250, 470]) {
      const w = layout.weightsAtKm(km);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
    const mid = layout.bands[0]!;
    const w = layout.weightsAtKm((mid.from_km + mid.to_km) / 2);
    expect(w[mid.kind]).toBeGreaterThan(0.9);
  });

  it('as curiosidades ficam no s do seu km, em ordem', () => {
    expect(layout.curiosities.length).toBeGreaterThan(0);
    let last = -1;
    for (const c of layout.curiosities) {
      expect(c.s).toBeGreaterThanOrEqual(last);
      expect(c.s).toBeCloseTo(layout.kmToS(c.km), 6);
      last = c.s;
    }
  });

  it('cada parada vira uma peça do tipo, fora da estrada, do lado de fora do S e com um piso plano', () => {
    const minis = layout.features.filter((f) => f.kind === 'miniature');
    expect(minis.map((m) => m.stop)).toEqual(['origin', 'nature', 'hotel', 'food']);
    for (const node of layout.nodes) {
      const m = minis.find((f) => f.stop_id === node.stop_id)!;
      // do lado de fora do S, com a caixa inteira fora da estrada e a folga nova
      expect(Math.sign(m.x - node.position[0])).toBe(node.side);
      const box = MINIATURE_BOX[m.stop];
      expect(Math.abs(m.x - node.position[0]) - box.d / 2).toBeCloseTo(
        layout.roadHalfWidth + MINIATURE_ROAD_GAP,
        6,
      );
      // centrada no nó, dentro da faixa das peças e da base
      expect(m.z).toBeCloseTo(node.position[2], 6);
      expect(Math.abs(m.x) + box.d / 2).toBeLessThanOrEqual(layout.xHalf + SIDE_REACH);
      // virada para a estrada: a frente (+z local) aponta para o lado oposto ao de fora
      expect(Math.sign(Math.sin(m.angle))).toBe(-node.side);
      // o piso: o terreno fica na altura do nó em volta da peça
      const pad = layout.pads.find((p) => Math.abs(p.x - m.x) < 1e-6 && Math.abs(p.z - m.z) < 1e-6);
      expect(pad).toBeDefined();
      expect(pad!.y).toBeCloseTo(node.position[1], 6);
      for (const [dx, dz] of [
        [pad!.r * 0.6, 0],
        [0, pad!.r * 0.6],
        [-pad!.r * 0.5, pad!.r * 0.5],
      ]) {
        expect(Math.abs(layout.terrainAt(m.x + dx!, m.z + dz!).h - node.position[1])).toBeLessThan(
          0.05,
        );
      }
    }
    // as quadras só em volta do hotel e do restaurante (cidade, hotel e comida), no raio novo
    const blocks = layout.features.filter((f) => f.kind === 'blocks');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.radius).toBe(BLOCKS_RADIUS);
    expect(layout.features.some((f) => f.kind === 'lake')).toBe(false);
  });

  it('o terreno é contínuo, segue a estrada de perto e não inventa água', () => {
    const node = layout.nodes[1]!;
    const near = layout.terrainAt(node.position[0] + 1, node.position[2]);
    expect(Math.abs(near.h - node.position[1])).toBeLessThan(0.6);
    expect(near.water).toBe('none');
    const far = layout.terrainAt(node.position[0] - 24, node.position[2]);
    expect(Number.isFinite(far.h)).toBe(true);
    expect(Object.values(far.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(layout.seaLevel).toBeNull();
    // a caixa da maquete cobre o relevo com folga embaixo e em cima
    const ys = layout.path.map((p) => p.y);
    expect(layout.yRange.y0).toBeLessThan(Math.min(...ys) - BASE_DEPTH + 1e-6);
    expect(layout.yRange.y1).toBeGreaterThan(Math.max(...ys));
  });

  it('é determinístico pela semente do dia e muda com outro dia', () => {
    const again = buildLayout(dayOne());
    expect(again.seed).toBe(layout.seed);
    expect(again.terrainAt(20, 70).h).toBe(layout.terrainAt(20, 70).h);
    const other = buildLayout(dayOne({ dayId: 'dia-2' }));
    expect(other.seed).not.toBe(layout.seed);
    expect(other.path.map((p) => [p.x, p.z])).toEqual(layout.path.map((p) => [p.x, p.z]));
    expect(other.terrainAt(20, 70).h).not.toBe(layout.terrainAt(20, 70).h);
  });

  it('as cidades de passagem: até três, as maiores, nunca no trecho de uma parada, do lado de fora', () => {
    const reading = place();
    expect(reading.places.length).toBeGreaterThan(3);
    expect(layout.places.length).toBeLessThanOrEqual(MAX_PLACES);
    expect(layout.places.length).toBeGreaterThan(0);
    const stopKms = layout.nodes.map((n) => n.km);
    // nenhuma cidade no trecho em que há uma parada com coordenada
    for (const p of layout.places) {
      const src = reading.places.find((q) => q.name === p.name && q.uf === p.uf)!;
      expect(src).toBeDefined();
      for (const km of stopKms) {
        const m = (km - layout.kmOffset) * 1000;
        expect(m < src.from_m - 1 || m > src.to_m + 1).toBe(true);
      }
      // no s do km dela (ou perto, se precisou desviar de uma peça), do lado de fora da curva
      expect(Math.abs(p.s - layout.kmToS(p.km))).toBeLessThanOrEqual(40);
      const q = layout.pathAt(p.s);
      expect(Math.sign(p.position[0] - q.x)).toBe(p.side);
      expect(p.side).toBe(q.x < 0 ? -1 : 1);
      for (const pad of layout.pads) {
        expect(Math.hypot(p.position[0] - pad.x, p.position[2] - pad.z)).toBeGreaterThan(pad.r);
      }
    }
    // as maiores: toda cidade que ficou de fora e não é de parada tem população menor ou igual
    const chosen = new Set(layout.places.map((p) => `${p.name}|${p.uf}`));
    const minPop = Math.min(...layout.places.map((p) => p.pop));
    for (const q of reading.places) {
      if (chosen.has(`${q.name}|${q.uf}`)) continue;
      const hasStop = stopKms.some((km) => {
        const m = (km - layout.kmOffset) * 1000;
        return m >= q.from_m - 1 && m <= q.to_m + 1;
      });
      if (!hasStop) expect(q.pop).toBeLessThanOrEqual(minPop);
    }
    // em ordem ao longo do dia
    for (let i = 1; i < layout.places.length; i++)
      expect(layout.places[i]!.s).toBeGreaterThan(layout.places[i - 1]!.s);
  });
});

describe('o traçado em retrato (fase 22)', () => {
  const day = (n: number, minutes: number, dayId = `t${String(n)}-${String(minutes)}`) =>
    buildLayout({
      dayId,
      stops: Array.from({ length: n }, (_, i) =>
        makeStop({
          kind: i === 0 ? 'origin' : i === n - 1 ? 'hotel' : i % 2 ? 'nature' : 'food',
          travel_minutes_to_next: minutes,
        }),
      ),
      route: null,
      place: null,
    });

  it.each([
    [2, 20],
    [2, 240],
    [4, 30],
    [4, 180],
    [8, 20],
    [8, 120],
  ])(
    'um dia de %i paradas com %i min entre elas cabe na proporção da maquete de mesa',
    (n, min) => {
      const l = day(n, min);
      const zEnd = (l.nodes.at(-1)?.position[2] ?? 0) - (l.nodes[0]?.position[2] ?? 0);
      expect(zEnd).toBeGreaterThanOrEqual(Z_MIN - 1e-6);
      expect(zEnd).toBeLessThanOrEqual(Z_MAX + 1e-6);
      expect(aspectOf(l)).toBeGreaterThan(0.45);
      expect(aspectOf(l)).toBeLessThan(0.8);
      expect(l.bounds.x1).toBeCloseTo(l.xHalf + SIDE_REACH, 6);
      expect(l.bounds.z0).toBeCloseTo(-(STUB + 8), 6);
      // a estrada e as peças inteiras dentro da base
      for (const p of l.path) {
        expect(p.x).toBeGreaterThan(l.bounds.x0);
        expect(p.x).toBeLessThan(l.bounds.x1);
        expect(p.z).toBeGreaterThanOrEqual(l.bounds.z0);
        expect(p.z).toBeLessThanOrEqual(l.bounds.z1);
      }
      for (const node of l.nodes) {
        const f = footprint(l, node.stop_id);
        expect(f.x0).toBeGreaterThanOrEqual(l.bounds.x0 - 1e-6);
        expect(f.x1).toBeLessThanOrEqual(l.bounds.x1 + 1e-6);
        expect(f.z0).toBeGreaterThanOrEqual(l.bounds.z0 - 1e-6);
        expect(f.z1).toBeLessThanOrEqual(l.bounds.z1 + 1e-6);
      }
    },
  );

  it('as peças não se cobrem nem cobrem a estrada', () => {
    for (const l of [day(4, 30), day(8, 20), day(8, 120), buildLayout(dayOne())]) {
      const boxes = l.nodes.map((n) => footprint(l, n.stop_id));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0;
          expect(apart, `peças ${String(i)} e ${String(j)}`).toBe(true);
        }
        // nenhum ponto da estrada (com a largura dela) dentro da peça
        const a = boxes[i]!;
        for (const p of l.path) {
          const inside =
            p.x + l.roadHalfWidth > a.x0 &&
            p.x - l.roadHalfWidth < a.x1 &&
            p.z > a.z0 &&
            p.z < a.z1;
          expect(inside, `a estrada em s=${p.s.toFixed(1)} na peça ${String(i)}`).toBe(false);
        }
      }
    }
  });

  it('um trecho longo entre duas paradas ganha três curvas; um curto, uma', () => {
    expect(bendsFor(20)).toBe(1);
    expect(bendsFor(71)).toBe(1);
    expect(bendsFor(72)).toBe(3);
    expect(bendsFor(119)).toBe(3);
    expect(bendsFor(120)).toBe(5);
    // um dia de duas paradas, mesmo curto, estica até Z_MIN e por isso vai e volta três vezes
    for (const long of [day(2, 20), day(2, 240)]) {
      const a = long.nodes[0]!;
      const b = long.nodes[1]!;
      expect(b.position[2] - a.position[2]).toBeGreaterThanOrEqual(Z_MIN - 1e-6);
      expect(crossings(long, a.s, b.s)).toBe(3);
    }
    // com várias paradas o trecho é curto: um S por trecho (os cruzamentos do dia são os dos trechos)
    const short = day(8, 20);
    expect(crossings(short, short.nodes[0]!.s, short.nodes[1]!.s)).toBe(1);
    const four = day(4, 60);
    expect(crossings(four, four.nodes[0]!.s, four.nodes.at(-1)!.s)).toBe(3);
    const long = day(2, 240);
    // a estrada continua suave nas juntas: a tangente nunca vira para trás
    for (const p of long.path) expect(p.tz).toBeGreaterThan(0);
  });

  it('o dia curto estica e o longo comprime, e o km continua indo e voltando', () => {
    const short = day(2, 20);
    const nat = NODE_GAP + 0.22 * MIN_VIRTUAL_KM;
    expect(short.nodes[1]!.position[2]).toBeCloseTo(Z_MIN, 6);
    expect(short.nodes[1]!.position[2]).toBeGreaterThan(nat);
    const long = day(8, 120);
    expect(long.nodes.at(-1)!.position[2]).toBeCloseTo(Z_MAX, 6);
    for (const l of [short, long]) {
      for (const km of [0, l.totalKm * 0.3, l.totalKm * 0.77, l.totalKm]) {
        expect(l.sToKm(l.kmToS(km))).toBeCloseTo(km, 1);
      }
    }
  });
});

describe('enquadramento', () => {
  it('a caixa da maquete não depende do palco: o mesmo layout para qualquer tela', () => {
    const a = buildLayout(dayOne());
    const b = buildLayout(dayOne());
    expect(a.bounds).toEqual(b.bounds);
    expect(a.yRange).toEqual(b.yRange);
  });
});

describe('layout sem rota', () => {
  const stops = [
    makeStop({ kind: 'origin', name: 'Saída', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'nature', name: 'Represa do Vale', travel_minutes_to_next: null }),
    makeStop({ kind: 'winery', name: 'Vinícola', travel_minutes_to_next: 120 }),
    makeStop({ kind: 'hotel', name: 'Pousada' }),
  ];
  const layout = buildLayout({ dayId: 'x', stops, route: null, place: null });

  it('espaça os nós pelos deslocamentos, plano, tudo interior', () => {
    expect(layout.hasRoute).toBe(false);
    expect(layout.realTotalKm).toBeNull();
    expect(layout.nodes.map((n) => n.km)).toEqual([0, 60, 60 + 30, 60 + 30 + 120]);
    expect(layout.bands).toHaveLength(1);
    expect(layout.bands[0]?.kind).toBe('interior');
    for (const p of layout.path) expect(p.y).toBe(0);
    expect(layout.curiosities).toEqual([]);
    expect(layout.places).toEqual([]);
    expect(layout.fractionToS(1)).toBeCloseTo(layout.nodes[3]?.s ?? -1, 6);
  });

  it('planta o lago à frente da peça e os parreirais atrás dela, na escala nova', () => {
    expect(layout.nodes.map((n) => n.touch)).toEqual([null, 'lake', 'vineyard', null]);
    const lake = layout.features.find((f) => f.kind === 'lake')!;
    expect(layout.terrainAt(lake.x, lake.z).water).toBe('lake');
    const node = layout.nodes[1]!;
    // o lago fica do lado de fora do S, dentro da base, e a peça do lago recua para a água ficar à frente
    expect(Math.sign(lake.x - node.position[0])).toBe(node.side);
    expect(Math.abs(lake.x) + LAKE_RX).toBeLessThanOrEqual(layout.bounds.x1);
    const piece = footprint(layout, node.stop_id);
    expect(piece.z1).toBeLessThanOrEqual(lake.z - lake.rz + 1e-6);
    expect(layout.terrainAt(node.position[0], node.position[2]).water).toBe('none');
    const vineyard = layout.features.find((f) => f.kind === 'vineyard')!;
    const winery = layout.nodes[2]!;
    const wbox = footprint(layout, winery.stop_id);
    expect(vineyard.z - vineyard.half).toBeGreaterThanOrEqual(wbox.z1 - 1e-6);
    expect(Math.abs(vineyard.x) + vineyard.half).toBeLessThanOrEqual(layout.bounds.x1);
  });

  it('uma parada só vira um trecho reto com o nó no meio', () => {
    const one = buildLayout({ dayId: 'y', stops: [stops[0]!], route: null, place: null });
    expect(one.nodes).toHaveLength(1);
    expect(one.pathLength).toBeCloseTo(2 * STUB_SINGLE, 3);
    expect(one.nodes[0]?.s).toBeCloseTo(STUB_SINGLE, 0);
    expect(one.kmToS(0)).toBe(one.nodes[0]?.s);
    expect(aspectOf(one)).toBeLessThan(1);
  });

  it('deslocamento curto nunca encolhe abaixo do mínimo', () => {
    const tiny = buildLayout({
      dayId: 'z',
      stops: [makeStop({ travel_minutes_to_next: 2 }), makeStop()],
      route: null,
      place: null,
    });
    expect(tiny.nodes[1]?.km).toBe(MIN_VIRTUAL_KM);
  });
});

describe('layout misto: parada sem coordenada entre duas com rota', () => {
  it('interpola a parada sem coordenada pelos deslocamentos e mantém a rota real', () => {
    const [origin, park, hotel, restaurant] = gemeoStops() as [
      ReturnType<typeof makeStop>,
      ReturnType<typeof makeStop>,
      ReturnType<typeof makeStop>,
      ReturnType<typeof makeStop>,
    ];
    const prova = makeStop({
      kind: 'event',
      name: 'Prova',
      lat: null,
      lng: null,
      travel_minutes_to_next: 60,
    });
    const stops = [origin, { ...park, travel_minutes_to_next: 60 }, prova, hotel, restaurant];
    const layout = buildLayout({ dayId: 'm', stops, route, place: place() });
    expect(layout.hasRoute).toBe(true);
    expect(layout.nodes).toHaveLength(5);
    const kms = layout.nodes.map((n) => n.km);
    expect(kms[2]).toBeGreaterThan(kms[1] ?? 0);
    expect(kms[2]).toBeLessThan(kms[3] ?? 0);
    expect(kms[2]).toBeCloseTo(((kms[1] ?? 0) + (kms[3] ?? 0)) / 2, 6);
    expect(layout.fractionToS(1)).toBeCloseTo(layout.nodes[4]?.s ?? -1, 6);
  });

  it('parada sem coordenada antes da rota ganha km virtual e desloca o início real', () => {
    const casa = makeStop({
      kind: 'origin',
      name: 'Casa',
      lat: null,
      lng: null,
      travel_minutes_to_next: 30,
    });
    const stops = [casa, ...gemeoStops()];
    const layout = buildLayout({ dayId: 'v', stops, route, place: place() });
    expect(layout.kmOffset).toBe(30);
    expect(layout.nodes[1]?.km).toBe(30);
    expect(layout.fractionToS(0)).toBeCloseTo(layout.nodes[1]?.s ?? -1, 6);
    expect(layout.bands[0]?.kind).toBe('interior');
    expect(layout.bands[0]?.to_km).toBeCloseTo(30, 1);
  });
});

describe('layout com uma parada que se registrou sozinha (fase 15)', () => {
  const [origin, park, hotel, restaurant] = gemeoStops() as [
    ReturnType<typeof makeStop>,
    ReturnType<typeof makeStop>,
    ReturnType<typeof makeStop>,
    ReturnType<typeof makeStop>,
  ];
  // um posto à beira da estrada, num ponto da rota real entre a saída e o parque
  const at = route.geometry[Math.floor(route.geometry.length * 0.3)] ?? [0, 0];
  const posto = makeStop({
    kind: 'fuel',
    name: 'Posto da estrada',
    source: 'auto',
    lng: at[0] + 0.0005,
    lat: at[1],
    done_at: '2026-12-11T13:00:00.000Z',
  });
  const stops = [origin, posto, park, hotel, restaurant];

  it('não é ponto de passagem: a rota real continua valendo, sem pedir outra', () => {
    const layout = buildLayout({ dayId: 'auto', stops, route, place: place() });
    expect(layout.hasRoute).toBe(true);
    expect(layout.nodes).toHaveLength(5);
    expect(layout.nodes[2]?.km).toBeCloseTo(448.063, 2);
    expect(layout.realTotalKm).toBeCloseTo(layout.totalKm, 6);
  });

  it('fica onde a posição dela cai na estrada, entre os vizinhos', () => {
    const layout = buildLayout({ dayId: 'auto', stops, route, place: place() });
    const index = indexRoute(route.geometry);
    const expected =
      projectOntoRoute(index, [posto.lng ?? 0, posto.lat ?? 0]).fraction *
      (layout.realTotalKm ?? 0);
    expect(layout.nodes[1]?.km).toBeCloseTo(expected, 3);
    expect(layout.nodes[1]?.km).toBeGreaterThan(layout.nodes[0]?.km ?? 0);
    expect(layout.nodes[1]?.km).toBeLessThan(layout.nodes[2]?.km ?? 0);
  });

  it('depois da última parada do roteiro, presa no fim da estrada', () => {
    const late = { ...posto, lng: route.geometry[0]?.[0] ?? 0, lat: route.geometry[0]?.[1] ?? 0 };
    const layout = buildLayout({
      dayId: 'auto',
      stops: [origin, park, hotel, restaurant, late],
      route,
      place: place(),
    });
    expect(layout.hasRoute).toBe(true);
    expect(layout.nodes[4]?.km).toBeCloseTo(layout.nodes[3]?.km ?? -1, 6);
  });
});
