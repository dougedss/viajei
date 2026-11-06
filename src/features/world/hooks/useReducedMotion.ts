import { useSyncExternalStore } from 'react';

/**
 * `prefers-reduced-motion`, central: a cena, o replay, a abertura e os sons leem daqui. Os
 * componentes HTML já respeitam a mesma preferência pelas classes `motion-reduce:` do Tailwind.
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
