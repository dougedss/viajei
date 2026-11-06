import { describe, expect, it, vi } from 'vitest';
import { snap } from './synth.ts';

/** Um AudioContext de mentira que só registra o que foi agendado. */
function fakeContext() {
  const started: { kind: string; at: number; stop?: number }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  });
  const node = (kind: string) => ({
    connect: vi.fn(),
    start: (at: number) => started.push({ kind, at }),
    stop: (at: number) => {
      const s = started.find((x) => x.kind === kind && x.stop === undefined);
      if (s) s.stop = at;
    },
  });
  const ctx = {
    currentTime: 1,
    sampleRate: 48_000,
    destination: {},
    createGain: () => ({ gain: param(), connect: vi.fn() }),
    createBiquadFilter: () => ({ type: '', frequency: param(), Q: param(), connect: vi.fn() }),
    createOscillator: () => ({ ...node('osc'), type: '', frequency: param() }),
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => ({ ...node('noise'), buffer: null as unknown }),
  };
  return { ctx: ctx as unknown as AudioContext, started };
}

describe('o som de encaixe', () => {
  it('um clique de ruído e um "toc" grave, curtos, a partir de agora', () => {
    const { ctx, started } = fakeContext();
    snap(ctx);
    expect(started.map((s) => s.kind).sort()).toEqual(['noise', 'osc']);
    for (const s of started) {
      expect(s.at).toBeGreaterThanOrEqual(1);
      expect((s.stop ?? 99) - s.at).toBeLessThan(0.2);
    }
  });
});
