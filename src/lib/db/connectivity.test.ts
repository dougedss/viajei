import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** O módulo guarda estado: cada teste começa de um novo, com o navegador dizendo `online`. */
async function fresh(browserOnline = true) {
  // o módulo só lê `navigator.onLine`
  vi.stubGlobal('navigator', { onLine: browserOnline });
  vi.resetModules();
  const mod = await import('./connectivity.ts');
  const retry = vi.fn();
  mod.connectivity.onRetry(retry);
  return { ...mod, retry };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('retryDelay', () => {
  it('3 s, 10 s, 30 s e daí a cada 60 s', async () => {
    const { retryDelay } = await fresh();
    expect([1, 2, 3, 4, 9].map(retryDelay)).toEqual([3_000, 10_000, 30_000, 60_000, 60_000]);
  });
});

describe('connectivity', () => {
  it('uma resposta que chega com o navegador sem rede não marca online', async () => {
    const { connectivity, retry } = await fresh(false);
    expect(connectivity.isOnline()).toBe(false);
    expect(connectivity.canTry()).toBe(false);
    // o pedido saiu antes de a rede cair; a resposta não desmente o navegador
    connectivity.markOnline();
    expect(connectivity.isOnline()).toBe(false);
    vi.advanceTimersByTime(120_000);
    expect(retry).not.toHaveBeenCalled();
  });

  it('falha de rede com o navegador online: pede nova tentativa, cada vez mais espaçada', async () => {
    const { connectivity, retry } = await fresh();
    connectivity.markOffline();
    expect(connectivity.isOnline()).toBe(false);
    expect(connectivity.canTry()).toBe(true);
    vi.advanceTimersByTime(2_999);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);

    // a nova tentativa também falhou
    connectivity.markOffline();
    vi.advanceTimersByTime(9_999);
    expect(retry).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('a primeira resposta do servidor marca online, cancela a tentativa e zera a espera', async () => {
    const { connectivity, retry } = await fresh();
    connectivity.markOffline();
    connectivity.markOffline();
    connectivity.markOnline();
    expect(connectivity.isOnline()).toBe(true);
    vi.advanceTimersByTime(120_000);
    expect(retry).not.toHaveBeenCalled();

    connectivity.markOffline();
    vi.advanceTimersByTime(3_000);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('navegador sem rede: nada é tentado, e o evento online traz o app de volta', async () => {
    const { connectivity, retry } = await fresh(false);
    expect(connectivity.canTry()).toBe(false);
    connectivity.markOffline();
    vi.advanceTimersByTime(120_000);
    expect(retry).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('online'));
    expect(connectivity.isOnline()).toBe(true);
  });

  it('o evento offline cancela a tentativa marcada', async () => {
    const { connectivity, retry } = await fresh();
    connectivity.markOffline();
    window.dispatchEvent(new Event('offline'));
    vi.advanceTimersByTime(120_000);
    expect(retry).not.toHaveBeenCalled();
  });
});
