import { describe, expect, it } from 'vitest';
import {
  OPEN_METEO_ONE_PLACE,
  OPEN_METEO_TWO_PLACES,
  RECORDED_DATE,
} from '../../../src/test/fixtures/open-meteo.ts';
import { haversineM } from './geo.ts';
import {
  addDaysISO,
  briefingWeatherText,
  combineDays,
  dailyOn,
  dayEnds,
  dayPoints,
  degrees,
  forecastUrl,
  horizonOf,
  hourlyAt,
  hourText,
  parseForecast,
  placeOf,
  rangeText,
  roundToHour,
  severest,
  todayIn,
  WEATHER_CODES,
  weatherCode,
  type PointStop,
} from './weather.ts';

describe('códigos do tempo', () => {
  it('a tabela inteira do Open-Meteo, com rótulo em pt-BR e ícone', () => {
    const labels = Object.fromEntries(
      Object.keys(WEATHER_CODES).map((k) => {
        const info = weatherCode(Number(k));
        return [k, `${info.label} · ${info.icon}`];
      }),
    );
    expect(labels).toEqual({
      0: 'Céu limpo · sun',
      1: 'Predomínio de sol · sun',
      2: 'Parcialmente nublado · cloud-sun',
      3: 'Nublado · cloud',
      45: 'Neblina · fog',
      48: 'Neblina com geada · fog',
      51: 'Garoa fraca · drizzle',
      53: 'Garoa moderada · drizzle',
      55: 'Garoa forte · drizzle',
      56: 'Garoa congelante fraca · drizzle',
      57: 'Garoa congelante forte · drizzle',
      61: 'Chuva fraca · rain',
      63: 'Chuva moderada · rain',
      65: 'Chuva forte · rain',
      66: 'Chuva congelante fraca · rain',
      67: 'Chuva congelante forte · rain',
      71: 'Neve fraca · snow',
      73: 'Neve moderada · snow',
      75: 'Neve forte · snow',
      77: 'Grãos de neve · snow',
      80: 'Pancadas de chuva fracas · rain',
      81: 'Pancadas de chuva moderadas · rain',
      82: 'Pancadas de chuva muito fortes · rain',
      85: 'Pancadas de neve fracas · snow',
      86: 'Pancadas de neve fortes · snow',
      95: 'Trovoada · storm',
      96: 'Trovoada com granizo fraco · hail',
      97: 'Trovoada forte · storm',
      99: 'Trovoada com granizo forte · hail',
    });
  });

  it('código desconhecido tem rótulo de reserva e nunca vence um conhecido', () => {
    expect(weatherCode(42)).toEqual({
      label: 'Previsão do tempo',
      icon: 'cloud',
      severity: -1,
      known: false,
    });
    expect(weatherCode(null).known).toBe(false);
    expect(severest(42, 3)).toBe(3);
    expect(severest(null, 2)).toBe(2);
    expect(severest(2, null)).toBe(2);
  });

  it('de noite, o sol vira lua', () => {
    expect(weatherCode(0, false)).toMatchObject({ label: 'Céu limpo', icon: 'moon' });
    expect(weatherCode(1, false)).toMatchObject({ label: 'Poucas nuvens', icon: 'moon' });
    expect(weatherCode(2, false)).toMatchObject({ icon: 'cloud-moon' });
    expect(weatherCode(61, false)).toMatchObject({ label: 'Chuva fraca', icon: 'rain' });
  });

  it('a gravidade pesa para quem viaja: neblina sobre nuvem, chuva sobre garoa, trovoada sobre tudo', () => {
    expect(severest(3, 45)).toBe(45);
    expect(severest(53, 61)).toBe(61);
    expect(severest(81, 53)).toBe(81);
    expect(severest(82, 95)).toBe(95);
    expect(severest(97, 96)).toBe(97);
  });
});

