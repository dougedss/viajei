/**
 * Os sons do Modo Viagem, sintetizados com Web Audio: nenhum arquivo, nenhum download. Buzina
 * curta (duas notas, como uma buzina de carro), sino curto (harmônicos que decaem) e o ronco
 * discreto do motor (serra grave filtrada com um leve balanço), que liga e desliga com rampa.
 * Só agenda nós no contexto que recebe; quem decide se toca é `lib/audio/index.ts`.
 */
export type EngineHandle = { stop: (fadeMs?: number) => void };

function envelope(
  ctx: AudioContext,
  t0: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.setValueAtTime(peak, t0 + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  gain.connect(ctx.destination);
  return gain;
}

/** Buzina: duas notas a uma terça, 180 ms, com um filtro para não ferir o ouvido. */
export function horn(ctx: AudioContext, when = ctx.currentTime): void {
  const t0 = when + 0.01;
  const out = envelope(ctx, t0, 0.14, 0.015, 0.13, 0.08);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.connect(out);
  for (const freq of [440, 554.37]) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  }
}

/** Sino: fundamental e dois harmônicos decaindo em 600 ms. */
export function bell(ctx: AudioContext, when = ctx.currentTime): void {
  const t0 = when + 0.01;
  for (const [ratio, level, decay] of [
    [1, 0.09, 0.6],
    [2, 0.04, 0.45],
    [3, 0.02, 0.3],
  ] as const) {
    const out = envelope(ctx, t0, level, 0.005, 0.02, decay);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880 * ratio;
    osc.connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.03 + decay + 0.05);
  }
}

/** Ronco do motor: liga com rampa de 300 ms e fica até `stop()`, que desliga em 400 ms. */
export function engine(ctx: AudioContext, when = ctx.currentTime): EngineHandle {
  const t0 = when + 0.01;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.045, t0 + 0.3);
  master.connect(ctx.destination);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 320;
  filter.Q.value = 0.8;
  filter.connect(master);

  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = 62;
  saw.connect(filter);
  const sub = ctx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.value = 31;
  sub.connect(filter);

  // o balanço do motor: um LFO lento mexe de leve na frequência
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 2.3;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 3;
  lfo.connect(lfoGain);
  lfoGain.connect(saw.frequency);

  for (const node of [saw, sub, lfo]) node.start(t0);
  let stopped = false;
  return {
    stop(fadeMs = 400) {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + fadeMs / 1000);
      for (const node of [saw, sub, lfo]) node.stop(t + fadeMs / 1000 + 0.05);
    },
  };
}
