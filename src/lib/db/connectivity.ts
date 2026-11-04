import { useSyncExternalStore } from 'react';

/**
 * Conectividade = eventos online/offline do navegador + resultado real das requisições.
 * `navigator.onLine` sozinho mente (Wi-Fi sem internet); uma requisição que falha de rede
 * marca offline, e qualquer resposta do servidor marca online de novo.
 */
let online = typeof navigator === 'undefined' ? true : navigator.onLine;
const listeners = new Set<() => void>();
let started = false;

function set(value: boolean) {
  if (online === value) return;
  online = value;
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => set(true));
  window.addEventListener('offline', () => set(false));
}

export const connectivity = {
  isOnline: () => online,
  markOnline: () => set(true),
  markOffline: () => set(false),
  subscribe: (listener: () => void) => {
    start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Erro de rede do fetch (sem resposta do servidor), em qualquer navegador. */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return /fetch|network|load failed/i.test(err.message);
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m: unknown = err.message;
    return typeof m === 'string' && /failed to fetch|network|load failed/i.test(m);
  }
  return false;
}

export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, () => true);
}
