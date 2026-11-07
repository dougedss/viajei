import { useEffect, useState } from 'react';

/**
 * O nome do município de um ponto ("Papanduva"), pelos dados embutidos (`nearestMunicipality`). O
 * módulo `lib/geo` entra por import dinâmico, o mesmo chunk da leitura do lugar da maquete (já no
 * precache, funciona sem rede). Longe de qualquer centro (mais de 15 km), vale o nome de reserva (o da
 * parada). Memorizado num cache de módulo, por ponto.
 */
const FAR_M = 15_000;
const cache = new Map<string, string | null>();
const keyOf = (lat: number, lng: number) => `${lat.toFixed(3)},${lng.toFixed(3)}`;

export function usePlaceName(
  point: { lat: number; lng: number } | null,
  fallback: string | null,
): string | null {
  const lat = point?.lat ?? null;
  const lng = point?.lng ?? null;
  const key = lat !== null && lng !== null ? keyOf(lat, lng) : null;
  const [, bump] = useState(0);
  useEffect(() => {
    if (lat === null || lng === null || !key || cache.has(key)) return;
    let alive = true;
    void import('@/lib/geo/index.ts').then(({ nearestMunicipality }) => {
      const found = nearestMunicipality(lng, lat);
      cache.set(key, found && found.distance_m <= FAR_M ? found.municipality.name : null);
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng, key]);
  const name = key ? cache.get(key) : null;
  return name ?? fallback;
}
