import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, parseThemePref, readThemePref, THEME_KEY, writeThemePref } from './theme.ts';

/**
 * O tema do aparelho (fase 16): sistema, claro ou escuro. O `data-theme` no `<html>` e a cor da
 * barra do navegador acompanham; no "sistema", as duas `theme-color` voltam às delas (pela `media`).
 */
function metas(): { content: string }[] {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => ({
    content: m.getAttribute('content') ?? '',
  }));
}

function setupMetas() {
  document.head.innerHTML = `
    <meta name="theme-color" content="#F4F4F2" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#111722" media="(prefers-color-scheme: dark)" />`;
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('o tema do aparelho', () => {
  it('o padrão é o do sistema; só claro e escuro valem como escolha', () => {
    expect(parseThemePref(null)).toBe('system');
    expect(parseThemePref('light')).toBe('light');
    expect(parseThemePref('dark')).toBe('dark');
    expect(parseThemePref('sepia')).toBe('system');
  });

  it('escuro: data-theme no html e as duas barras na cor do papel escuro', () => {
    setupMetas();
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(metas().map((m) => m.content)).toEqual(['#111722', '#111722']);
  });

  it('claro: o mesmo, com o papel claro', () => {
    setupMetas();
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(metas().map((m) => m.content)).toEqual(['#F4F4F2', '#F4F4F2']);
  });

  it('sistema: sem data-theme, e cada barra volta à sua (a media escolhe)', () => {
    setupMetas();
    applyTheme('dark');
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(metas().map((m) => m.content)).toEqual(['#F4F4F2', '#111722']);
  });

  it('a escolha fica no aparelho; o sistema não guarda nada', () => {
    setupMetas();
    writeThemePref('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(readThemePref()).toBe('dark');
    writeThemePref('system');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(readThemePref()).toBe('system');
  });

  it('o script do index.html faz o mesmo antes do primeiro quadro (a mesma chave e as mesmas cores)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`);
    expect(html).toContain("t === 'dark' ? '#111722' : '#F4F4F2'");
    // antes do script do app: aplica antes de qualquer coisa pintar
    expect(html.indexOf(THEME_KEY)).toBeLessThan(html.indexOf('/src/app/main.tsx'));
  });
});
