import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';

/**
 * As respostas de mentira das fontes públicas e da IA para os testes dos cartões-postais (fase 23):
 * reais na forma (os campos que as APIs devolvem, conferidos em 20/11/2026 para o Jardim Botânico de
 * Curitiba: a geocodificação e o detalhe de lugar da Geoapify, a Places, o Wikidata, o Commons) e
 * inventadas no conteúdo onde importa (os títulos das fotos, os autores). Nenhum pixel real: as
 * "fotos" são um PNG de 1 × 1.
 */
export const PNG_1x1 = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0,
  0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255, 255, 63, 0, 5, 254, 2,
  254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const square = (lng: number, lat: number, d: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng - d, lat - d],
      [lng + d, lat - d],
      [lng + d, lat + d],
      [lng - d, lat + d],
      [lng - d, lat - d],
    ],
  ],
});

/** A geocodificação (`format=json`): o parque pelo nome, perto da coordenada. */
export const GEOCODE_PARK = {
  results: [
    {
      place_id: 'pid-park',
      name: 'Jardim Botânico de Curitiba',
      formatted: 'Jardim Botânico de Curitiba, Curitiba - PR, Brasil',
      lat: -25.4425,
      lon: -49.2388,
      bbox: { lon1: -49.2426, lat1: -25.444, lon2: -49.2349, lat2: -25.4395 },
      category: 'leisure.park',
      result_type: 'amenity',
    },
  ],
};
/** A geocodificação pelo nome da estufa (o objeto ao redor que a IA escolhe). */
export const GEOCODE_GREENHOUSE = {
  results: [
    {
      place_id: 'pid-estufa',
      name: 'Estufa Jardim Botânico',
      lat: -25.4428,
      lon: -49.2392,
      category: 'building',
      result_type: 'amenity',
    },
  ],
};
/** Um lugar sem item no Wikidata (a padaria). */
export const GEOCODE_BAKERY = {
  results: [
    {
      place_id: 'pid-padaria',
      name: 'Padaria da esquina',
      lat: -25.4435,
      lon: -49.238,
      category: 'commercial.food_and_drink.bakery',
      result_type: 'amenity',
    },
  ],
};

const details = (
  placeId: string,
  name: string,
  lat: number,
  lon: number,
  categories: string[],
  raw: Record<string, unknown>,
  geometry: unknown,
  wiki?: { wikidata: string; wikipedia: string },
) => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry,
      properties: {
        feature_type: 'details',
        place_id: placeId,
        name,
        lat,
        lon,
        categories,
        ...(wiki ? { wiki_and_media: wiki } : {}),
        datasource: { sourcename: 'openstreetmap', raw: { name, ...raw } },
      },
    },
  ],
});
/** O detalhe do parque (o lugar): o objeto do OSM, o item do Wikidata e a planta. */
export const DETAILS_PARK = details(
  'pid-park',
  'Jardim Botânico de Curitiba',
  -25.4425,
  -49.2388,
  ['leisure', 'leisure.park'],
  { osm_id: 607776738, osm_type: 'w', leisure: 'park', wikidata: 'Q94923' },
  square(-49.2388, -25.4425, 0.003),
  { wikidata: 'Q94923', wikipedia: 'pt:Jardim Botânico de Curitiba' },
);
/** O detalhe da estufa (a peça): sem item do Wikidata, com a planta. */
export const DETAILS_GREENHOUSE = details(
  'pid-estufa',
  'Estufa Jardim Botânico',
  -25.4428,
  -49.2392,
  ['building'],
  { osm_id: 261127581, osm_type: 'w', building: 'greenhouse' },
  square(-49.2392, -25.4428, 0.0002),
);
export const DETAILS_BAKERY = details(
  'pid-padaria',
  'Padaria da esquina',
  -25.4435,
  -49.238,
  ['commercial', 'commercial.food_and_drink', 'commercial.food_and_drink.bakery'],
  { osm_id: 999, osm_type: 'n', shop: 'bakery' },
  { type: 'Point', coordinates: [-49.238, -25.4435] },
);

