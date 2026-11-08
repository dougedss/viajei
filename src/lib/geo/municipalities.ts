import { fastDistanceM } from '@shared/geo.ts';
import { municipalities, type Municipality } from './municipalities-data.ts';

export type NearestMunicipality = { municipality: Municipality; distance_m: number };

/** O município cujo centro está mais perto, com a distância até ele. */
export function nearestMunicipality(lng: number, lat: number): NearestMunicipality | null {
  let best: NearestMunicipality | null = null;
  for (const m of municipalities()) {
    // corte grosseiro em graus antes da conta em metros (1° ≈ 111 km)
    if (Math.abs(m.lat - lat) > 2 || Math.abs(m.lng - lng) > 2) continue;
    const d = fastDistanceM([lng, lat], [m.lng, m.lat]);
    if (!best || d < best.distance_m) best = { municipality: m, distance_m: d };
  }
  if (best) return best;
  for (const m of municipalities()) {
    const d = fastDistanceM([lng, lat], [m.lng, m.lat]);
    if (!best || d < best.distance_m) best = { municipality: m, distance_m: d };
  }
  return best;
}

/** O município mais populoso cujo centro está a menos de `radiusM`: é ele que faz uma "cidade grande". */
export function largestMunicipalityWithin(
  lng: number,
  lat: number,
  radiusM: number,
): NearestMunicipality | null {
  let best: NearestMunicipality | null = null;
  const degrees = radiusM / 111_000 + 0.01;
  for (const m of municipalities()) {
    if (Math.abs(m.lat - lat) > degrees || Math.abs(m.lng - lng) > degrees) continue;
    const d = fastDistanceM([lng, lat], [m.lng, m.lat]);
    if (d > radiusM) continue;
    if (!best || m.pop > best.municipality.pop) best = { municipality: m, distance_m: d };
  }
  return best;
}
