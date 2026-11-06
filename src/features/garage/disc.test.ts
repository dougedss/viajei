import { describe, expect, it } from 'vitest';
import {
  DISC,
  dragTilt,
  dragYaw,
  fitDistance,
  grab,
  lockAxis,
  pinch,
  release,
  releaseVelocity,
  resume,
  startDisc,
  stepDisc,
  wheel,
  type Disc,
  type DiscEnv,
} from './disc.ts';

const ENV: DiscEnv = { reduced: false, hidden: false };

/** Avança `seconds` em quadros de 16 ms; devolve o disco e se ainda estava ocupado no fim. */
function run(d: Disc, seconds: number, start: number, env = ENV): { disc: Disc; busy: boolean } {
  let disc = d;
  let busy = true;
  for (let t = 0; t < seconds * 1000; t += 16)
    ({ disc, busy } = stepDisc(disc, 0.016, start + t, env));
  return { disc, busy };
}

describe('o disco gira sozinho e para', () => {
  it('começa girando devagar e para depois de 20 s sem toque', () => {
    const d = startDisc(0, ENV);
    expect(d.auto).toBe(true);
    expect(d.vel).toBe(DISC.autoSpeed);
    const at10 = run(d, 10, 0);
    expect(at10.disc.vel).toBeCloseTo(DISC.autoSpeed, 3);
    expect(at10.busy).toBe(true);
    const later = run(at10.disc, 14, 10_000);
    expect(later.disc.auto).toBe(false);
    expect(later.disc.vel).toBe(0);
    // parado e assentado: nenhum quadro
    expect(later.busy).toBe(false);
  });

  it('não gira sozinho sob reduzir movimento nem com a aba escondida', () => {
    expect(startDisc(0, { reduced: true, hidden: false }).auto).toBe(false);
    const hidden = run(startDisc(0, ENV), 1, 0, { reduced: false, hidden: true });
    expect(hidden.disc.auto).toBe(false);
    const reduced = stepDisc(startDisc(0, ENV), 0.016, 16, { reduced: true, hidden: false });
    expect(reduced.disc.vel).toBe(0);
  });

  it('depois de uma troca, o giro recomeça e a janela de 20 s volta a contar', () => {
    const stopped = run(startDisc(0, ENV), 25, 0).disc;
    const resumed = resume(stopped, 25_000, ENV);
    expect(resumed.auto).toBe(true);
    const going = run(resumed, 3, 25_000);
    expect(going.disc.vel).toBeGreaterThan(DISC.autoSpeed * 0.9);
  });
});

describe('arrastar e soltar', () => {
  it('arrastar a largura do palco gira 225°; enquanto o dedo segura, nada gira sozinho', () => {
    let d = grab(startDisc(0, ENV), 0);
    expect(d.vel).toBe(0);
    d = dragYaw(d, 400, 400);
    expect(d.yaw).toBeCloseTo(DISC.yawPerWidth, 6);
    const held = stepDisc(d, 0.016, 16, ENV);
    expect(held.disc.yaw).toBe(d.yaw);
  });

  it('a inércia parte da velocidade dos últimos 100 ms e volta ao giro lento', () => {
    const samples: [number, number][] = [
      [0, 0],
      [200, 0.1],
      [250, 0.3],
      [300, 0.5],
    ];
    const vel = releaseVelocity(samples);
    expect(vel).toBeCloseTo(4, 3);
    expect(
      releaseVelocity([
        [0, 0],
        [100, 10],
      ]),
    ).toBe(DISC.maxVel);
    let d = release(grab(startDisc(0, ENV), 0), vel, 300, ENV);
    expect(d.vel).toBe(vel);
    const soon = run(d, 0.3, 300).disc;
    expect(soon.vel).toBeLessThan(vel);
    expect(soon.vel).toBeGreaterThan(DISC.autoSpeed);
    d = run(soon, 6, 600).disc;
    expect(d.vel).toBeCloseTo(DISC.autoSpeed, 3);
  });

  it('sob reduzir movimento, solta sem inércia', () => {
    const d = release(grab(startDisc(0, ENV), 0), 4, 10, { reduced: true, hidden: false });
    expect(d.vel).toBe(0);
    expect(d.auto).toBe(false);
  });

  it('a direção trava nos primeiros 10 px', () => {
    expect(lockAxis(3, 4)).toBeNull();
    expect(lockAxis(12, 3)).toBe('yaw');
    expect(lockAxis(-2, -14)).toBe('tilt');
  });
});

describe('inclinação e zoom dentro dos limites', () => {
  it('a inclinação fica na faixa curta', () => {
    const d = startDisc(0, ENV);
    expect(dragTilt(d, 5000, 400).tiltGoal).toBe(DISC.tiltMax);
    expect(dragTilt(d, -5000, 400).tiltGoal).toBe(DISC.tiltMin);
    const mid = dragTilt(d, 100, 400);
    expect(mid.tiltGoal).toBeGreaterThan(d.tiltGoal);
    // a câmera chega lá suavemente e assenta
    const settled = run(mid, 2, 0).disc;
    expect(settled.tilt).toBe(mid.tiltGoal);
  });

  it('pinçar e a roda do mouse aproximam e afastam dentro dos limites', () => {
    const d = startDisc(0, ENV);
    // afastar os dedos 20% aproxima na mesma proporção
    expect(pinch(d, 1, 100, 120).zoomGoal).toBeCloseTo(1 / 1.2);
    expect(pinch(d, 1, 100, 1000).zoomGoal).toBe(DISC.zoomMin);
    expect(pinch(d, 1, 100, 10).zoomGoal).toBe(DISC.zoomMax);
    expect(wheel(d, 100).zoomGoal).toBeCloseTo(1.08);
    expect(wheel(d, -100).zoomGoal).toBeCloseTo(0.92);
  });

  it('a distância enquadra o carro: no retrato, quem limita é a largura', () => {
    const wide = fitDistance(3, 34, 2);
    const tall = fitDistance(3, 34, 0.8);
    expect(tall).toBeGreaterThan(wide);
    expect(wide).toBeCloseTo(3 / Math.sin((17 * Math.PI) / 180), 6);
  });
});
