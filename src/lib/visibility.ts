import { useSyncExternalStore } from 'react';

/** A página está visível (`document.visibilityState`), num lugar só e sempre atual. */
function subscribe(fn: () => void): () => void {
  if (typeof document === 'undefined') return () => undefined;
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
}

export function readVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, readVisible, () => true);
}
