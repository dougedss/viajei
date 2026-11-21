import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/schema.ts';
import { viewboxAround } from '@shared/geo.ts';
import { geocode, searchNear } from './nominatim.ts';

const MAJOR_VIEIRA = { lat: -26.3712, lng: -50.3268 };
const row = (name: string, lat: number, lon: number, country: string) => ({
  display_name: `${name}, ${country}`,
  name,
  lat: String(lat),
  lon: String(lon),
  category: 'place',
  type: 'town',
});

function fakeFetch(answer: (url: URL) => unknown[]) {
  const urls: URL[] = [];
  vi.stubGlobal('fetch', (input: URL | string) => {
    const url = new URL(String(input));
    urls.push(url);
    return Promise.resolve(new Response(JSON.stringify(answer(url)), { status: 200 }));
  });
  return urls;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => vi.unstubAllGlobals());

describe('o viés do geocode (fase 25, D276): a área preferida, não um limite', () => {
  it('com o viés, a URL leva o viewbox em volta do ponto e **não** leva bounded', async () => {
    const urls = fakeFetch(() => [row('Mafra', -26.11, -49.8, 'Brasil')]);
    await geocode('Mafra', undefined, { near: MAJOR_VIEIRA, radiusKm: 400 });
    const url = urls[0];
    expect(url?.searchParams.get('q')).toBe('mafra');
    expect(url?.searchParams.get('viewbox')).toBe(viewboxAround(MAJOR_VIEIRA, 400));
    expect(url?.searchParams.has('bounded')).toBe(false);
    expect(url?.searchParams.get('format')).toBe('jsonv2');
  });

  it('sem o viés, a busca é a de antes: sem viewbox, e a chave do cache é a consulta', async () => {
    fakeFetch(() => [row('Mafra', 38.94, -9.33, 'Portugal')]);
    await geocode('Mafra');
    expect((await db.geocode.toArray()).map((e) => e.query)).toEqual(['mafra']);
  });

  it('a chave do cache leva o ponto de referência: a mesma consulta de dois lugares não cai na mesma entrada', async () => {
    const urls = fakeFetch((url) =>
      url.searchParams.get('viewbox')?.startsWith('-5') === true
        ? [row('Mafra', -26.11, -49.8, 'Brasil')]
        : [row('Mafra', 38.94, -9.33, 'Portugal')],
    );
    const fromSc = await geocode('mafra', undefined, { near: MAJOR_VIEIRA, radiusKm: 400 });
    const fromPt = await geocode('mafra', undefined, {
      near: { lat: 38.72, lng: -9.14 },
      radiusKm: 400,
    });
    expect(fromSc[0]?.address).toBe('Mafra, Brasil');
    expect(fromPt[0]?.address).toBe('Mafra, Portugal');
    expect((await db.geocode.toArray()).map((e) => e.query).sort()).toEqual([
      'bias:-26.4,-50.3:mafra',
      'bias:38.7,-9.1:mafra',
    ]);
    // e a segunda vez do mesmo lugar vem do cache
    await geocode('Mafra', undefined, { near: MAJOR_VIEIRA, radiusKm: 400 });
    expect(urls).toHaveLength(2);
  });

  it('o searchNear continua um limite (bounded), como a conferência do nomeado pede', async () => {
    const urls = fakeFetch(() => []);
    await searchNear('zoologico pomerode', { lat: -26.74, lng: -49.18 }, 60);
    expect(urls[0]?.searchParams.get('bounded')).toBe('1');
    expect(urls[0]?.searchParams.get('viewbox')).toBe(
      viewboxAround({ lat: -26.74, lng: -49.18 }, 60),
    );
  });
});
