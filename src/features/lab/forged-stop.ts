/**
 * A parada forjada da fase 15, a mesma no e2e (`e2e/parada-auto.spec.ts`) e no laboratório
 * (`app_parada_auto`): uma estrada reta num lugar inventado, um posto a 80 m dela e a resposta do
 * Nominatim para o posto. Nenhuma coordenada de viagem de verdade (o repositório e os logs são
 * públicos), e nada vai ao OSM: a `route-day` e o `/reverse` são respondidos pelo teste.
 */
const M_PER_DEG = (6371008.8 * Math.PI) / 180;
const LAT0 = -27.2;
const LNG0 = -50.9;
const COS = Math.cos((LAT0 * Math.PI) / 180);

/** O ponto a `x` metros para leste do começo da estrada e `y` metros ao norte, como o Playwright quer. */
export function forgedPoint(x: number, y = 0): { latitude: number; longitude: number } {
  return { latitude: LAT0 + y / M_PER_DEG, longitude: LNG0 + x / (M_PER_DEG * COS) };
}

/** A saída (já deixada), o parque (a próxima, a 20 km) e o posto no meio, fora do roteiro. */
export const FORGED = {
  originX: 0,
  parkX: 20_000,
  posto: { x: 8_000, y: 80 },
  /** um nome comprido do OSM: tem de caber a 393 e a 360 px */
  postoName: 'Auto Posto do Laboratório Rodovia da Serra Azul km 180',
  road: 'Rodovia da Serra Azul',
  town: 'Vale Inventado',
} as const;

/**
 * A `route-day` respondida: uma estrada reta entre os pontos de passagem, com um vértice a cada
 * 200 m (como uma rota de verdade simplificada), um trecho por par e a altitude plana.
 */
export function forgedRouteDay(waypoints: readonly [number, number][]) {
  const geometry: [number, number][] = [];
  const legs: { distance_m: number; duration_s: number }[] = [];
  waypoints.forEach((p, i) => {
    const next = waypoints[i + 1];
    if (!next) {
      geometry.push([p[0], p[1]]);
      return;
    }
    const dx = (next[0] - p[0]) * M_PER_DEG * COS;
    const dy = (next[1] - p[1]) * M_PER_DEG;
    const meters = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(meters / 200));
    for (let k = 0; k < steps; k++) {
      geometry.push([p[0] + ((next[0] - p[0]) * k) / steps, p[1] + ((next[1] - p[1]) * k) / steps]);
    }
    legs.push({ distance_m: Math.round(meters), duration_s: Math.round(meters / 22) });
  });
  const total = legs.reduce((acc, l) => acc + l.distance_m, 0);
  return {
    provider: 'ors',
    fetched_at: new Date().toISOString(),
    geometry,
    legs,
    elevation: [
      [0, 800],
      [total, 800],
    ],
  };
}

/** O `/reverse` do Nominatim (jsonv2) para o posto: a classe, o nome e o endereço do OSM. */
export function forgedReverse() {
  const { latitude, longitude } = forgedPoint(FORGED.posto.x + 8, FORGED.posto.y + 5);
  return {
    place_id: 1,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'node',
    osm_id: 1,
    lat: String(latitude),
    lon: String(longitude),
    category: 'amenity',
    type: 'fuel',
    place_rank: 30,
    addresstype: 'amenity',
    name: FORGED.postoName,
    display_name: `${FORGED.postoName}, ${FORGED.road}, ${FORGED.town}, Brasil`,
    address: {
      amenity: FORGED.postoName,
      road: FORGED.road,
      town: FORGED.town,
      country: 'Brasil',
    },
    namedetails: { name: FORGED.postoName },
  };
}

/** O tremor do GPS parado no posto (determinístico): ±3 m em volta dele. */
export function postoFix(i: number): { latitude: number; longitude: number } {
  return forgedPoint(
    FORGED.posto.x + Math.sin(i * 1.7) * 3,
    FORGED.posto.y + Math.cos(i * 2.3) * 3,
  );
}
