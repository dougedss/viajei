import {
  combineDays,
  dailyOn,
  dayPoints,
  horizonOf,
  hourlyAt,
  type DayPoints,
  type DayWeather,
  type Forecast,
  type Horizon,
  type HourWeather,
  type WeatherPlace,
} from '@shared/weather.ts';
import type { Stop, Trip, TripDay, WeatherEntry } from '@/lib/db/schema.ts';
import { fnv64 } from '@/lib/ids/hash.ts';

/**
 * O clima da viagem no aparelho, puro: o que pedir (os lugares de cada dia dentro do horizonte), quando
 * o que está guardado ficou velho, como a resposta vira as entradas da store `weather`, o que sai do
 * cache e o "atualizado às". Os lugares, os códigos e os textos vêm de `_shared/weather.ts`, os mesmos
 * do aviso da manhã.
 */

export type DayPlan = {
  day_id: string;
  date: string;
  horizon: Horizon;
  points: DayPoints;
  /** o dos lugares e da data: muda quando uma parada muda de lugar ou de horário */
  hash: string;
  /** está no horizonte e tem lugar: precisa de previsão */
  needs: boolean;
};

export type TripWeatherPlan = {
  trip_id: string;
  days: DayPlan[];
  /** os lugares distintos dos dias que precisam de previsão, na ordem do pedido */
  places: WeatherPlace[];
  /** o primeiro e o último dia pedidos; null quando nenhum dia precisa */
  start: string | null;
  end: string | null;
  /** muda quando muda qualquer dia que precisa de previsão */
  hash: string;
};

function dayHash(date: string, points: DayPoints): string {
  const ends = points.ends ? [points.ends.start.key, points.ends.end?.key ?? ''] : [];
  const stops = points.stops.map((s) => `${s.stop_id}@${s.place.key}@${s.hour}`);
  return fnv64(JSON.stringify([date, ends, stops]));
}

/** O que a viagem precisa do Open-Meteo hoje: uma chamada para todos os dias dentro do horizonte. */
export function planTripWeather(
  tripId: string,
  days: readonly Pick<TripDay, 'id' | 'date'>[],
  stopsOf: (dayId: string) => readonly Stop[],
  today: string,
): TripWeatherPlan {
  const plans = days.map((d): DayPlan => {
    const points = dayPoints(stopsOf(d.id));
    const horizon = horizonOf(d.date, today);
    return {
      day_id: d.id,
      date: d.date,
      horizon,
      points,
      hash: dayHash(d.date, points),
      needs: horizon.status === 'forecast' && (points.ends !== null || points.stops.length > 0),
    };
  });
  const needed = plans.filter((p) => p.needs);
  const places = new Map<string, WeatherPlace>();
  for (const p of needed) {
    for (const place of [
      p.points.ends?.start,
      p.points.ends?.end,
      ...p.points.stops.map((s) => s.place),
    ]) {
      if (place) places.set(place.key, place);
    }
  }
  const dates = needed.map((p) => p.date).sort();
  return {
    trip_id: tripId,
    days: plans,
    places: [...places.values()],
    start: dates[0] ?? null,
    end: dates.at(-1) ?? null,
    hash: fnv64(needed.map((p) => p.hash).join(',')),
  };
}

/**
 * Durante a viagem, a previsão vale 1 h: o tempo do dia é o que importa, e os modelos do Open-Meteo
 * se refazem a cada hora. Antes dela, 6 h: a previsão de daqui a dias muda devagar, e cada aparelho
 * pede menos.
 */
export const FRESH_DURING_TRIP_MS = 60 * 60 * 1000;
export const FRESH_BEFORE_TRIP_MS = 6 * 60 * 60 * 1000;

export function freshFor(trip: Pick<Trip, 'start_date' | 'end_date'>, today: string): number {
  return today >= trip.start_date && today <= trip.end_date
    ? FRESH_DURING_TRIP_MS
    : FRESH_BEFORE_TRIP_MS;
}

/**
 * Velho: um dia que precisa de previsão não tem entrada, a entrada é de outros lugares (outro `hash`)
 * ou passou do prazo. Sem nenhum dia precisando (viagem passada, ou longe demais), nunca é velho.
 */
