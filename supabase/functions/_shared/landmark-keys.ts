/**
 * As chaves dos lugares do app no catálogo dos cartões-postais (fase 23), as mesmas no app, na função
 * e no banco (`landmark_places.place_key`, conferida por expressão na 0017):
 *  - `osm:w607776738`: a parada escolhida no mapa pela conversa (o objeto do OSM, o mais preciso);
 *  - `geo:jardim-botanico@-25.443,-49.239`: a parada com nome e coordenada, sem o objeto do OSM (a
 *    coordenada arredondada a três casas, ~100 m: duas pessoas que marcam o mesmo lugar à mão caem na
 *    mesma chave);
 *  - `city:PR:ponta-grossa`: a cidade de passagem (D220), pela UF e pelo nome.
 * O servidor junta chaves que são o mesmo item do Wikidata numa peça só.
 */
export const PLACE_KEY_RE =
  /^(osm:[nwr][0-9]{1,15}|geo:[a-z0-9-]{1,80}@-?[0-9]{1,3}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}|city:[A-Z]{2}:[a-z0-9-]{1,80})$/;

/** Um nome como fica numa chave: sem acento, minúsculo, só letras, dígitos e hífens, até 80. */
export function slugOf(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export type OsmType = 'node' | 'way' | 'relation';
const OSM_LETTER: Record<OsmType, 'n' | 'w' | 'r'> = { node: 'n', way: 'w', relation: 'r' };

export function osmKey(type: OsmType, id: number): string {
  return `osm:${OSM_LETTER[type]}${String(id)}`;
}

/** A chave de uma parada: pelo objeto do OSM; senão pelo nome e pela coordenada; sem coordenada, nada. */
export function stopPlaceKey(stop: {
  name: string;
  lat: number | null;
  lng: number | null;
  osm_type?: string | null;
  osm_id?: number | null;
}): string | null {
  if (
    (stop.osm_type === 'node' || stop.osm_type === 'way' || stop.osm_type === 'relation') &&
    typeof stop.osm_id === 'number' &&
    Number.isInteger(stop.osm_id) &&
    stop.osm_id > 0
  ) {
    return osmKey(stop.osm_type, stop.osm_id);
  }
  if (
    stop.lat === null ||
    stop.lng === null ||
    !Number.isFinite(stop.lat) ||
    !Number.isFinite(stop.lng)
  ) {
    return null;
  }
  const slug = slugOf(stop.name);
  if (!slug) return null;
  const key = `geo:${slug}@${stop.lat.toFixed(3)},${stop.lng.toFixed(3)}`;
  return PLACE_KEY_RE.test(key) ? key : null;
}

export function cityPlaceKey(uf: string, name: string): string | null {
  const slug = slugOf(name);
  const key = `city:${uf.toUpperCase()}:${slug}`;
  return slug && PLACE_KEY_RE.test(key) ? key : null;
}
