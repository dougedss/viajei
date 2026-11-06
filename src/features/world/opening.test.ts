import { describe, expect, it } from 'vitest';
import { makeStop } from '@/test/factories.ts';
import { buildLayout } from './layout.ts';
import {
  OPENING_TIMELINE,
  OPENING_TOTAL_MS,
  openedKey,
  planOpening,
  stepProgress,
} from './opening.ts';

const layout = buildLayout({
  dayId: 'o',
  stops: [makeStop(), makeStop(), makeStop(), makeStop()],
  route: null,
  place: null,
  viewport: { width: 390, height: 520, hudTop: 36, hudBottom: 64 },
});

describe('planOpening', () => {
  it('relevo, estrada, pinos, carro e Agora na ordem do storyboard', () => {
    const plan = planOpening(layout, false);
    expect(plan.total_ms).toBe(OPENING_TOTAL_MS);
    expect(plan.steps.map((s) => s.step)).toEqual(['terrain', 'road', 'pins', 'car', 'agora']);
    for (let i = 1; i < plan.steps.length; i++) {
      expect(plan.steps[i]!.from_ms).toBe(plan.steps[i - 1]!.to_ms);
    }
    expect(plan.steps.find((s) => s.step === 'car')).toEqual({
      step: 'car',
      from_ms: 1800,
      to_ms: 2400,
    });
  });

  it('os pinos caem em sequência dentro da janela deles', () => {
    const plan = planOpening(layout, false);
    const [from, to] = OPENING_TIMELINE.pins;
    expect(plan.pins).toHaveLength(4);
    let last = -1;
    for (const pin of plan.pins) {
      expect(pin.at_ms).toBeGreaterThanOrEqual(from);
      expect(pin.at_ms).toBeLessThan(to);
      expect(pin.at_ms).toBeGreaterThan(last);
      last = pin.at_ms;
    }
  });

  it('o carro entra pelo começo da estrada e estaciona no primeiro nó', () => {
    const plan = planOpening(layout, false);
    expect(plan.enter_s).toBe(0);
    expect(plan.park_s).toBe(layout.nodes[0]!.s);
    expect(plan.park_s).toBeGreaterThan(plan.enter_s);
  });

  it('com reduzir movimento tudo é um quadro só', () => {
    const plan = planOpening(layout, true);
    expect(plan.total_ms).toBe(0);
    expect(plan.steps.every((s) => s.from_ms === 0 && s.to_ms === 0)).toBe(true);
    expect(plan.pins.every((p) => p.at_ms === 0)).toBe(true);
    expect(plan.enter_s).toBe(plan.park_s);
    expect(stepProgress(plan, 'terrain', 0)).toBe(1);
  });

  it('stepProgress vai de 0 a 1 dentro do passo', () => {
    const plan = planOpening(layout, false);
    expect(stepProgress(plan, 'road', 500)).toBe(0);
    expect(stepProgress(plan, 'road', 900)).toBeCloseTo(0.5, 6);
    expect(stepProgress(plan, 'road', 1300)).toBe(1);
    expect(stepProgress(plan, 'agora', 2399)).toBe(0);
    expect(stepProgress(plan, 'agora', 2400)).toBe(1);
  });

  it('a chave de "já abriu" é por dia', () => {
    expect(openedKey('abc')).toBe('world:opened:abc');
  });
});
