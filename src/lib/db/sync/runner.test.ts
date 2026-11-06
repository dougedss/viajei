import { describe, expect, it } from 'vitest';
import { CycleRunner } from './runner.ts';

/** Um lock de mentira, com fila, como o Web Lock: quem pede espera quem segura. */
class FakeLock {
  held = false;
  #waiters: (() => void)[] = [];
  async withLock(cycle: () => Promise<void>): Promise<boolean> {
    if (this.held) return false;
    this.held = true;
    try {
      await cycle();
    } finally {
      this.release();
    }
    return true;
  }
  lockReleased(): Promise<void> {
    return this.held ? new Promise((r) => this.#waiters.push(r)) : Promise.resolve();
  }
  hold(): void {
    this.held = true;
  }
  release(): void {
    this.held = false;
    for (const w of this.#waiters.splice(0)) w();
  }
}

function setup(opts: { online?: () => boolean } = {}) {
  const lock = new FakeLock();
  let cycles = 0;
  let gate: (() => void) | null = null;
  let blocking = false;
  const runner = new CycleRunner({
    canRun: opts.online ?? (() => true),
    withLock: (c) => lock.withLock(c),
    lockReleased: () => lock.lockReleased(),
    cycle: async () => {
      cycles += 1;
      if (blocking) await new Promise<void>((r) => (gate = r));
    },
  });
  return {
    runner,
    lock,
    cycles: () => cycles,
    block: () => (blocking = true),
    unblock: () => {
      blocking = false;
      gate?.();
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('o laço de ciclos do motor de sync', () => {
  it('um pedido, um ciclo; sem pedido, nada', async () => {
    const t = setup();
    await t.runner.run();
    expect(t.cycles()).toBe(0);
    t.runner.request();
    await t.runner.run();
    expect(t.cycles()).toBe(1);
  });

  it('pedido no meio de um ciclo vira mais um ciclo, no mesmo laço', async () => {
    const t = setup();
    t.block();
    t.runner.request();
    const first = t.runner.run();
    await tick();
    t.runner.request(); // a escrita feita durante o push
    const second = t.runner.run();
    expect(second).toBe(first);
    t.unblock();
    await first;
    expect(t.cycles()).toBe(2);
  });

  it('lock ocupado (um pull do Realtime) não descarta o pedido: espera soltar e roda', async () => {
    const t = setup();
    t.lock.hold();
    t.runner.request();
    const done = t.runner.run();
    await tick();
    expect(t.cycles()).toBe(0);
    t.lock.release();
    await done;
    expect(t.cycles()).toBe(1);
  });

  it('sem rede, o laço termina na hora e o próximo pedido roda quando a rede volta', async () => {
    let online = false;
    const t = setup({ online: () => online });
    t.runner.request();
    await t.runner.run(); // terminou sem esperar nada
    expect(t.cycles()).toBe(0);
    online = true;
    t.runner.request();
    await t.runner.run();
    expect(t.cycles()).toBe(1);
  });

  it('parar esquece o pedido', async () => {
    const t = setup();
    t.runner.request();
    t.runner.clear();
    await t.runner.run();
    expect(t.cycles()).toBe(0);
    expect(t.runner.pending).toBe(false);
  });
});
