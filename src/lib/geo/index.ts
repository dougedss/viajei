/**
 * lib/geo: leitura do lugar a partir da rota real e dos dados embutidos. Funções puras; os dados
 * (costa, biomas, municípios) são decodificados sob demanda. Importe este módulo de forma lazy
 * nas telas, para o chunk com os dados só baixar quando a leitura é pedida.
 */
import { curiosities, type Curiosity } from './curiosities.ts';
import { classifySegments, samplePlaces, type RouteShape, type Segment } from './segments.ts';

export { biomeAt } from './biomes.ts';
export { distanceToCoast } from './coast.ts';
export { curiosities, type Curiosity, type CuriosityKind } from './curiosities.ts';
export { DATA_SOURCES } from './data.ts';
export {
  arrivalAt,
  ARRIVAL_DWELL_MS,
  ARRIVAL_RADIUS_M,
  DEPARTURE_RADIUS_M,
  hasArrived,
  hasDeparted,
  type Fix,
} from './geofence.ts';
export { largestMunicipalityWithin, nearestMunicipality } from './municipalities.ts';
export {
  indexRoute,
  isOffRoute,
  OFF_ROUTE_M,
  projectOntoRoute,
  type Projection,
} from './project.ts';
export {
  classifySample,
  classifySegments,
  samplePlaces,
  SCENERY_LABELS,
  type PlaceSample,
  type RouteShape,
  type SceneryKind,
  type Segment,
} from './segments.ts';

export type PlaceReading = { segments: Segment[]; curiosities: Curiosity[] };

/** A leitura completa de um dia: as partes do cenário e as curiosidades do caminho. */
export function readPlace(route: RouteShape): PlaceReading {
  const samples = samplePlaces(route);
  const segments = classifySegments(route);
  return { segments, curiosities: curiosities(route.elevation, samples, segments) };
}
