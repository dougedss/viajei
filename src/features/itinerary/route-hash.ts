import type { LngLat } from '@/lib/db/schema.ts';
import { fnv64 } from '@/lib/ids/hash.ts';

/**
 * O hash das coordenadas que geraram uma rota, puro (sem o client do Supabase, para os módulos de
 * regras e os testes poderem importar): FNV-1a sobre as coordenadas com 5 casas (≈ 1 m). Muda só
 * quando uma parada muda de lugar.
 */
export function waypointsHash(waypoints: readonly LngLat[]): string {
  return fnv64(JSON.stringify(waypoints.map(([lng, lat]) => [lng.toFixed(5), lat.toFixed(5)])));
}

/** O mesmo hash, das paradas com coordenada, na ordem do dia. */
export function waypointsHashOf(stops: readonly { lat: number; lng: number }[]): string {
  return waypointsHash(stops.map((s): LngLat => [s.lng, s.lat]));
}
