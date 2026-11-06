import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene } from 'three/webgpu';
import type { CarSpec } from '@/art/cars/types.ts';
import { DISC } from '../disc.ts';
import { SWAP } from '../swap.ts';
import { GarageRuntime } from './runtime.ts';

const ENV = { reduced: false, hidden: false };
const hatch: CarSpec = { model: 'hatch', color: 'sunset', accessories: [], plate: 'Serra' };

/** O runtime ligado a uma cena, sem renderer; `frames` conta os pedidos de quadro. */
function setup(car = hatch) {
  const rt = new GarageRuntime(car, 0, ENV);
  const frames = vi.fn();
  rt.bindInvalidate(frames);
  const scene = new Scene();
  rt.attach(scene);
  rt.setViewport(390, 420);
  return { rt, scene, frames };
}

function run(rt: GarageRuntime, from: number, ms: number): { busy: boolean; t: number } {
  let busy = true;
  let t = from;
  for (; t <= from + ms; t += 16) busy = rt.step(t, 0.016);
  return { busy, t };
}

const carsOnStage = (rt: GarageRuntime) => {
  let n = 0;
  rt.stage.traverse((o) => {
    if (o.name.startsWith('car:') && o.visible) n++;
  });
  return n;
};

describe('o palco da garagem', () => {
  it('monta o carro ao ligar a cena e descarta ao desligar, mantendo o que mostrar', () => {
    const { rt, scene } = setup();
    expect(scene.children).toContain(rt.stage);
    expect(carsOnStage(rt)).toBe(1);
    rt.detach();
    expect(scene.children).not.toContain(rt.stage);
    expect(rt.current).toEqual(hatch);
    rt.attach(scene);
    expect(carsOnStage(rt)).toBe(1);
  });

  it('mesmo modelo: troca cor e acessórios no carro montado, com o encaixe no fim', () => {
    const { rt, frames } = setup();
    const onSeat = vi.fn();
    rt.show({ ...hatch, color: 'sky', accessories: ['rack', 'bike'] }, { animate: true, onSeat });
    expect(frames).toHaveBeenCalled();
    expect(rt.swapping).toBe(false);
    const { busy } = run(rt, 100, 1200);
    expect(onSeat).toHaveBeenCalledTimes(1);
    expect(busy).toBe(true); // o disco continua girando sozinho
    // o mesmo carro de novo não faz nada
    frames.mockClear();
    rt.show({ ...hatch, color: 'sky', accessories: ['rack', 'bike'] }, { animate: true });
    expect(frames).not.toHaveBeenCalled();
  });

  it('outro modelo: o atual sai, o novo entra em ~0,9 s, e o antigo fica estacionado', () => {
    const { rt } = setup();
    const onSwap = vi.fn();
    rt.show({ ...hatch, model: 'kombi' }, { animate: true, onSwap });
    expect(rt.swapping).toBe(true);
    expect(onSwap).toHaveBeenCalledTimes(1);
    run(rt, 100, SWAP.outMs + SWAP.inMs + 100);
    expect(rt.swapping).toBe(false);
    expect(carsOnStage(rt)).toBe(1);
    // volta ao hatch: sai do estacionamento, sem montar de novo
    rt.show(hatch, { animate: true, onSwap });
    run(rt, 2000, SWAP.outMs + SWAP.inMs + 100);
    expect(rt.swapping).toBe(false);
    expect(onSwap).toHaveBeenCalledTimes(2);
  });

  it('com compilação ligada, a troca espera o carro novo estar pronto e um quadro de aquecimento', async () => {
    const { rt } = setup();
    let done: () => void = () => undefined;
    const compile = vi.fn(() => new Promise<void>((r) => (done = r)));
    rt.bindCompile(compile);
    const onSwap = vi.fn();
    rt.show({ ...hatch, model: 'suv' }, { animate: true, onSwap });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(rt.step(0, 0.016)).toBe(true); // o disco gira; a troca ainda não
    expect(onSwap).not.toHaveBeenCalled();
    done();
    await Promise.resolve();
    await Promise.resolve();
    rt.step(16, 0.016); // o quadro de aquecimento
    expect(onSwap).not.toHaveBeenCalled();
    rt.step(32, 0.016);
    expect(onSwap).toHaveBeenCalledTimes(1);
  });

  it('sem animação (reduzir movimento), troca na hora', () => {
    const { rt } = setup();
    rt.show({ ...hatch, model: 'pickup' }, { animate: false });
    expect(rt.swapping).toBe(false);
    expect(carsOnStage(rt)).toBe(1);
  });

  it('o dedo gira o disco; soltar com velocidade deixa inércia', () => {
    const { rt } = setup();
    rt.pointerDown(1, 100, 200, 0);
    rt.pointerMove(1, 140, 201, 20);
    rt.pointerMove(1, 220, 202, 60);
    const yaw = rt.state.yaw;
    expect(yaw).toBeGreaterThan(0);
    rt.pointerUp(1, 70);
    expect(rt.state.vel).toBeGreaterThan(DISC.autoSpeed);
    // arrastar na vertical inclina, sem girar
    rt.pointerDown(2, 100, 100, 1000);
    rt.pointerMove(2, 101, 160, 1016);
    rt.pointerUp(2, 1030);
    expect(rt.state.tiltGoal).toBeGreaterThan(DISC.tiltStart);
  });

  it('a câmera olha o carro de três quartos, dentro da faixa de inclinação', () => {
    const { rt } = setup();
    const cam = new PerspectiveCamera();
    rt.applyCamera(cam);
    expect(cam.position.x).toBeCloseTo(cam.position.z, 6);
    expect(cam.position.y).toBeGreaterThan(1);
    expect(cam.fov).toBe(34);
  });
});
