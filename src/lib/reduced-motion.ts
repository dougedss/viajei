import { useSyncExternalStore } from 'react';

/**
 * `prefers-reduced-motion`, num lugar só: as cenas 3D, o replay, a abertura, os sons, o confete e
 * as trocas da garagem leem daqui. Os componentes HTML respeitam a mesma preferência pelas classes
 * `motion-reduce:` do Tailwind.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(fn: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}

export function readReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, readReducedMotion, () => false);
}
