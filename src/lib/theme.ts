import { useEffect } from 'react';
import { readLocal, useLocalValue, writeLocal } from './storage/local.ts';

/**
 * O tema do app (fase 16): o do sistema, claro ou escuro, escolhido no Perfil e guardado no aparelho
 * (`localStorage`). Os tokens trocam sozinhos pelo `data-theme` do `<html>` (D3); sem ele, valem os
 * do sistema (`prefers-color-scheme`). O `index.html` aplica a escolha antes do primeiro quadro, com
 * o mesmo código desta `applyTheme` escrito à mão (nada pisca ao abrir), e a cor da barra do
 * navegador (`theme-color`) acompanha.
 */
export type ThemePref = 'system' | 'light' | 'dark';

export const THEME_KEY = 'viajei:theme';

/** A cor da barra do navegador em cada tema: o papel (`--paper`) de cada um. */
export const THEME_COLOR = { light: '#F4F4F2', dark: '#111722' } as const;

export function parseThemePref(raw: string | null): ThemePref {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/**
 * Aplica no documento: o `data-theme` (sem ele no "sistema") e a cor da barra. No "sistema", as duas
 * `<meta name="theme-color">` voltam às cores delas, que escolhem pela `media`.
 */
export function applyTheme(pref: ThemePref, doc: Document = document): void {
  const root = doc.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    const own = (meta.getAttribute('media') ?? '').includes('dark')
      ? THEME_COLOR.dark
      : THEME_COLOR.light;
    meta.setAttribute('content', pref === 'system' ? own : THEME_COLOR[pref]);
  }
}

export function readThemePref(): ThemePref {
  return parseThemePref(readLocal(THEME_KEY));
}

/** Grava a escolha deste aparelho e aplica na hora. */
export function writeThemePref(pref: ThemePref): void {
  writeLocal(THEME_KEY, pref === 'system' ? null : pref);
  applyTheme(pref);
}

export function useThemePref(): ThemePref {
  return useLocalValue(THEME_KEY, parseThemePref);
}

/**
 * Força um tema no `<html>` enquanto a tela está aberta e devolve o anterior ao sair (os tokens
 * trocam sozinhos, D3). A garagem usa o escuro de estúdio, como o Modo Viagem usa a noite. O
 * "anterior" é o que a pessoa escolheu no Perfil (ou nenhum, no tema do sistema).
 */
export function useThemeOverride(theme: 'dark' | 'light'): void {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.theme = theme;
    return () => {
      if (previous === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous;
    };
  }, [theme]);
}
