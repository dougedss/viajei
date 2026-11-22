import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FONT_FACES, loadFonts, fontsSettled, resetFontsForTests } from './fonts.ts';

/**
 * As fontes antes do texto (fase 27, a 3.0): todas as faces são pedidas de uma vez, a espera termina
 * quando chegam ou quando o teto passa, e a segunda chamada não pede de novo.
 */
describe('loadFonts', () => {
  beforeEach(() => {
    resetFontsForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pede todas as faces e resolve true quando todas chegam; a segunda chamada é a mesma promessa', async () => {
    const asked: string[] = [];
    const fonts = {
      load: (face: string) => {
        asked.push(face);
        return Promise.resolve([] as FontFace[]);
      },
    };
    const first = loadFonts(fonts, 2_000);
    expect(loadFonts(fonts, 2_000)).toBe(first);
    await expect(first).resolves.toBe(true);
    expect(asked).toEqual([...FONT_FACES]);
    expect(fontsSettled()).toBe(true);
  });

  it('uma fonte que não vem não segura a tela: false quando o teto passa', async () => {
    const fonts = { load: () => new Promise<FontFace[]>(() => undefined) };
    const p = loadFonts(fonts, 2_000);
    expect(fontsSettled()).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(p).resolves.toBe(false);
    expect(fontsSettled()).toBe(true);
  });

  it('o carregamento que falha também libera a tela', async () => {
    const fonts = { load: () => Promise.reject(new Error('rede')) };
    await expect(loadFonts(fonts, 2_000)).resolves.toBe(false);
  });

  it('sem document.fonts (um navegador antigo), resolve na hora', async () => {
    await expect(loadFonts(undefined)).resolves.toBe(true);
    expect(fontsSettled()).toBe(true);
  });
});
