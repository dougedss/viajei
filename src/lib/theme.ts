import { useEffect } from 'react';

/**
 * Força um tema no `<html>` enquanto a tela está aberta e devolve o anterior ao sair (os tokens
 * trocam sozinhos, D3). A garagem usa o escuro de estúdio, como o Modo Viagem usa a noite.
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
