import { describe, expect, it } from 'vitest';
import { APP_USER_AGENT } from './constants.ts';
import {
  CATEGORY_FILES,
  DETAILS_PARK,
  fakeFetch,
  GEOCODE_PARK,
  IMAGE_INFO,
  json,
  PLACES_AROUND,
  png,
  Q94923,
} from './landmark-fixtures.ts';
import {
  categoryOf,
  commonsCategoryFiles,
  commonsImageInfo,
  downloadPhoto,
  geocodeSearch,
  isFreeLicense,
  outlineToMeters,
  pacer,
  pickPhotos,
  placeDetails,
  placesAround,
  sourcesRecord,
  wikidataItem,
} from './landmark-sources.ts';

const KEY = 'chave-de-teste';

describe('as fontes públicas de um cartão-postal', () => {
  it('a geocodificação pelo nome perto da coordenada: a chave no cabeçalho, nunca na URL', async () => {
    const { fetch, calls } = fakeFetch([[/geocode\/search/, json(GEOCODE_PARK)]]);
    const hits = await geocodeSearch(fetch, KEY, 'Jardim Botânico', {
      lat: -25.4428,
      lng: -49.2392,
      km: 3,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      place_id: 'pid-park',
      name: 'Jardim Botânico de Curitiba',
      category: 'leisure',
      type: 'park',
      bbox: [-25.444, -25.4395, -49.2426, -49.2349],
    });
    expect(calls[0]?.url).toContain('bias=proximity%3A-49.2392%2C-25.4428');
    expect(calls[0]?.url).toContain('filter=circle%3A-49.2392%2C-25.4428%2C3000');
    expect(calls[0]?.url).not.toContain(KEY);
    expect(calls[0]?.key).toBe(KEY);
    expect(calls[0]?.ua).toBe(APP_USER_AGENT);
  });

  it('o detalhe do lugar: o objeto do OSM, o item do Wikidata (pelo wiki_and_media) e a planta', async () => {
    const { fetch, calls } = fakeFetch([[/place-details\?id=pid-park/, json(DETAILS_PARK)]]);
    const place = await placeDetails(fetch, KEY, 'pid-park');
    expect(place).toMatchObject({
      place_id: 'pid-park',
      osm_type: 'way',
      osm_id: 607776738,
      name: 'Jardim Botânico de Curitiba',
      category: 'leisure',
      type: 'park',
      wikidata: 'Q94923',
      height_m: null,
    });
    expect(place?.outline?.length).toBe(5);
    expect(calls[0]?.url).toContain('features=details');
    expect(calls[0]?.key).toBe(KEY);
  });

  it('os lugares ao redor (a Places): os POIs com as tags do OSM, sem os sem nome', async () => {
    const { fetch, calls } = fakeFetch([[/v2\/places\?/, json(PLACES_AROUND)]]);
    const around = await placesAround(fetch, KEY, { lat: -25.4428, lng: -49.2392 }, 500);
    expect(around.map((p) => [p.name, p.osm_type, p.osm_id, p.type])).toEqual([
      ['Museu Botânico', 'way', 111, 'museum'],
      ['Amor Materno', 'node', 3348633537, 'artwork'],
    ]);
    expect(calls[0]?.url).toContain('categories=tourism');
    expect(calls[0]?.url).toContain('filter=circle%3A-49.2392%2C-25.4428%2C500');
  });

  it('a classe e o tipo pelas categorias da Geoapify', () => {
    expect(categoryOf(['leisure', 'leisure.park'])).toEqual({ category: 'leisure', type: 'park' });
    expect(categoryOf(undefined, 'tourism.attraction.artwork')).toEqual({
      category: 'tourism',
      type: 'artwork',
    });
    expect(categoryOf([])).toEqual({ category: '', type: '' });
  });

  it('o Wikidata: a imagem, a categoria, a coordenada; as medidas faltam (como no Q94923 real); o User-Agent do app', async () => {
    const { fetch, calls } = fakeFetch([[/Special:EntityData\/Q94923\.json/, json(Q94923)]]);
    const item = await wikidataItem(fetch, 'Q94923');
    expect(item).toMatchObject({
      id: 'Q94923',
      label: 'Jardim Botânico de Curitiba',
      image: 'Jardim Botanico Centro Curitiba.jpg',
      category: 'Jardim Botânico de Curitiba',
      coord: { lat: -25.4425, lng: -49.2388 },
      height_m: null,
      width_m: null,
      length_m: null,
    });
    expect(calls[0]?.ua).toBe(APP_USER_AGENT);
    expect(APP_USER_AGENT).toMatch(
      /^Viajei\/\d+\.\d+ \(https:\/\/github\.com\/dougedss\/viajei\)$/,
    );
  });

  it('o Commons: os arquivos da categoria em lote e o imageinfo com a licença e o autor, com maxlag', async () => {
    const { fetch, calls } = fakeFetch([
      [/list=categorymembers/, json(CATEGORY_FILES)],
      [/prop=imageinfo/, json(IMAGE_INFO)],
    ]);
    const files = await commonsCategoryFiles(fetch, 'Jardim Botânico de Curitiba');
    expect(files).toHaveLength(5);
    const info = await commonsImageInfo(fetch, files);
    expect(info.find((p) => p.title === 'File:Estufa lateral.jpg')).toMatchObject({
      license: 'CC BY 4.0',
      artist: 'Fotógrafa Inventada',
      mime: 'image/jpeg',
    });
    expect(calls[1]?.url).toContain('titles=File%3AJardim');
    expect(calls[1]?.url).toContain('iiurlwidth=1568');
    for (const c of calls) {
      expect(c.url).toContain('maxlag=5');
      expect(c.ua).toBe(APP_USER_AGENT);
    }
  });

  it('o filtro de licença: só as livres, pelas grafias que a API devolve', () => {
    for (const ok of [
      'CC BY-SA 2.0',
      'CC BY 4.0',
      'CC BY-SA 4.0',
      'CC0',
      'Public domain',
      'PD-self',
      'CC BY-SA 3.0 BR',
      'cc-by-sa-2.5',
    ])
      expect(isFreeLicense(ok), ok).toBe(true);
    for (const no of [
      'All Rights Reserved',
      'CC BY-NC 4.0',
      'CC BY-NC-SA 2.0',
      'CC BY-ND 4.0',
      'Fair use',
      '',
      null,
      undefined,
    ])
      expect(isFreeLicense(no), String(no)).toBe(false);
  });

  it('a escolha das fotos: a P18 primeiro, só livres e legíveis, até três, as maiores', async () => {
    const { fetch } = fakeFetch([[/prop=imageinfo/, json(IMAGE_INFO)]]);
    const info = await commonsImageInfo(
      fetch,
      CATEGORY_FILES.query.categorymembers.map((m) => m.title),
    );
    const picked = pickPhotos('Jardim Botanico Centro Curitiba.jpg', info);
    expect(picked.map((p) => p.title)).toEqual([
      'File:Jardim Botanico Centro Curitiba.jpg',
      'File:Estufa lateral.jpg',
      'File:Placa.png',
    ]);
    expect(picked.some((p) => p.title.includes('noite') || p.title.endsWith('.svg'))).toBe(false);
  });

  it('a foto baixada vai em base64 para a IA, e o registro guarda só título, autor, licença e URL', async () => {
    const { fetch } = fakeFetch([
      [/prop=imageinfo/, json(IMAGE_INFO)],
      [/upload\.wikimedia/, png()],
    ]);
    const info = await commonsImageInfo(fetch, ['Placa.png', 'Estufa_lateral.jpg']);
    expect(info.map((p) => p.title).sort()).toEqual(['File:Estufa lateral.jpg', 'File:Placa.png']);
    const photo = info.find((p) => p.title === 'File:Placa.png');
    const bytes = await downloadPhoto(fetch, photo!);
    expect(bytes?.media_type).toBe('image/png');
    expect(bytes?.data.startsWith('iVBORw0KGgo')).toBe(true);
    const record = sourcesRecord({
      wikidata: 'Q94923',
      photos: [photo!],
      outline: 'osm',
      modeled: null,
    });
    expect(record.photos[0]?.url).toContain('upload.wikimedia.org');
    expect({ ...record.photos[0], url: '' }).toEqual({
      title: 'File:Placa.png',
      url: '',
      license: 'CC0',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
      artist: 'Fotógrafa Inventada',
      credit: 'Obra do próprio',
    });
    expect(JSON.stringify(record)).not.toContain('iVBOR');
  });

  it('a planta vira metros locais (x leste, z sul) e se simplifica', () => {
    const pts = outlineToMeters(
      [
        [-49.2392, -25.4428],
        [-49.2382, -25.4428],
        [-49.2382, -25.4418],
        [-49.2392, -25.4418],
        [-49.2392, -25.4428],
      ],
      { lat: -25.4423, lng: -49.2387 },
    );
    expect(pts).toHaveLength(4);
    expect(pts[0]?.[0]).toBeLessThan(0);
    expect(pts[0]?.[1]).toBeGreaterThan(0);
    expect(
      outlineToMeters(
        Array.from({ length: 200 }, (_, i) => [-49.2 + i * 1e-5, -25.4] as [number, number]),
        { lat: -25.4, lng: -49.2 },
      ),
    ).toHaveLength(40);
  });

  it('o passo: uma chamada por vez, com o intervalo mínimo por serviço', async () => {
    let t = 0;
    const slept: number[] = [];
    const pace = pacer(
      () => t,
      (ms) => {
        slept.push(ms);
        t += ms;
        return Promise.resolve();
      },
    );
    const order: string[] = [];
    await Promise.all([
      pace('geoapify', 250, () => Promise.resolve(order.push('a'))),
      pace('geoapify', 250, () => Promise.resolve(order.push('b'))),
      pace('wikimedia', 250, () => Promise.resolve(order.push('c'))),
    ]);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(slept).toEqual([250]);
  });
});