export function weatherStale(
  plan: TripWeatherPlan,
  entries: ReadonlyMap<string, WeatherEntry>,
  now: Date,
  freshMs: number,
): boolean {
  return plan.days.some((d) => {
    if (!d.needs) return false;
    const entry = entries.get(d.day_id);
    if (entry?.hash !== d.hash) return true;
    return now.getTime() - Date.parse(entry.fetched_at) > freshMs;
  });
}

/** A resposta (na ordem de `plan.places`) vira uma entrada por dia que precisava de previsão. */
export function buildEntries(
  plan: TripWeatherPlan,
  forecasts: readonly Forecast[],
  fetchedAt: string,
): WeatherEntry[] {
  const forecastOf = (place: WeatherPlace): Forecast | null =>
    forecasts[plan.places.findIndex((p) => p.key === place.key)] ?? null;
  return plan.days
    .filter((d) => d.needs)
    .map((d) => {
      const places: WeatherEntry['places'] = [];
      for (const [role, place] of [
        ['start', d.points.ends?.start],
        ['end', d.points.ends?.end],
      ] as const) {
        const f = place ? forecastOf(place) : null;
        const day = place && f ? dailyOn(f, d.date) : null;
        if (place && day) places.push({ role, lat: place.lat, lng: place.lng, day });
      }
      const stops: WeatherEntry['stops'] = {};
      for (const s of d.points.stops) {
        const f = forecastOf(s.place);
        const hour = f ? hourlyAt(f, d.date, s.hour) : null;
        if (hour) stops[s.stop_id] = { ...hour, hour: s.hour };
      }
      return {
        trip_day_id: d.day_id,
        trip_id: plan.trip_id,
        date: d.date,
        hash: d.hash,
        fetched_at: fetchedAt,
        places,
        stops,
      };
    });
}

/**
 * O que sai do cache: o dia que já passou (nada aparece dele) e o de viagem que não está mais no
 * aparelho. O `wipeTrip` leva o da viagem que saiu na hora; esta varredura pega o resto.
 */
export function weatherSweep(
  entries: readonly Pick<WeatherEntry, 'trip_day_id' | 'trip_id' | 'date'>[],
  liveTrips: ReadonlySet<string>,
  today: string,
): string[] {
  return entries
    .filter((e) => e.date < today || !liveTrips.has(e.trip_id))
    .map((e) => e.trip_day_id);
}

// ------------------------------------------------------------------------- o que a tela mostra
export type DaySummary = {
  start: { lat: number; lng: number; day: DayWeather };
  end: { lat: number; lng: number; day: DayWeather } | null;
  /** os dois lugares juntos (a faixa da visão geral, o chip da maquete): o mesmo que o aviso diz */
  day: DayWeather;
};

/** O resumo de um dia guardado; sem os números de onde ele começa, nada. */
export function daySummary(entry: WeatherEntry | undefined): DaySummary | null {
  const start = entry?.places.find((p) => p.role === 'start');
  if (!entry || !start) return null;
  const end = entry.places.find((p) => p.role === 'end') ?? null;
  const day = combineDays([start.day, ...(end ? [end.day] : [])]);
  return day ? { start, end, day } : null;
}

/** A previsão na hora de uma parada com horário; sem ela, nada. */
export function stopForecast(
  entry: WeatherEntry | undefined,
  stopId: string,
): (HourWeather & { hour: string }) | null {
  if (!entry || !Object.hasOwn(entry.stops, stopId)) return null;
  return entry.stops[stopId] ?? null;
}

function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "atualizado às 07:40", "atualizado ontem às 18:10" ou "atualizado em 05/11 às 18:10". */
export function updatedLabel(fetchedAt: string, now: Date): string {
  const at = new Date(fetchedAt);
  if (sameDay(at, now)) return `atualizado às ${clock(at)}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return `atualizado ontem às ${clock(at)}`;
  const dm = `${String(at.getDate()).padStart(2, '0')}/${String(at.getMonth() + 1).padStart(2, '0')}`;
  return `atualizado em ${dm} às ${clock(at)}`;
}
