import { describe, expect, it } from 'vitest';
import { parseForecast } from '@shared/weather.ts';
import { makeDay, makeStop, makeTrip, TRIP_ID } from '@/test/factories.ts';
import { OPEN_METEO_TWO_PLACES, RECORDED_DATE } from '@/test/fixtures/open-meteo.ts';
import type { Stop, WeatherEntry } from '@/lib/db/schema.ts';
import {
  buildEntries,
  daySummary,
  FRESH_BEFORE_TRIP_MS,
  FRESH_DURING_TRIP_MS,
  freshFor,
  planTripWeather,
  stopForecast,
  updatedLabel,
  weatherStale,
  weatherSweep,
} from './rules.ts';

const D1 = makeDay({ id: 'dia-1', date: RECORDED_DATE });
const D2 = makeDay({ id: 'dia-2', date: '2026-11-09' });
const FAR = makeDay({ id: 'dia-longe', date: '2026-12-11' });

const stops: Record<string, Stop[]> = {
  'dia-1': [
    makeStop({
      id: 's1',
      trip_day_id: 'dia-1',
      position: 'a0',
      time: '07:00',
      lat: -26.40854,
      lng: -50.14241,
    }),
    makeStop({
      id: 's2',
      trip_day_id: 'dia-1',
      position: 'a1',
      time: '13:20',
      lat: -29.48979,
      lng: -51.35668,
    }),
  ],
  'dia-2': [makeStop({ id: 's3', trip_day_id: 'dia-2', position: 'a0', name: 'Sem lugar' })],
  'dia-longe': [
    makeStop({ id: 's4', trip_day_id: 'dia-longe', position: 'a0', lat: -26.4, lng: -50.1 }),
  ],
};
const stopsOf = (id: string) => stops[id] ?? [];
const TODAY = '2026-11-07';

describe('o que a viagem pede ao Open-Meteo', () => {
  const plan = planTripWeather(TRIP_ID, [D1, D2, FAR], stopsOf, TODAY);

  it('só os dias do horizonte com lugar; os lugares distintos, numa chamada', () => {
    expect(plan.days.map((d) => `${d.day_id} ${d.horizon.status} ${String(d.needs)}`)).toEqual([
      'dia-1 forecast true',
      'dia-2 forecast false',
      'dia-longe later false',
    ]);
    expect(plan.places.map((p) => p.key)).toEqual(['-26.41,-50.14', '-29.49,-51.36']);
    expect([plan.start, plan.end]).toEqual([RECORDED_DATE, RECORDED_DATE]);
    expect(plan.days[2]?.horizon).toEqual({ status: 'later', from: '2026-11-26' });
  });

  it('o hash muda quando uma parada muda de lugar ou de horário, e só então', () => {
    const moved = planTripWeather(
      TRIP_ID,
      [D1],
      () => [stopsOf('dia-1')[0]!, { ...stopsOf('dia-1')[1]!, lat: -29.17924, lng: -51.55581 }],
      TODAY,
    );
    const retimed = planTripWeather(
      TRIP_ID,
      [D1],
      () => [stopsOf('dia-1')[0]!, { ...stopsOf('dia-1')[1]!, time: '15:00' }],
      TODAY,
    );
    const renamed = planTripWeather(
      TRIP_ID,
      [D1],
      () => [stopsOf('dia-1')[0]!, { ...stopsOf('dia-1')[1]!, name: 'Outro nome' }],
      TODAY,
    );
    const base = plan.days[0]?.hash;
    expect(moved.days[0]?.hash).not.toBe(base);
    expect(retimed.days[0]?.hash).not.toBe(base);
    expect(renamed.days[0]?.hash).toBe(base);
  });

  it('a resposta gravada vira uma entrada por dia, com os dois lugares e a hora de cada parada', () => {
    const parsed = parseForecast(OPEN_METEO_TWO_PLACES, 2);
    const entries = parsed.ok
      ? buildEntries(plan, parsed.forecasts, '2026-11-07T10:40:00.000Z')
      : [];
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry?.places).toEqual([
      { role: 'start', lat: -26.41, lng: -50.14, day: { max: 20.6, min: 11, rain: 43, code: 53 } },
      { role: 'end', lat: -29.49, lng: -51.36, day: { max: 20.9, min: 11, rain: 98, code: 81 } },
    ]);
    // 13:20 arredonda para as 13:00
    expect(entry && stopForecast(entry, 's2')).toEqual({
      temp: 20.2,
      rain: 41,
      code: 3,
      is_day: true,
      hour: '13:00',
    });
    expect(entry && stopForecast(entry, 's3')).toBeNull();
    expect(daySummary(entry)?.day).toEqual({ max: 20.9, min: 11, rain: 98, code: 81 });
    expect(daySummary(undefined)).toBeNull();
    expect(daySummary(entry && { ...entry, places: [] })).toBeNull();
  });
});

