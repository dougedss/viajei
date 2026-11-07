import { describe, expect, it, vi } from 'vitest';
import {
  OPEN_METEO_ONE_PLACE,
  OPEN_METEO_TWO_PLACES,
  RECORDED_DATE,
} from '../../../src/test/fixtures/open-meteo.ts';
import { briefingDay, briefingWeather, type BriefingRow } from './briefing-weather.ts';
import { notificationDataSchema, notificationText } from './notifications.ts';

const papanduva = { lat: -26.40854, lng: -50.14241 };
const novaPetropolis = { lat: -29.48979, lng: -51.35668 };
const hotel = { lat: -29.49224, lng: -51.35916 };

const row = (id: string, over: Partial<BriefingRow> = {}): BriefingRow => ({
  id,
  date: RECORDED_DATE,
  first_point: papanduva,
  last_point: novaPetropolis,
  ...over,
});

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

describe('o clima do briefing no servidor', () => {
  it('uma chamada só, com os lugares distintos do lote, e os fatos de cada aviso', async () => {
    const fetchFn = respond(OPEN_METEO_TWO_PLACES);
    const out = await briefingWeather(
      [
        row('dia-1'),
        // o dia de outra pessoa da mesma viagem: os mesmos lugares, nenhum lugar a mais
        row('dia-1-b'),
        // começa e termina perto (300 m): só onde começa
        row('hotel', { first_point: hotel, last_point: novaPetropolis }),
        row('sem-lugar', { first_point: null, last_point: null }),
      ],
      { fetch: fetchFn },
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchFn.mock.calls[0]?.[0]));
    expect(url.searchParams.get('latitude')).toBe('-26.41,-29.49');
    expect(url.searchParams.get('start_date')).toBe(RECORDED_DATE);
    expect(url.searchParams.has('hourly')).toBe(false);

    expect(out.get('dia-1')).toEqual({
      status: 'ok',
      places: [
        { role: 'start', lat: -26.41, lng: -50.14, max: 20.6, min: 11, rain: 43, code: 53 },
        { role: 'end', lat: -29.49, lng: -51.36, max: 20.9, min: 11, rain: 98, code: 81 },
      ],
    });
    expect(out.get('hotel')).toEqual({
      status: 'ok',
      places: [{ role: 'start', lat: -29.49, lng: -51.36, max: 20.9, min: 11, rain: 98, code: 81 }],
    });
    expect(out.get('sem-lugar')).toEqual({ status: 'none', reason: 'no_point' });
  });

  it('um lugar só: a resposta vem como objeto', async () => {
    const canela = { lat: -29.31295, lng: -50.85197 };
    const out = await briefingWeather(
      [row('canela', { first_point: canela, last_point: canela })],
      {
        fetch: respond(OPEN_METEO_ONE_PLACE),
      },
    );
    expect(out.get('canela')).toMatchObject({
      status: 'ok',
      places: [{ role: 'start', max: 16.9 }],
    });
  });

  it('sem nenhum lugar no lote, nenhuma chamada', async () => {
    const fetchFn = respond(OPEN_METEO_ONE_PLACE);
    const out = await briefingWeather([row('x', { first_point: { lat: 'a' } })], {
      fetch: fetchFn,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(out.get('x')).toEqual({ status: 'none', reason: 'no_point' });
  });

  it('o Open-Meteo fora do ar: o aviso sai sem clima, dentro do prazo', async () => {
    // um fetch que nunca responde e ignora o sinal: o prazo vale mesmo assim
    const hang = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    const started = Date.now();
    const out = await briefingWeather([row('dia-1')], { fetch: hang, timeoutMs: 40 });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(out.get('dia-1')).toEqual({ status: 'none', reason: 'timeout' });

    const down = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed')));
    expect((await briefingWeather([row('a')], { fetch: down })).get('a')).toEqual({
      status: 'none',
      reason: 'network',
    });
    expect(
      (await briefingWeather([row('a')], { fetch: respond({ error: true }, 429) })).get('a'),
    ).toEqual({ status: 'none', reason: 'http_429' });
    expect((await briefingWeather([row('a')], { fetch: respond([{ x: 1 }]) })).get('a')).toEqual({
      status: 'none',
      reason: 'invalid',
    });
  });

  it('a previsão sem os números do dia: sem clima, com o motivo', async () => {
    const out = await briefingWeather([row('outro-dia', { date: '2026-11-09' })], {
      fetch: respond(OPEN_METEO_TWO_PLACES),
    });
    expect(out.get('outro-dia')).toEqual({ status: 'none', reason: 'no_data' });
  });
});

describe('o texto do briefing com o clima', () => {
  const base = {
    date: '2026-12-11',
    day_index: 1,
    day_count: 4,
    stops_count: 4,
    first_time: '07:00',
    first_kind: 'origin',
  };
  const ok = {
    status: 'ok' as const,
    places: [
      { role: 'start' as const, lat: -26.41, lng: -50.14, max: 26, min: 15, rain: 20, code: 1 },
      { role: 'end' as const, lat: -29.49, lng: -51.36, max: 31, min: 19, rain: 60, code: 2 },
    ],
  };

  it('com clima, no plural: os dois lugares juntos numa segunda linha', () => {
    const t = notificationText('morning_briefing', { ...base, weather: ok }, 'day');
    expect(t.title).toBe('Dia 1 de 4 · sexta');
    expect(t.body).toBe(
      '4 paradas · primeira saída às 07:00\nParcialmente nublado, 15° a 31°, chuva 60%',
    );
  });

  it('com clima, no singular e com pouca chuva', () => {
    const t = notificationText(
      'morning_briefing',
      {
        ...base,
        date: '2026-12-12',
        day_index: 2,
        stops_count: 1,
        first_time: '09:30',
        first_kind: 'nature',
        weather: {
          status: 'ok',
          places: [
            { role: 'start', lat: -29.36, lng: -51.31, max: 27, min: 14, rain: 10, code: 0 },
          ],
        },
      },
      'day',
    );
    expect(t.title).toBe('Dia 2 de 4 · sábado');
    expect(t.body).toBe('1 parada · primeira parada às 09:30\nCéu limpo, 14° a 27°');
  });

  it('sem clima (motivo gravado, nada gravado ou fora do formato), o texto de antes', () => {
    const plain = '4 paradas · primeira saída às 07:00';
    expect(
      notificationText(
        'morning_briefing',
        { ...base, weather: { status: 'none', reason: 'timeout' } },
        'day',
      ).body,
    ).toBe(plain);
    expect(notificationText('morning_briefing', base, 'day').body).toBe(plain);
    const parsed = notificationDataSchema.parse({ ...base, weather: { status: 'talvez' } });
    expect(parsed.weather).toBeNull();
    expect(notificationText('morning_briefing', parsed, 'day').body).toBe(plain);
  });

  it('o resumo dos fatos é o mesmo que a tela calcula', () => {
    expect(briefingDay(ok)).toEqual({ max: 31, min: 15, rain: 60, code: 2 });
    expect(briefingDay({ status: 'none', reason: 'timeout' })).toBeNull();
    expect(briefingDay(null)).toBeNull();
  });
});
