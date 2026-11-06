import { describe, expect, it } from 'vitest';
import { MotionController, type Move } from './motion.ts';
import type { ReplayCue, ReplayPlan } from './replay.ts';

const cueEvent = (s: number, id = `arrived:${s}`): ReplayCue => ({
  kind: 'event',
  s,
  event: { id, kind: 'arrived', stop_id: id, stop_name: id, at: null, by: null },
});
const cueCuriosity = (s: number, duration_ms = 1500): ReplayCue => ({
  kind: 'curiosity',
  s,
  caption: `curiosidade em ${s}`,
  curiosity: 'highest',
  duration_ms,
});
const move = (over: Partial<Move> = {}): Move => ({
  kind: 'replay',
  from_s: 0,
  to_s: 100,
  duration_ms: 1000,
  delay_ms: 0,
  cues: [],
  plan: null,
  ...over,
});

describe('MotionController', () => {
  it('começa parado, anda com easing e termina no destino', () => {
    const m = new MotionController(5);
    expect(m.busy).toBe(false);
    expect(m.step(0)).toEqual([]);
    m.enqueue(move(), 1000);
    expect(m.busy).toBe(true);
    const started = m.step(1000);
    expect(started.map((e) => e.type)).toEqual(['start']);
    expect(m.s).toBe(0);
    m.step(1250);
    const quarter = m.s;
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(25); // easing: começa devagar
    m.step(1500);
    expect(m.s).toBeCloseTo(50, 6);
    const done = m.step(2000);
    expect(done.map((e) => e.type)).toEqual(['done']);
    expect(m.s).toBe(100);
    expect(m.busy).toBe(false);
  });

  it('dispara cada deixa quando o carro passa por ela, uma vez, em ordem', () => {
    const m = new MotionController(0);
    m.enqueue(move({ cues: [cueEvent(25), cueEvent(50), cueEvent(100)] }), 0);
    m.step(0);
    expect(m.step(400).filter((e) => e.type === 'cue')).toHaveLength(0 + (m.s >= 25 ? 1 : 0));
    const fired: number[] = [];
    for (let t = 450; t <= 1000; t += 50) {
      for (const e of m.step(t)) if (e.type === 'cue') fired.push(e.cue.s);
    }
    const all = [...new Set(fired)];
    expect(all).toEqual(fired);
    expect(fired.at(-1)).toBe(100);
    expect(fired.length + (m.s >= 25 && fired[0] !== 25 ? 1 : 0)).toBeGreaterThanOrEqual(2);
  });

  it('"Pular" vai ao fim e dispara o que faltava de uma vez', () => {
    const m = new MotionController(0);
    m.enqueue(move({ cues: [cueEvent(25), cueCuriosity(60), cueEvent(90)] }), 0);
    m.step(0);
    m.step(400);
    const events = m.skip(400);
    expect(m.s).toBe(100);
    expect(events.flatMap((e) => (e.type === 'cue' ? [e.cue.s] : []))).toEqual(
      expect.arrayContaining([60, 90]),
    );
    expect(events.at(-1)).toMatchObject({ type: 'done', skipped: true });
    expect(m.dive).toBeNull();
    expect(m.busy).toBe(false);
  });

  it('a curiosidade abre um mergulho pelo tempo dela e fecha sozinha', () => {
    const m = new MotionController(0);
    m.enqueue(move({ cues: [cueCuriosity(10, 1500)] }), 0);
    m.step(0);
    m.step(500);
    expect(m.dive).not.toBeNull();
    expect(m.dive?.caption).toBe('curiosidade em 10');
    expect(m.dive?.until).toBe(2000);
    m.step(1000);
    expect(m.busy).toBe(true); // o movimento acabou, o mergulho continua
    m.step(2000);
    expect(m.dive).toBeNull();
    expect(m.busy).toBe(false);
  });

  it('com reduzir movimento o movimento é instantâneo e não há mergulho', () => {
    const m = new MotionController(0, true);
    const plan: ReplayPlan = {
      mode: 'catchup',
      from_s: 0,
      to_s: 80,
      duration_ms: 5000,
      cues: [cueCuriosity(40), cueEvent(80)],
      overflow: 0,
      event_ids: ['arrived:80'],
    };
    m.enqueue(m.fromPlan(plan), 0);
    const events = m.step(0);
    expect(events.map((e) => e.type)).toEqual(['start', 'cue', 'cue', 'done']);
    expect(m.s).toBe(80);
    expect(m.dive).toBeNull();
  });

  it('a espera antes de começar é respeitada e a fila anda na ordem', () => {
    const m = new MotionController(0);
    m.enqueue(move({ kind: 'opening', to_s: 10, duration_ms: 600, delay_ms: 1800 }), 0);
    m.enqueue(move({ from_s: 10, to_s: 50, duration_ms: 1000 }), 0);
    expect(m.step(1000)).toEqual([]);
    expect(m.s).toBe(0);
    expect(m.step(1800).map((e) => e.type)).toEqual(['start']);
    expect(m.currentMove?.kind).toBe('opening');
    expect(m.step(2400).map((e) => e.type)).toEqual(['done']);
    expect(m.step(2401).map((e) => e.type)).toEqual(['start']);
    expect(m.currentMove?.kind).toBe('replay');
  });

  it('uma suavização nova substitui a anterior', () => {
    const m = new MotionController(0);
    m.enqueue(move({ kind: 'smooth', to_s: 10 }), 0);
    m.enqueue(move({ kind: 'smooth', to_s: 20 }), 0);
    m.step(0);
    expect(m.currentMove?.to_s).toBe(20);
    m.enqueue(move({ kind: 'smooth', from_s: m.s, to_s: 30 }), 100);
    m.step(100);
    expect(m.currentMove?.to_s).toBe(30);
  });

  it('fromPlan escolhe o tipo pelo modo do plano', () => {
    const m = new MotionController(0);
    const plan: ReplayPlan = {
      mode: 'review',
      from_s: 0,
      to_s: 1,
      duration_ms: 10,
      cues: [],
      overflow: 0,
      event_ids: [],
    };
    expect(m.fromPlan(plan).kind).toBe('review');
    expect(m.fromPlan({ ...plan, mode: 'live' }).kind).toBe('live');
    expect(m.fromPlan({ ...plan, mode: 'catchup' }).kind).toBe('replay');
  });
});