describe('quando o que está guardado fica velho', () => {
  const plan = planTripWeather(TRIP_ID, [D1, D2, FAR], stopsOf, TODAY);
  const fresh = (over: Partial<WeatherEntry> = {}): Map<string, WeatherEntry> =>
    new Map([
      [
        'dia-1',
        {
          trip_day_id: 'dia-1',
          trip_id: TRIP_ID,
          date: RECORDED_DATE,
          hash: plan.days[0]?.hash ?? '',
          fetched_at: '2026-11-07T10:00:00.000Z',
          places: [],
          stops: {},
          ...over,
        },
      ],
    ]);
  const at = (iso: string) => new Date(iso);

  it('sem entrada para um dia que precisa, ou com outro hash: velho', () => {
    expect(weatherStale(plan, new Map(), at('2026-11-07T10:05:00Z'), FRESH_BEFORE_TRIP_MS)).toBe(
      true,
    );
    expect(
      weatherStale(
        plan,
        fresh({ hash: 'outro' }),
        at('2026-11-07T10:05:00Z'),
        FRESH_BEFORE_TRIP_MS,
      ),
    ).toBe(true);
  });

  it('o prazo: 6 h antes da viagem, 1 h durante', () => {
    expect(weatherStale(plan, fresh(), at('2026-11-07T15:59:00Z'), FRESH_BEFORE_TRIP_MS)).toBe(
      false,
    );
    expect(weatherStale(plan, fresh(), at('2026-11-07T16:01:00Z'), FRESH_BEFORE_TRIP_MS)).toBe(
      true,
    );
    expect(weatherStale(plan, fresh(), at('2026-11-07T10:59:00Z'), FRESH_DURING_TRIP_MS)).toBe(
      false,
    );
    expect(weatherStale(plan, fresh(), at('2026-11-07T11:01:00Z'), FRESH_DURING_TRIP_MS)).toBe(
      true,
    );
    const trip = makeTrip({ start_date: '2026-12-11', end_date: '2026-12-14' });
    expect(freshFor(trip, '2026-12-12')).toBe(FRESH_DURING_TRIP_MS);
    expect(freshFor(trip, '2026-11-26')).toBe(FRESH_BEFORE_TRIP_MS);
  });

  it('a viagem sem nenhum dia no horizonte nunca está velha', () => {
    const far = planTripWeather(TRIP_ID, [FAR], stopsOf, TODAY);
    expect(weatherStale(far, new Map(), at('2026-11-07T10:00:00Z'), FRESH_BEFORE_TRIP_MS)).toBe(
      false,
    );
  });
});

describe('o que sai do cache e a hora da previsão', () => {
  it('o dia que passou e o de viagem que saiu do aparelho', () => {
    const e = (trip_day_id: string, trip_id: string, date: string) => ({
      trip_day_id,
      trip_id,
      date,
    });
    expect(
      weatherSweep(
        [
          e('ontem', 'viva', '2026-11-06'),
          e('hoje', 'viva', '2026-11-07'),
          e('outra', 'saiu', '2026-11-08'),
        ],
        new Set(['viva']),
        '2026-11-07',
      ),
    ).toEqual(['ontem', 'outra']);
  });

  it('"atualizado às", "ontem às" e a data', () => {
    const now = new Date(2026, 10, 7, 19, 30);
    expect(updatedLabel(new Date(2026, 10, 7, 7, 40).toISOString(), now)).toBe(
      'atualizado às 07:40',
    );
    expect(updatedLabel(new Date(2026, 10, 6, 18, 10).toISOString(), now)).toBe(
      'atualizado ontem às 18:10',
    );
    expect(updatedLabel(new Date(2026, 10, 5, 18, 10).toISOString(), now)).toBe(
      'atualizado em 05/11 às 18:10',
    );
  });
});
