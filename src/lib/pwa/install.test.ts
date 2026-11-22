import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * O retrato da instalação certo já na primeira leitura (fase 26, D307): o convite de instalar não pode
 * entrar uma pintura depois da lista de viagens (o `useSyncExternalStore` lê antes de se inscrever).
 */
afterEach(() => {
  vi.resetModules();
  Reflect.deleteProperty(window, 'onbeforeinstallprompt');
});

describe('install', () => {
  it('num navegador que sabe instalar, o primeiro retrato já diz que sabe, antes de qualquer inscrição', async () => {
    Object.defineProperty(window, 'onbeforeinstallprompt', {
      value: null,
      writable: true,
      configurable: true,
    });
    const { install } = await import('./install.ts');
    expect(install.getSnapshot()).toMatchObject({ supported: true, canPrompt: false });
    // a leitura seguinte devolve o mesmo retrato (o useSyncExternalStore exige)
    expect(install.getSnapshot()).toBe(install.getSnapshot());
  });

  it('num navegador sem o evento, nem sabe instalar nem tem o pedido', async () => {
    const { install } = await import('./install.ts');
    expect(install.getSnapshot()).toMatchObject({ supported: false, canPrompt: false });
  });

  it('o evento do navegador liga o pedido nativo e avisa quem se inscreveu', async () => {
    Object.defineProperty(window, 'onbeforeinstallprompt', {
      value: null,
      writable: true,
      configurable: true,
    });
    const { install } = await import('./install.ts');
    const seen = vi.fn();
    const off = install.subscribe(seen);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => Promise.resolve(),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });
    window.dispatchEvent(event);
    expect(seen).toHaveBeenCalled();
    expect(install.getSnapshot().canPrompt).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    off();
  });
});
