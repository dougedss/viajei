import { useEffect, useRef, type RefObject } from 'react';
import type { WorldRuntime } from '../scene/runtime.ts';

/**
 * Prende um elemento a um ponto do mundo pelo enquadramento atual (o chip do clima sobre a origem
 * na abertura): o laço da cena o reposiciona a cada quadro em movimento.
 */
export function useWorldAnchor(
  runtime: WorldRuntime,
  point: readonly [number, number, number] | null,
  lift = 0,
): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !point) return;
    const [x, y, z] = point;
    const place = () => {
      const p = runtime.project([x, y + lift, z]);
      el.style.left = `${String(Math.round(p.x))}px`;
      el.style.top = `${String(Math.round(p.y))}px`;
      el.hidden = !p.visible;
    };
    place();
    return runtime.register(place);
  }, [runtime, point, lift]);
  return ref;
}
