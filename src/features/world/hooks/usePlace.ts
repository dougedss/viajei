import { useEffect, useState } from 'react';
import type { DayRoute } from '@/lib/db/schema.ts';
import type { PlaceReading } from '@/lib/geo/index.ts';

/**
 * A leitura do lugar (cenários e curiosidades) da rota do dia, calculada no celular com os dados
 * embutidos. O módulo `lib/geo` entra por import dinâmico (chunk de ~190 KB, D26) e só quando há
 * rota. Memorizada pelo hash da rota num cache de módulo: a mesma rota não é lida duas vezes, e a
 * leitura já feita volta na primeira renderização.
 */
const cache = new Map<string, PlaceReading>();

export function usePlace(
  route: Pick<DayRoute, 'hash' | 'geometry' | 'elevation'> | null,
): PlaceReading | null {
  const hash = route?.hash ?? null;
  const [, bump] = useState(0);
  const cached = hash ? cache.get(hash) : undefined;
  useEffect(() => {
    if (!route || !hash || cache.has(hash)) return;
    let alive = true;
    void import('@/lib/geo/index.ts').then(({ readPlace }) => {
      cache.set(hash, readPlace({ geometry: route.geometry, elevation: route.elevation }));
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [route, hash]);
  return cached ?? null;
}

type Readable = Pick<DayRoute, 'hash' | 'geometry' | 'elevation'>;

/**
 * As leituras de várias rotas de uma vez (fase 28: uma por trecho do dia), pelo mesmo cache por hash;
 * `null` na rota que ainda não foi lida e na posição sem rota. O módulo `lib/geo` entra uma vez.
 */
export function usePlaces(routes: readonly (Readable | null)[]): (PlaceReading | null)[] {
  const key = routes.map((r) => r?.hash ?? '').join('|');
  const [, bump] = useState(0);
  useEffect(() => {
    const missing = routes.filter((r): r is Readable => r !== null && !cache.has(r.hash));
    if (missing.length === 0) return;
    let alive = true;
    void import('@/lib/geo/index.ts').then(({ readPlace }) => {
      for (const r of missing) {
        if (!cache.has(r.hash)) {
          cache.set(r.hash, readPlace({ geometry: r.geometry, elevation: r.elevation }));
        }
      }
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as rotas entram pelos hashes
  }, [key]);
  return routes.map((r) => (r ? (cache.get(r.hash) ?? null) : null));
}