describe('os lugares do dia', () => {
  const papanduva = { lat: -26.40854, lng: -50.14241 };
  const novaPetropolis = { lat: -29.48979, lng: -51.35668 };

  it('arredonda a 2 casas: o mesmo lugar sai uma vez só', () => {
    expect(placeOf({ lat: -29.49224, lng: -51.35916 })).toEqual({
      key: '-29.49,-51.36',
      lat: -29.49,
      lng: -51.36,
    });
    expect(placeOf({ lat: -29.48979, lng: -51.35668 }).key).toBe('-29.49,-51.36');
  });

  it('onde o dia termina só conta a 50 km ou mais de onde começa', () => {
    expect(dayEnds(papanduva, novaPetropolis)).toEqual({
      start: placeOf(papanduva),
      end: placeOf(novaPetropolis),
    });
    const base = { lat: -29, lng: -51 };
    const near = { lat: -29.44, lng: -51 };
    const far = { lat: -29.46, lng: -51 };
    expect(haversineM([base.lng, base.lat], [near.lng, near.lat])).toBeLessThan(50_000);
    expect(haversineM([base.lng, base.lat], [far.lng, far.lat])).toBeGreaterThan(50_000);
    expect(dayEnds(base, near)?.end).toBeNull();
    expect(dayEnds(base, far)?.end).toEqual(placeOf(far));
    expect(dayEnds(base, base)?.end).toBeNull();
    expect(dayEnds(base, null)).toEqual({ start: placeOf(base), end: null });
    expect(dayEnds(null, far)).toBeNull();
  });

  const stop = (id: string, over: Partial<PointStop>): PointStop => ({
    id,
    lat: null,
    lng: null,
    time: null,
    skipped: false,
    ...over,
  });

  it('as paradas com horário escrito ganham a hora cheia; sem horário, nada', () => {
    const points = dayPoints([
      stop('saida', { ...papanduva, time: '07:00' }),
      stop('almoco', { lat: -27.5, lng: -50.5 }),
      stop('parque', { lat: -29.28522, lng: -51.41185, time: '13:30' }),
      stop('pulada', { lat: -28, lng: -51, time: '15:00', skipped: true }),
      stop('mirante', { time: '16:00' }),
      stop('jantar', { ...novaPetropolis, time: '19:00' }),
    ]);
    expect(points.ends).toEqual({ start: placeOf(papanduva), end: placeOf(novaPetropolis) });
    expect(points.stops.map((s) => `${s.stop_id} ${s.hour} ${s.place.key}`)).toEqual([
      'saida 07:00 -26.41,-50.14',
      'parque 14:00 -29.29,-51.41',
      'jantar 19:00 -29.49,-51.36',
    ]);
  });

  it('parada pulada não conta como começo nem fim, e o dia sem coordenada não tem lugar', () => {
    const points = dayPoints([
      stop('pulada', { ...papanduva, time: '07:00', skipped: true }),
      stop('so', { ...novaPetropolis }),
    ]);
    expect(points.ends).toEqual({ start: placeOf(novaPetropolis), end: null });
    expect(points.stops).toEqual([]);
    expect(dayPoints([stop('a', { time: '09:00' })])).toEqual({ ends: null, stops: [] });
  });

  it('a hora cheia mais perto', () => {
    expect(roundToHour('13:30')).toBe('14:00');
    expect(roundToHour('13:29')).toBe('13:00');
    expect(roundToHour('07:00:00')).toBe('07:00');
    expect(roundToHour('23:40')).toBe('23:00');
    expect(roundToHour('00:10')).toBe('00:00');
    expect(roundToHour('sete')).toBeNull();
    expect(roundToHour('25:00')).toBeNull();
  });
});

