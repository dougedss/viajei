import { describe, expect, it } from 'vitest';
import { APP_USER_AGENT } from './constants.ts';
import {
  CATEGORY_FILES,
  fakeFetch,
  IMAGE_INFO,
  json,
  PARK,
  png,
  Q94923,
} from './landmark-fixtures.ts';
import {
  commonsCategoryFiles,
  commonsImageInfo,
  downloadPhoto,
  isFreeLicense,
  lookupOsm,
  outlineToMeters,
  pacer,
  pickPhotos,
  sourcesRecord,
  wikidataItem,
} from './landmark-sources.ts';

describe('as fontes públicas de um cartão-postal', () => {
  it('o Nominatim devolve o objeto com o item do Wikidata e a planta; toda chamada leva o User-Agent do app', async () => {
    const { fetch, calls } = fakeFetch([[/nominatim.*lookup/, json([PARK])]]);
    const place = await lookupOsm(fetch, 'way', 607776738);
    expect(place?.wikidata).toBe('Q94923');
    expect(place?.outline?.length).toBe(5);
    expect(place?.name).toBe('Jardim Botânico de Curitiba');
    expect(calls[0]?.url).toContain('osm_ids=W607776738');
    expect(calls[0]?.url).toContain('extratags=1');
    expect(calls[0]?.url).toContain('polygon_geojson=1');
    expect(calls[0]?.ua).toBe(APP_USER_AGENT);
    expect(APP_USER_AGENT).toMatch(
      /^Viajei\/\d+\.\d+ \(https:\/\/github\.com\/dougedss\/viajei\)$/,
    );
  });

  it('o Wikidata: a imagem, a categoria, a coordenada; as medidas faltam (como no Q94923 real)', async () => {
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
    // a com todos os direitos reservados e o SVG ficaram de fora
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
    expect(pts[0]![0]).toBeLessThan(0);
    expect(pts[0]![1]).toBeGreaterThan(0);
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
      pace('nominatim', 1100, () => Promise.resolve(order.push('a'))),
      pace('nominatim', 1100, () => Promise.resolve(order.push('b'))),
      pace('wikimedia', 250, () => Promise.resolve(order.push('c'))),
    ]);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(slept).toEqual([1100]);
  });
});