/** Os POIs ao redor (a Places): o museu e uma escultura; a estufa não é POI (vem pela geocodificação). */
export const PLACES_AROUND = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-49.238, -25.4435] },
      properties: {
        place_id: 'pid-museu',
        name: 'Museu Botânico',
        lat: -25.4435,
        lon: -49.238,
        categories: ['tourism', 'tourism.attraction', 'tourism.museum'],
        datasource: { raw: { osm_id: 111, osm_type: 'w', tourism: 'museum' } },
      },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-49.2385, -25.443] },
      properties: {
        place_id: 'pid-escultura',
        name: 'Amor Materno',
        lat: -25.443,
        lon: -49.2385,
        categories: ['tourism', 'tourism.attraction', 'tourism.attraction.artwork'],
        datasource: { raw: { osm_id: 3348633537, osm_type: 'n' } },
      },
    },
  ],
};

export const Q94923 = {
  entities: {
    Q94923: {
      labels: {
        pt: { value: 'Jardim Botânico de Curitiba' },
        en: { value: 'Botanical Garden of Curitiba' },
      },
      descriptions: { pt: { value: 'jardim botânico em Curitiba, Brasil' } },
      claims: {
        P18: [{ mainsnak: { datavalue: { value: 'Jardim Botanico Centro Curitiba.jpg' } } }],
        P373: [{ mainsnak: { datavalue: { value: 'Jardim Botânico de Curitiba' } } }],
        P625: [{ mainsnak: { datavalue: { value: { latitude: -25.4425, longitude: -49.2388 } } } }],
        P131: [{ mainsnak: { datavalue: { value: { id: 'Q4361' } } } }],
      },
    },
  },
};

export const CATEGORY_FILES = {
  query: {
    categorymembers: [
      { title: 'File:Jardim Botanico Centro Curitiba.jpg' },
      { title: 'File:Estufa lateral.jpg' },
      { title: 'File:Estufa noite.jpg' },
      { title: 'File:Placa.png' },
      { title: 'File:Planta.svg' },
    ],
  },
};

const info = (
  title: string,
  license: string,
  width: number,
  height: number,
  mime = 'image/jpeg',
  artist = 'Fotógrafa Inventada',
) => ({
  title,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/x/${encodeURIComponent(title.slice(5))}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/x/${encodeURIComponent(title.slice(5))}/1568px-x`,
      thumbwidth: 1568,
      thumbheight: Math.round((1568 * height) / width),
      width,
      height,
      mime,
      extmetadata: {
        LicenseShortName: { value: license },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        Artist: { value: `<a href="x">${artist}</a>` },
        Credit: { value: 'Obra do próprio' },
      },
    },
  ],
});
export const IMAGE_INFO = {
  query: {
    pages: {
      '1': info('File:Jardim Botanico Centro Curitiba.jpg', 'CC BY-SA 2.0', 4000, 3000),
      '2': info('File:Estufa lateral.jpg', 'CC BY 4.0', 3000, 2000),
      '3': info('File:Estufa noite.jpg', 'All Rights Reserved', 3000, 2000),
      '4': info('File:Placa.png', 'CC0', 800, 1200, 'image/png'),
      '5': info('File:Planta.svg', 'Public domain', 1000, 1000, 'image/svg+xml'),
    },
  },
};

export const SHAPE = {
  k: 'box',
  m: 'wall',
  m2: 'none',
  x: 0,
  y: 0,
  z: 0,
  w: 4,
  h: 3,
  d: 3,
  ry: 0,
  p: 0,
  q: 0,
  rep: 'one',
  n: 1,
  sx: 0,
  sz: 0,
  mir: 'none',
  pts: [],
} as const;
export const RECIPE = {
  v: 1,
  shapes: [SHAPE, { ...SHAPE, k: 'dome', m: 'glass', m2: 'white', y: 3, p: 16, q: 3 }],
};

/** Uma resposta da IA com o JSON pedido. */
export function aiMessage(json: unknown, over: Partial<BetaMessage> = {}): BetaMessage {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text: JSON.stringify(json), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 5_000,
      output_tokens: 900,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as BetaMessage['usage'],
    ...over,
  } as BetaMessage;
}

/** Um `fetch` de mentira que responde pela URL; grava as chamadas (a URL e os cabeçalhos que importam). */
export function fakeFetch(routes: [RegExp, () => Response | Promise<Response>][]) {
  const calls: { url: string; ua: string | null; key: string | null }[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    calls.push({ url, ua: headers.get('user-agent'), key: headers.get('x-api-key') });
    for (const [re, respond] of routes) if (re.test(url)) return respond();
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

export const json = (body: unknown) => () => Response.json(body);
export const png = () => () =>
  new Response(PNG_1x1, { status: 200, headers: { 'content-type': 'image/png' } });
