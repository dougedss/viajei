import { useEffect } from 'react';
import type { LayoutPlace } from '@/features/world/layout.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { placesOfDay, syncLandmarks } from './sync.ts';

/**
 * Pede ao catálogo os lugares do dia quando o roteiro está pronto e há internet (fase 23), e, se o
 * servidor devolveu uma receita gerada para este aparelho conferir, roda a conferência (o módulo da
 * segunda olhada entra por import dinâmico: ele traz o construtor e um renderer fora da tela).
 */
export function useLandmarkSync(input: {
  tripId: string;
  stops: readonly Stop[];
  cities: readonly LayoutPlace[];
  ready: boolean;
}): void {
  const online = useOnline();
  const places = placesOfDay(input.stops, input.cities);
  const placesKey = places.map((p) => p.key).join('|');
  const { tripId, ready } = input;
  useEffect(() => {
    if (!ready || !online || placesKey === '') return;
    let alive = true;
    void syncLandmarks(tripId, places).then(async (entries) => {
      if (!entries?.some((e) => e.status === 'check')) return;
      const { runPendingChecks } = await import('./check.ts');
      if (!alive) return;
      await runPendingChecks(tripId);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- os lugares entram pela chave estável
  }, [tripId, ready, online, placesKey]);
}
