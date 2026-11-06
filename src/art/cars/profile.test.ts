import { describe, expect, it } from 'vitest';
import { CAR_MODELS, type CarModel } from '@shared/constants.ts';
import {
  archOf,
  archRadius,
  dimensions,
  insidePolygon,
  outline,
  samplePath,
  wheelCenters,
  type CarProfile,
  type Pt,
} from './profile.ts';
import { PROFILES } from './profiles/index.ts';

const MODELS = Object.keys(CAR_MODELS) as CarModel[];

function circle([cx, cy]: Pt, r: number, n = 24): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}

/** A altura do contorno de cima no x dado: o trecho mais baixo acima da soleira (capô, piso). */
function topAt(p: CarProfile, x: number): number {
  const pts = samplePath(p.top);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if ((a[0] - x) * (b[0] - x) > 0 || a[0] === b[0]) continue;
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    if (y > p.sill + 0.01) best = Math.min(best, y);
  }
  return best;
}

describe.each(MODELS)('perfil %s', (model) => {
  const p = PROFILES[model];
  const body = samplePath(outline(p));

  it('é o perfil do modelo e o contorno fecha na soleira', () => {
    expect(p.model).toBe(model);
    const first = p.top[0]!;
    const last = p.top[p.top.length - 1]!;
    expect(first.op).toBe('M');
    expect(first.op !== 'A' && first.to[1]).toBe(p.sill);
    expect(last.op !== 'A' && last.to[1]).toBe(p.sill);
    const a = body[0]!;
    const z = body[body.length - 1]!;
    expect(z[0]).toBeCloseTo(a[0], 6);
    expect(z[1]).toBeCloseTo(a[1], 6);
  });

  it('os arcos são centrados nas rodas e ficam por baixo da chapa', () => {
    const arcs = outline(p).filter((c) => c.op === 'A');
    const { front, rear } = wheelCenters(p);
    expect(arcs.map((c) => c.center)).toEqual([front, rear]);
    for (const cx of [p.wheels.front, p.wheels.rear]) {
      const arc = archOf(p, cx);
      for (let i = 0; i <= 20; i++) {
        const a = arc.from + ((arc.to - arc.from) * i) / 20;
        const x = cx + (arc.r + p.wheels.flare) * Math.cos(a);
        const y = p.wheels.radius + (arc.r + p.wheels.flare) * Math.sin(a);
        if (y <= p.sill) continue;
        expect(topAt(p, x) - y, `${model} arco em x=${x.toFixed(2)}`).toBeGreaterThan(0.04);
      }
    }
    // o pneu cabe no arco e as rodas ficam dentro do comprimento
    expect(archRadius(p)).toBeGreaterThan(p.wheels.radius);
    const xs = body.map(([x]) => x);
    expect(p.wheels.front + archRadius(p)).toBeLessThan(Math.max(...xs));
    expect(p.wheels.rear - archRadius(p)).toBeGreaterThan(Math.min(...xs));
  });

  it('vidros, adesivos e luzes ficam dentro da carroceria', () => {
    for (const win of p.glass.side) {
      for (const pt of win)
        expect(insidePolygon(pt, body), `${model} vidro ${pt.join(',')}`).toBe(true);
    }
    for (const spot of p.anchors.stickers) {
      const r = spot.size / 2;
      for (const pt of circle(spot.at, r)) {
        expect(insidePolygon(pt, body), `${model} adesivo em ${spot.at.join(',')}`).toBe(true);
        for (const win of p.glass.side) expect(insidePolygon(pt, win)).toBe(false);
      }
      for (const [cx, cy] of Object.values(wheelCenters(p))) {
        const d = Math.hypot(spot.at[0] - cx, spot.at[1] - cy);
        expect(d, `${model} adesivo perto da roda`).toBeGreaterThan(
          archRadius(p) + p.wheels.flare + r + 0.02,
        );
      }
      if (p.twoTone) expect(spot.at[1] + r).toBeLessThan(p.twoTone.split);
    }
    for (const pt of [p.mirror, ...p.handles]) expect(insidePolygon(pt, body)).toBe(true);
  });

  it('o trilho do teto e as âncoras laterais cabem na largura', () => {
    const { roof, antenna, frontBumper } = p.anchors;
    expect(roof.x1).toBeGreaterThan(roof.x0);
    expect(roof.lanes.length).toBe(model === 'kombi' ? 3 : 2);
    for (const z of roof.lanes) expect(Math.abs(z) + 0.24).toBeLessThan(p.width / 2);
    expect(Math.abs(antenna[2])).toBeLessThan(p.width / 2);
    expect(frontBumper.spread + 0.1).toBeLessThan(p.width / 2);
    expect(p.wheels.track / 2 + p.wheels.tire / 2).toBeLessThan(p.width / 2 + 0.12);
    // o teto está mesmo em cima: acima do resto do contorno sob o trilho
    const mid = (roof.x0 + roof.x1) / 2;
    expect(roof.y).toBeGreaterThan(topAt(p, mid) - 0.02);
  });
});

describe('as proporções distinguem os cinco', () => {
  const d = Object.fromEntries(MODELS.map((m) => [m, dimensions(PROFILES[m])])) as Record<
    CarModel,
    ReturnType<typeof dimensions>
  >;

  it('dentro de faixas de carro de verdade, na escala da cena', () => {
    for (const m of MODELS) {
      expect(d[m].length).toBeGreaterThan(4.4);
      expect(d[m].length).toBeLessThan(5.8);
      expect(d[m].height).toBeGreaterThan(1.4);
      expect(d[m].height).toBeLessThan(2.1);
      expect(d[m].clearance).toBeGreaterThan(0.2);
    }
  });

  it('sedã mais longo e mais baixo que o hatch', () => {
    expect(d.sedan.length).toBeGreaterThan(d.hatch.length + 0.3);
    expect(d.sedan.height).toBeLessThan(d.hatch.height);
  });

  it('SUV mais alto, com vão e rodas maiores', () => {
    expect(d.suv.height).toBeGreaterThan(d.hatch.height + 0.2);
    expect(d.suv.clearance).toBeGreaterThan(d.hatch.clearance + 0.1);
    expect(PROFILES.suv.wheels.radius).toBeGreaterThan(PROFILES.hatch.wheels.radius);
    expect(PROFILES.suv.wheels.flare).toBeGreaterThan(0);
  });

  it('picape a mais longa, com caçamba atrás da cabine', () => {
    for (const m of MODELS)
      if (m !== 'pickup') expect(d.pickup.length).toBeGreaterThan(d[m].length);
    const bed = PROFILES.pickup.bed!;
    expect(bed.x1).toBeGreaterThan(bed.x0);
    expect(bed.floor).toBeCloseTo(topAt(PROFILES.pickup, (bed.x0 + bed.x1) / 2), 6);
    expect(bed.top - bed.floor).toBeGreaterThan(0.25);
  });

  it('kombi a mais alta, com o entre-eixos mais curto e saia e blusa', () => {
    for (const m of MODELS) if (m !== 'kombi') expect(d.kombi.height).toBeGreaterThan(d[m].height);
    for (const m of MODELS)
      if (m !== 'kombi') expect(d.kombi.wheelbase).toBeLessThan(d[m].wheelbase);
    expect(PROFILES.kombi.twoTone).not.toBeNull();
    expect(PROFILES.kombi.glass.windshield.split).toBe(true);
    expect(PROFILES.kombi.glass.side.length).toBeGreaterThanOrEqual(4);
  });
});
