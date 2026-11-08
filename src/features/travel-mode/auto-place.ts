import { haversineM } from '@shared/geo.ts';
import type { StopKind } from '@shared/constants.ts';
import type { ReverseRow } from '@/lib/geocode/nominatim.ts';
import { isoToWall } from '@/lib/time/index.ts';
import type { Place } from './stop-detector.ts';

/**
 * O nome e o tipo da parada que se registrou sozinha (fase 15), puros, a partir do que o Nominatim
 * devolve para o ponto. Nunca inventado: o nome é o do OSM (o lugar, ou a rua e a cidade), e sem
 * nada do OSM a parada se chama pela hora medida da chegada.
 */
export type AutoPlace = { name: string; kind: StopKind; address: string | null };

/** O lugar tem de estar a até 60 m do centro da parada: mais longe, é o vizinho, não onde se parou. */
export const PLACE_RADIUS_M = 60;
/** O `check` de `stops.name`. */
export const NAME_MAX = 120;

const FOOD_AMENITY = new Set(['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream']);
const LODGING = new Set(['hotel', 'motel', 'guest_house', 'hostel']);
const NATURE_LEISURE = new Set(['park', 'nature_reserve']);
/** O que não é um lugar onde se para: a via, a cidade, o limite, o uso do solo. */
const NOT_A_PLACE = new Set(['highway', 'place', 'boundary', 'landuse']);

/**
 * A classe do OSM vira o tipo: posto → Posto; restaurante, café, lanchonete, praça de alimentação,
 * sorveteria e padaria → Comida; hotel, motel, pousada e albergue → Hotel; mirante, natureza
 * (`natural=*`), parque, reserva e cachoeira → Natureza; vinícola e vinhedo → Vinícola; o resto
 * (inclusive as lojas: Compras não é tipo) → Outro.
 */
export function kindFromOsm(category: string | undefined, type: string | undefined): StopKind {
  const c = category ?? '';
  const t = type ?? '';
  if (c === 'amenity' && t === 'fuel') return 'fuel';
  if (c === 'amenity' && FOOD_AMENITY.has(t)) return 'food';
  if (c === 'shop' && t === 'bakery') return 'food';
  if (c === 'tourism' && LODGING.has(t)) return 'hotel';
  if (c === 'tourism' && t === 'viewpoint') return 'nature';
  if (c === 'natural') return 'nature';
  if (c === 'leisure' && NATURE_LEISURE.has(t)) return 'nature';
  if (c === 'waterway' && t === 'waterfall') return 'nature';
  if (c === 'boundary' && (t === 'national_park' || t === 'protected_area')) return 'nature';
  if ((c === 'craft' && t === 'winery') || (c === 'landuse' && t === 'vineyard')) return 'winery';
  return 'other';
}

/** Os nomes de via masculinos ("no Viaduto do Chá"); o resto (rua, avenida, rodovia, BR-116) é "na". */
const MASCULINE =
  /^(largo|viaduto|acesso|anel|contorno|caminho|beco|elevado|túnel|tunel|trevo|ramal|retorno|parque|calçadão|calcadao|corredor|eixo|passeio|pátio|patio)\b/i;

/** O texto do OSM sem espaços nas pontas; vazio é ausente. */
function text(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t === undefined || t === '' ? null : t;
}

function road(row: ReverseRow): string | null {
  const highway = row.category === 'highway';
  const ref = highway ? text(row.namedetails?.ref?.split(';')[0]) : null;
  return ref ?? text(row.address?.road) ?? (highway ? text(row.name) : null);
}

function city(row: ReverseRow): string | null {
  const a = row.address ?? {};
  return text(a.city) ?? text(a.town) ?? text(a.village) ?? text(a.municipality);
}

function clip(name: string): string {
  return name.length <= NAME_MAX ? name : `${name.slice(0, NAME_MAX - 1).trimEnd()}…`;
}

/**
 * O que a resposta do OSM diz da parada: o lugar com nome a até 60 m (o posto, o restaurante),
 * com o tipo pela classe; sem lugar ali, a parada se chama pela via e pela cidade ("Parada na
 * BR-116, Campina Grande do Sul") ou só pela cidade, e é Outro. O quilômetro da rodovia não vem do
 * OSM e não entra. Sem nada, `null`: fica o nome pela hora.
 */
export function placeFromReverse(row: ReverseRow | null, center: Place): AutoPlace | null {
  if (!row) return null;
  const address = text(row.display_name);
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  const near =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    haversineM([lng, lat], [center.lng, center.lat]) <= PLACE_RADIUS_M;
  const name = text(row.name);
  const kind = kindFromOsm(row.category, row.type);
  const placeLike = !NOT_A_PLACE.has(row.category ?? '') || kind === 'winery';
  if (near && name && placeLike) return { name: clip(name), kind, address };

  const via = road(row);
  const town = city(row);
  if (via) {
    const prep = MASCULINE.test(via) ? 'no' : 'na';
    return {
      name: clip(`Parada ${prep} ${via}${town ? `, ${town}` : ''}`),
      kind: 'other',
      address,
    };
  }
  if (town) return { name: clip(`Parada em ${town}`), kind: 'other', address };
  return null;
}

/** Sem o OSM (sem sinal, ou nada no ponto): "Parada às 14h20", pela hora medida da chegada. */
export function provisionalName(arrivedAt: number): string {
  const { time } = isoToWall(new Date(arrivedAt).toISOString());
  return `Parada às ${time.replace(':', 'h')}`;
}
