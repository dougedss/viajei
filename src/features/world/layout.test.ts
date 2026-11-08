import { describe, expect, it } from 'vitest';
import seedDay1 from '@/lib/geo/__fixtures__/seed-dia-1.json';
import { readPlace, type PlaceReading } from '@/lib/geo/index.ts';
import type { DayRoute } from '@/lib/db/schema.ts';
import { makeStop } from '@/test/factories.ts';
import { gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import { MINIATURE_BOX } from '@/art/stops/types.ts';
import {
  buildLayout,
  fitCamera,
  MIN_VIRTUAL_KM,
  NODE_GAP,
  X_HALF,
  type LayoutInput,
  type LayoutViewport,
} from './layout.ts';
import { projectNodes } from './project.ts';

const route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> = {
  geometry: seedDay1.geometry as [number, number][],
  elevation: seedDay1.elevation as [number, number][],
  legs: seedDay1.legs,
};
let placeCache: PlaceReading | null = null;
const place = (): PlaceReading => (placeCache ??= readPlace(route));

const PHONE: LayoutViewport = { width: 390, height: 520, hudTop: 36, hudBottom: 64 };
const TALL: LayoutViewport = { width: 390, height: 845, hudTop: 36, hudBottom: 64 };
const SQUARE: LayoutViewport = { width: 600, height: 800, hudTop: 36, hudBottom: 64 };

function dayOne(over: Partial<LayoutInput> = {}): LayoutInput {
  return { dayId: 'dia-1', stops: gemeoStops(), route, place: place(), viewport: PHONE, ...over };
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
    // os pesos somam 1 em qualquer km, e no meio de uma faixa ela domina
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

  it('cada parada vira uma miniatura do tipo, fora da estrada e do lado de fora do S', () => {
    const minis = layout.features.filter((f) => f.kind === 'miniature');
    expect(minis.map((m) => m.stop)).toEqual(['origin', 'nature', 'hotel', 'food']);
    for (const node of layout.nodes) {
      const m = minis.find((f) => f.stop_id === node.stop_id)!;
      // do lado de fora do S, com a caixa inteira fora da estrada
      expect(Math.sign(m.x - node.position[0])).toBe(node.side);
      const box = MINIATURE_BOX[m.stop];
      expect(Math.abs(m.x - node.position[0]) - box.d / 2).toBeGreaterThan(layout.roadHalfWidth);
      // virada para a estrada: a frente (+z local) aponta para o lado oposto ao de fora
      expect(Math.sign(Math.sin(m.angle))).toBe(-node.side);
    }
    // as quadras só em volta do hotel e do restaurante (cidade, hotel e comida)
    const blocks = layout.features.filter((f) => f.kind === 'blocks');
    expect(blocks).toHaveLength(2);
    expect(layout.features.some((f) => f.kind === 'lake')).toBe(false);
  });

  it('o terreno é contínuo, segue a estrada de perto e não inventa água', () => {
    const node = layout.nodes[1]!;
    const near = layout.terrainAt(node.position[0] + 1, node.position[2]);
    expect(Math.abs(near.h - node.position[1])).toBeLessThan(0.6);
    expect(near.water).toBe('none');
    const far = layout.terrainAt(node.position[0] + 40, node.position[2]);
    expect(Number.isFinite(far.h)).toBe(true);
    expect(Object.values(far.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(layout.seaLevel).toBeNull();
  });

  it('é determinístico pela semente do dia e muda com outro dia', () => {
    const again = buildLayout(dayOne());
    expect(again.seed).toBe(layout.seed);
    expect(again.terrainAt(33, 70).h).toBe(layout.terrainAt(33, 70).h);
    const other = buildLayout(dayOne({ dayId: 'dia-2' }));
    expect(other.seed).not.toBe(layout.seed);
    expect(other.path.map((p) => [p.x, p.z])).toEqual(layout.path.map((p) => [p.x, p.z]));
    expect(other.terrainAt(33, 70).h).not.toBe(layout.terrainAt(33, 70).h);
  });
});

describe('enquadramento', () => {
  it.each([
    ['9:19,5', TALL],
    ['3:4', SQUARE],
    ['canvas baixo', PHONE],
  ])('o dia inteiro cabe acima do HUD em %s', (_name, viewport) => {
    const layout = buildLayout(dayOne({ viewport }));
    const pins = projectNodes(layout, viewport);
    for (const pin of pins) {
      expect(pin.visible).toBe(true);
      expect(pin.x).toBeGreaterThan(0);
      expect(pin.x).toBeLessThan(viewport.width);
      expect(pin.y).toBeGreaterThan(viewport.hudTop - 8);
      expect(pin.y).toBeLessThan(viewport.height - viewport.hudBottom);
    }
    // a estrada inteira também: nenhum ponto do caminho fora do canvas
    const aspect = viewport.width / viewport.height;
    for (const p of layout.path.filter((_, i) => i % 50 === 0)) {
      const proj = projectNodes(
        { ...layout, nodes: [{ ...layout.nodes[0]!, position: [p.x, p.y, p.z] }] },
        viewport,
        0,
      )[0];
      expect(proj?.visible).toBe(true);
      expect(aspect).toBeGreaterThan(0);
    }
  });

  it('um dia curto não aproxima demais a câmera', () => {
    const frame = fitCamera(PHONE, 20, 0);
    expect(frame.distance).toBeGreaterThanOrEqual(60);
  });
});

describe('layout sem rota', () => {
  const stops = [
    makeStop({ kind: 'origin', name: 'Saída', travel_minutes_to_next: 60 }),
    makeStop({ kind: 'nature', name: 'Represa do Vale', travel_minutes_to_next: null }),
    makeStop({ kind: 'winery', name: 'Vinícola', travel_minutes_to_next: 120 }),
    makeStop({ kind: 'hotel', name: 'Pousada' }),
  ];
  const layout = buildLayout({ dayId: 'x', stops, route: null, place: null, viewport: PHONE });

  it('espaça os nós pelos deslocamentos, plano, tudo interior', () => {
    expect(layout.hasRoute).toBe(false);
    expect(layout.realTotalKm).toBeNull();
    expect(layout.nodes.map((n) => n.km)).toEqual([0, 60, 60 + 30, 60 + 30 + 120]);
    expect(layout.bands).toHaveLength(1);
    expect(layout.bands[0]?.kind).toBe('interior');
    for (const p of layout.path) expect(p.y).toBe(0);
    expect(layout.curiosities).toEqual([]);
    expect(layout.fractionToS(1)).toBeCloseTo(layout.nodes[3]?.s ?? -1, 6);
  });

  it('planta o lago e os parreirais ao lado dos nós', () => {
    expect(layout.nodes.map((n) => n.touch)).toEqual([null, 'lake', 'vineyard', null]);
    const lake = layout.features.find((f) => f.kind === 'lake');
    expect(lake && layout.terrainAt(lake.x, lake.z).water).toBe('lake');
    // o lago fica do lado de fora do S, longe da estrada
    const node = layout.nodes[1]!;
    expect(lake && Math.sign(lake.x - node.position[0])).toBe(node.side);
    expect(layout.terrainAt(node.position[0], node.position[2]).water).toBe('none');
  });

  it('uma parada só vira um trecho reto com o nó no meio', () => {
    const one = buildLayout({
      dayId: 'y',
      stops: [stops[0]!],
      route: null,
      place: null,
      viewport: PHONE,
    });
    expect(one.nodes).toHaveLength(1);
    expect(one.pathLength).toBeCloseTo(2 * NODE_GAP, 3);
    expect(one.nodes[0]?.s).toBeCloseTo(NODE_GAP, 0);
    expect(one.kmToS(0)).toBe(one.nodes[0]?.s);
  });

  it('deslocamento curto nunca encolhe abaixo do mínimo', () => {
    const tiny = buildLayout({
      dayId: 'z',
      stops: [makeStop({ travel_minutes_to_next: 2 }), makeStop()],
      route: null,
      place: null,
      viewport: PHONE,
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
    const layout = buildLayout({ dayId: 'm', stops, route, place: place(), viewport: PHONE });
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
    const layout = buildLayout({ dayId: 'v', stops, route, place: place(), viewport: PHONE });
    expect(layout.kmOffset).toBe(30);
    expect(layout.nodes[1]?.km).toBe(30);
    expect(layout.fractionToS(0)).toBeCloseTo(layout.nodes[1]?.s ?? -1, 6);
    expect(layout.bands[0]?.kind).toBe('interior');
    expect(layout.bands[0]?.to_km).toBeCloseTo(30, 1);
  });
});
