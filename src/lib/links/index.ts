/**
 * Links de navegação e leitura de links colados. Puro, sem React. O Viajei não navega: ele abre o
 * Google Maps ou o Waze com a coordenada quando existe, senão com o endereço. E lê coordenadas
 * de um link do Google Maps colado no formulário, para ninguém digitar latitude na mão.
 */

export type Coords = { lat: number; lng: number };

const LAT = /-?\d{1,2}(?:\.\d+)?/.source;
const LNG = /-?\d{1,3}(?:\.\d+)?/.source;
const PATTERNS: RegExp[] = [
  // .../data=!3d-26.37!4d-50.14 (pino do lugar, mais preciso que o @ da câmera)
  new RegExp(`!3d(${LAT})!4d(${LNG})`),
  // https://www.google.com/maps/place/Nome/@-26.37,-50.14,15z
  new RegExp(`@(${LAT}),(${LNG})`),
  // ?q=-26.37,-50.14 · ?q=loc:-26.37,-50.14 · ?ll= · ?destination= · ?center= · ?query=
  new RegExp(`[?&](?:q|query|ll|destination|center|daddr|saddr)=(?:loc:)?(${LAT}),(${LNG})`),
  // https://www.google.com/maps/place/-26.37,-50.14 · /maps/@... já coberto · /maps/dir//-26.37,-50.14
  new RegExp(`/(?:place|dir|search)/+(${LAT}),(${LNG})`),
  // "-26.37, -50.14" colado puro
  new RegExp(`^\\s*(${LAT})\\s*,\\s*(${LNG})\\s*$`),
];

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** Coordenadas de um link do Google Maps (ou de "lat, lng" puro). `null` quando não há. */
export function parseMapsLink(text: string): Coords | null {
  let s = text.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // mantém como está: um % solto não impede os padrões
  }
  for (const re of PATTERNS) {
    const m = re.exec(s);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }
  return null;
}

/** Links curtos não dá para expandir do navegador (CORS): a pessoa abre e cola o completo. */
export function isShortMapsLink(text: string): boolean {
  return /(?:^|\/\/)(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|maps\.google\.[a-z.]+\/\?link)/i.test(
    text.trim(),
  );
}

type Place = { lat: number | null; lng: number | null; name: string; address: string | null };

function target(place: Place): string | null {
  if (place.lat !== null && place.lng !== null) return `${place.lat},${place.lng}`;
  const q = place.address ?? place.name;
  return q.trim() === '' ? null : q;
}

/** Deep link do Google Maps: com lat/lng quando houver, senão com o endereço ou o nome. */
export function googleMapsUrl(place: Place): string | null {
  const t = target(place);
  if (t === null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(t)}`;
}

/** Deep link do Waze. */
export function wazeUrl(place: Place): string | null {
  if (place.lat !== null && place.lng !== null) {
    return `https://waze.com/ul?ll=${place.lat},${place.lng}&navigate=yes`;
  }
  const q = place.address ?? place.name;
  if (q.trim() === '') return null;
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}