describe('o horizonte', () => {
  it('hoje até hoje + 15; além disso, "a partir de" a data menos 15; o que passou some', () => {
    const today = '2026-11-07';
    expect(horizonOf('2026-11-07', today)).toEqual({ status: 'forecast' });
    expect(horizonOf('2026-11-22', today)).toEqual({ status: 'forecast' });
    expect(horizonOf('2026-11-23', today)).toEqual({ status: 'later', from: '2026-11-08' });
    expect(horizonOf('2026-12-11', today)).toEqual({ status: 'later', from: '2026-11-26' });
    expect(horizonOf('2026-11-06', today)).toEqual({ status: 'past' });
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('o dia de hoje é o de São Paulo, também depois das 21h', () => {
    expect(todayIn(new Date('2026-11-08T01:30:00Z'))).toBe('2026-11-07');
    expect(todayIn(new Date('2026-11-08T03:30:00Z'))).toBe('2026-11-08');
  });
});

describe('o pedido e a resposta', () => {
  it('uma chamada com todos os lugares, o dia, as horas e o fuso', () => {
    const url = new URL(
      forecastUrl({
        places: [
          placeOf({ lat: -26.40854, lng: -50.14241 }),
          placeOf({ lat: -29.49, lng: -51.36 }),
        ],
        start: '2026-12-11',
        end: '2026-12-14',
        hourly: true,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '-26.41,-29.49',
      longitude: '-50.14,-51.36',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
      timezone: 'America/Sao_Paulo',
      start_date: '2026-12-11',
      end_date: '2026-12-14',
    });
    const daily = new URL(
      forecastUrl({
        places: [placeOf({ lat: -29.3, lng: -50.8 })],
        start: 'a',
        end: 'a',
        hourly: false,
      }),
    );
    expect(daily.searchParams.has('hourly')).toBe(false);
  });

  it('vários lugares voltam em lista; um lugar, como objeto', () => {
    const two = parseForecast(OPEN_METEO_TWO_PLACES, 2);
    expect(two.ok).toBe(true);
    const one = parseForecast(OPEN_METEO_ONE_PLACE, 1);
    expect(one.ok && one.forecasts.length).toBe(1);
  });

  it('fora do formato, ou com outra quantidade de lugares, nada vale', () => {
    expect(parseForecast(OPEN_METEO_TWO_PLACES, 3).ok).toBe(false);
    expect(parseForecast({ error: true, reason: 'Parameter end_date is out of range' }, 1).ok).toBe(
      false,
    );
    expect(parseForecast({ latitude: -29.3, longitude: -50.8 }, 1).ok).toBe(false);
    expect(parseForecast({ daily: { time: ['2026-11-08'], weather_code: [1] } }, 1).ok).toBe(false);
    expect(
      parseForecast(
        {
          daily: {
            time: ['2026-11-08', '2026-11-09'],
            weather_code: [1],
            temperature_2m_max: [1],
            temperature_2m_min: [1],
            precipitation_probability_max: [1],
          },
        },
        1,
      ).ok,
    ).toBe(false);
    expect(parseForecast('nada', 1).ok).toBe(false);
  });
});

describe('os resumos e os textos', () => {
  const parsed = parseForecast(OPEN_METEO_TWO_PLACES, 2);
  const [papanduva, novaPetropolis] = parsed.ok ? parsed.forecasts : [];

  it('o dia de cada lugar e a hora de uma parada, da resposta gravada', () => {
    expect(papanduva && dailyOn(papanduva, RECORDED_DATE)).toEqual({
      max: 20.6,
      min: 11,
      rain: 43,
      code: 53,
    });
    expect(novaPetropolis && hourlyAt(novaPetropolis, RECORDED_DATE, '13:00')).toEqual({
      temp: 20.2,
      rain: 41,
      code: 3,
      is_day: true,
    });
    expect(novaPetropolis && hourlyAt(novaPetropolis, RECORDED_DATE, '21:00')?.is_day).toBe(false);
    expect(papanduva && dailyOn(papanduva, '2026-11-09')).toBeNull();
    expect(papanduva && hourlyAt(papanduva, '2026-11-09', '13:00')).toBeNull();
  });

  it('juntar os dois lugares: a menor mínima, a maior máxima, a maior chuva e o código mais grave', () => {
    expect(
      combineDays([
        { max: 20.6, min: 11, rain: 43, code: 53 },
        { max: 20.9, min: 11.4, rain: 98, code: 81 },
      ]),
    ).toEqual({ max: 20.9, min: 11, rain: 98, code: 81 });
    expect(
      combineDays([
        { max: 26, min: 15, rain: null, code: 2 },
        { max: 31, min: 19, rain: 60, code: 1 },
      ]),
    ).toEqual({ max: 31, min: 15, rain: 60, code: 2 });
    expect(combineDays([])).toBeNull();
  });

  it('o texto do aviso: chuva só a partir de 20%, sem rótulo para código desconhecido', () => {
    expect(briefingWeatherText({ max: 31, min: 15, rain: 60, code: 2 })).toBe(
      'Parcialmente nublado, 15° a 31°, chuva 60%',
    );
    expect(briefingWeatherText({ max: 27.4, min: 13.6, rain: 10, code: 0 })).toBe(
      'Céu limpo, 14° a 27°',
    );
    expect(briefingWeatherText({ max: 31, min: 15, rain: 20, code: 42 })).toBe(
      '15° a 31°, chuva 20%',
    );
    expect(briefingWeatherText({ max: 31, min: 15, rain: null, code: null })).toBe('15° a 31°');
  });

  it('a faixa, a parada e os graus', () => {
    expect(rangeText({ max: 26.4, min: 15.2, rain: 0, code: 0 })).toBe('26° / 15°');
    expect(hourText({ temp: 24.4, rain: 30, code: 2, is_day: true })).toBe('24° · chuva 30%');
    expect(hourText({ temp: 24.6, rain: 19, code: 2, is_day: true })).toBe('25°');
    expect(degrees(-0.4)).toBe('0°');
    expect(degrees(-2.6)).toBe('-3°');
  });
});
