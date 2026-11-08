import { describe, expect, it } from 'vitest';
import type { PushOutcome } from './push.ts';
import { runCycle, type CycleDeps } from './cycle.ts';

const sent = (done = 0): PushOutcome => ({ done, failed: 0, offline: false, notices: [] });
const offline = (): PushOutcome => ({ done: 0, failed: 0, offline: true, notices: [] });

function setup(opts: {
  trips: string[];
  /** o que acontece durante o pull de cada viagem (uma escrita, por exemplo) */
  during?: Record<string, () => void>;
  pushes?: PushOutcome[];
}) {
  const calls: string[] = [];
  let pending = false;
  const pushes = [...(opts.pushes ?? [])];
  const deps: CycleDeps = {
    push: () => {
      calls.push('push');
      pending = false;
      return Promise.resolve(pushes.shift() ?? sent());
    },
    pullUser: () => {
      calls.push('pull user');
      return Promise.resolve({ left: [] });
    },
    leaveTrip: () => Promise.resolve(),
    tripsToPull: () => Promise.resolve(opts.trips),
    pullTrip: (id) => {
      calls.push(`pull ${id}`);
      opts.during?.[id]?.();
      return Promise.resolve();
    },
    hasPendingRequest: () => pending,
    isNetworkError: (err) => err instanceof TypeError,
    onPushed: () => undefined,
    trace: () => undefined,
  };
  return { deps, calls, write: () => (pending = true) };
}

describe('um ciclo do motor de sync', () => {
  it('push, pull do usuário e o pull de cada viagem, nessa ordem', async () => {
    const t = setup({ trips: ['a', 'b'] });
    const r = await runCycle(t.deps);
    expect(t.calls).toEqual(['push', 'pull user', 'pull a', 'pull b']);
    expect(r).toEqual({ offline: false, errors: [], pushes: 1 });
  });

  it('uma escrita no meio dos pulls sobe antes do pull seguinte, não depois de todas as viagens', async () => {
    const t = setup({ trips: ['a', 'b', 'c'], during: { a: () => t.write() } });
    const r = await runCycle(t.deps);
    expect(t.calls).toEqual(['push', 'pull user', 'pull a', 'push', 'pull b', 'pull c']);
    expect(r.pushes).toBe(2);
  });

  it('sem escrita no meio, um push só', async () => {
    const t = setup({ trips: ['a', 'b', 'c'] });
    await runCycle(t.deps);
    expect(t.calls.filter((c) => c === 'push')).toHaveLength(1);
  });

  it('o push do meio que fica sem rede para o ciclo; o resto fica para o próximo', async () => {
    const t = setup({
      trips: ['a', 'b'],
      during: { a: () => t.write() },
      pushes: [sent(), offline()],
    });
    const r = await runCycle(t.deps);
    expect(t.calls).toEqual(['push', 'pull user', 'pull a', 'push']);
    expect(r.offline).toBe(true);
  });

  it('um erro de pull que não é de rede não segura as viagens seguintes', async () => {
    const t = setup({ trips: ['a', 'b'] });
    t.deps.pullTrip = (id) => {
      t.calls.push(`pull ${id}`);
      return id === 'a' ? Promise.reject(new Error('42501')) : Promise.resolve();
    };
    const r = await runCycle(t.deps);
    expect(t.calls).toEqual(['push', 'pull user', 'pull a', 'pull b']);
    expect(r.errors).toEqual(['42501']);
  });

  it('um erro de rede no pull sobe como está (o motor marca sem conexão)', async () => {
    const t = setup({ trips: ['a'] });
    t.deps.pullTrip = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(runCycle(t.deps)).rejects.toBeInstanceOf(TypeError);
  });
});
