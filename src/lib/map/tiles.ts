/**
 * Os tiles do OpenStreetMap num lugar só, como a política de uso pede (operations.osmfoundation.org/
 * policies/tiles): o mapa e o service worker leem daqui. Só o servidor `tile.openstreetmap.org`, que vai
 * até o zoom 19 (o 20 responde 400). O navegador manda o `Referer` do app, que a política exige: o app
 * não define `Referrer-Policy`, e assim tem de continuar.
 *
 * "Offline use is not permitted" nesse servidor: nada de baixar antes os tiles da rota nem de "salvar
 * uma área". O que o aparelho guarda é só o que a pessoa já viu, pelo `CacheFirst` do service worker.
 */
export const OSM_TILE_ORIGIN = 'https://tile.openstreetmap.org';
export const OSM_TILE_URL = `${OSM_TILE_ORIGIN}/{z}/{x}/{y}.png`;
export const OSM_MAX_ZOOM = 19;
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';

/** A atribuição, sempre visível num canto do mapa. */
export const OSM_ATTRIBUTION_HTML = `© <a href="${OSM_COPYRIGHT_URL}" target="_blank" rel="noreferrer">OpenStreetMap</a>`;
/** O prefixo do Leaflet fica só com o nome, sem a bandeira do padrão. */
export const LEAFLET_PREFIX_HTML =
  '<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>';

/**
 * O cache de tiles do service worker. 30 dias vão além do `max-age` do servidor (umas 25 h, com
 * `stale-while-revalidate` de 7 dias): é de propósito, o aparelho pede menos ao OSM e o mapa da viagem
 * continua lá na estrada sem sinal. O limite de entradas cabe umas quatro viagens como a do seed
 * (cada dia aberto e aproximado duas vezes, com os níveis do voo entre os dias), uns 25 MB.
 */
export const TILE_CACHE = {
  name: 'osm-tiles',
  maxEntries: 1_500,
  maxAgeSeconds: 30 * 24 * 60 * 60,
} as const;
