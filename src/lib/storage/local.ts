import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferências por aparelho em `localStorage`, com um hook que redesenha quem lê quando alguém
 * grava (na mesma aba, por um emissor de módulo; em outra aba, pelo evento `storage`). Leitura e
 * escrita tolerantes: sem `localStorage` (modo privado, teste), tudo segue o padrão.
 */
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
}

export function readLocal(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, value);
  } catch {
    /* sem storage: a preferência vale só nesta sessão da página */
  }
  notify(key);
}

function subscribe(key: string, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) fn();
  };
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow) window.addEventListener('storage', onStorage);
  return () => {
    set.delete(fn);
    if (hasWindow) window.removeEventListener('storage', onStorage);
  };
}

/** O valor guardado em `key`, interpretado por `parse`, sempre atual. */
export function useLocalValue<T>(key: string, parse: (raw: string | null) => T): T {
  const sub = useCallback((fn: () => void) => subscribe(key, fn), [key]);
  const get = useCallback(() => readLocal(key), [key]);
  const raw = useSyncExternalStore(sub, get, get);
  return parse(raw);
}
