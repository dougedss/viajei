import { useEffect, useState } from 'react';
import { isNight } from '@/lib/time/index.ts';

/** "Agora" que avança sozinho: redesenha a cada `intervalMs` e ao voltar para a aba. */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);
  return now;
}

/**
 * Tema noturno automático no Modo Viagem: das 18:30 às 6:00 o `data-theme="dark"` entra no
 * `<html>` (os tokens trocam sozinhos) e sai quando a tela fecha. Regra simples por hora nesta fase.
 */
export function useNightTheme(now: Date): boolean {
  const night = isNight(now);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    if (night) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    return () => {
      if (previous === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous;
    };
  }, [night]);
  return night;
}
