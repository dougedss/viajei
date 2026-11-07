import { deflateSync } from 'node:zlib';
import type { BrowserContext, Route } from '@playwright/test';
import { inserir } from './db.ts';
import { dateInSaoPaulo } from './dates.ts';
import { uuidV4, uuidV5 } from './ids.ts';

/**
 * O mundo de fora, de mentira, para o mapa e o clima. No navegador dos testes os servidores de verdade
 * nem resolvem (`--host-resolver-rules` no `playwright.config.ts`): nenhum teste pede tile ao OSM nem
 * previsão ao Open-Meteo. Os testes que precisam deles chamam estas rotas no contexto, que valem
 * também para os pedidos do service worker (projeto `pwa`).
 */

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Um PNG de 256 × 256 de uma cor só: o tile de mentira (pequeno, com cara de papel). */
function tilePng(): Buffer {
  const size = 256;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits
  header[9] = 2; // RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array(size).fill([233, 234, 231]).flat()),
  ]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TILE = tilePng();

/** Os tiles do OSM: um PNG com CORS aberto, como o servidor de verdade responde. Conta os pedidos. */
export async function fakeTiles(context: BrowserContext): Promise<{ count: () => number }> {
  let n = 0;
  await context.route('https://tile.openstreetmap.org/**', async (route: Route) => {
    n++;
    await route.fulfill({
      status: 200,
      body: TILE,
      headers: {
        'content-type': 'image/png',
        'access-control-allow-origin': '*',
        'cache-control': 'max-age=90000',
      },
    });
  });
  return { count: () => n };
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${start}T12:00:00Z`);
    d <= new Date(`${end}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** O que a previsão de mentira diz em todo lugar: o dia "parcialmente nublado, 16° a 28°, chuva 60%". */
export const FAKE_DAY = { max: 28.4, min: 16.2, rain: 60, code: 2 } as const;

/** O Open-Meteo: a mesma previsão para cada lugar pedido, em lista com vários lugares, objeto com um. */
export async function fakeOpenMeteo(context: BrowserContext): Promise<{ count: () => number }> {
  let n = 0;
  await context.route('https://api.open-meteo.com/**', async (route: Route) => {
    n++;
    const url = new URL(route.request().url());
    const lats = (url.searchParams.get('latitude') ?? '').split(',');
    const start = url.searchParams.get('start_date') ?? dateInSaoPaulo(0);
    const end = url.searchParams.get('end_date') ?? start;
    const dates = datesBetween(start, end);
    const hourly = url.searchParams.has('hourly');
    const place = () => ({
      latitude: -29.4,
      longitude: -50.9,
      timezone: 'America/Sao_Paulo',
      daily: {
        time: dates,
        weather_code: dates.map(() => FAKE_DAY.code),
        temperature_2m_max: dates.map(() => FAKE_DAY.max),
        temperature_2m_min: dates.map(() => FAKE_DAY.min),
        precipitation_probability_max: dates.map(() => FAKE_DAY.rain),
      },
      ...(hourly
        ? {
            hourly: {
              time: dates.flatMap((d) =>
                Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`),
              ),
              temperature_2m: dates.flatMap(() => Array.from({ length: 24 }, (_, h) => 16 + h / 2)),
              precipitation_probability: dates.flatMap(() => Array.from({ length: 24 }, () => 70)),
              weather_code: dates.flatMap(() => Array.from({ length: 24 }, () => 61)),
              is_day: dates.flatMap(() =>
                Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 19 ? 1 : 0)),
              ),
            },
          }
        : {}),
    });
    const body = lats.length > 1 ? lats.map(place) : place();
    await route.fulfill({ json: body, headers: { 'access-control-allow-origin': '*' } });
  });
  return { count: () => n };
}

/** A rota do dia: a `route-day` respondendo com uma estrada que passa por um ponto entre cada par. */
export async function fakeRouteDay(context: BrowserContext): Promise<void> {
  await context.route('**/functions/v1/route-day', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          // o curinga não cobre o Authorization: os cabeçalhos do supabase-js, um por um
          'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
        },
      });
      return;
    }
    const body = route.request().postDataJSON() as { waypoints: [number, number][] };
    const geometry: [number, number][] = [];
    body.waypoints.forEach((p, i) => {
      const next = body.waypoints[i + 1];
      geometry.push(p);
      if (next) geometry.push([(p[0] + next[0]) / 2 + 0.01, (p[1] + next[1]) / 2 + 0.01]);
    });
    await route.fulfill({
      json: {
        provider: 'ors',
        fetched_at: new Date().toISOString(),
        geometry,
        legs: body.waypoints.slice(1).map(() => ({ distance_m: 12_000, duration_s: 900 })),
        elevation: [
          [0, 700],
          [12_000, 820],
        ],
      },
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

/**
 * Uma viagem montada direto no banco local, com dias dentro do horizonte da previsão: o Dia 1 em
 * Gramado e Canela (três paradas com lugar e horário e uma sem lugar), o Dia 2 com uma parada só.
 */
export async function viagemNaSerra(
  ownerId: string,
  daysAhead: number,
): Promise<{ tripId: string; days: [string, string]; dates: [string, string] }> {
  const tripId = uuidV4();
  const dates: [string, string] = [dateInSaoPaulo(daysAhead), dateInSaoPaulo(daysAhead + 1)];
  const now = new Date().toISOString();
  await inserir('trips', [
    {
      id: tripId,
      owner_id: ownerId,
      name: 'Serra do teste',
      start_date: dates[0],
      end_date: dates[1],
      updated_at: now,
    },
  ]);
  const days: [string, string] = [uuidV5(tripId, dates[0]), uuidV5(tripId, dates[1])];
  await inserir(
    'trip_days',
    days.map((id, i) => ({ id, trip_id: tripId, date: dates[i], updated_at: now })),
  );
  const stop = (
    day: string,
    position: string,
    kind: string,
    name: string,
    time: string | null,
    lat: number | null,
    lng: number | null,
  ) => ({
    id: uuidV4(),
    trip_id: tripId,
    trip_day_id: day,
    position,
    kind,
    name,
    time,
    lat,
    lng,
    address: lat === null ? null : `${name}, RS`,
    updated_at: now,
  });
  await inserir('stops', [
    stop(days[0], 'a0', 'origin', 'Saída do hotel', '08:00', -29.37929, -50.8737),
    stop(days[0], 'a1', 'nature', 'Cascata do Caracol', '09:30', -29.31295, -50.85197),
    stop(days[0], 'a2', 'food', 'Almoço sem lugar', '12:00', null, null),
    stop(days[0], 'a3', 'city', 'Lago Negro', '15:00', -29.39206, -50.88049),
    stop(days[1], 'a0', 'winery', 'Casa Valduga', '13:30', -29.17924, -51.55581),
  ]);
  return { tripId, days, dates };
}
