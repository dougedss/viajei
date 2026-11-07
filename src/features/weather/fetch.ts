import { forecastUrl, parseForecast, todayIn } from '@shared/weather.ts';
import { db, type WeatherEntry } from '@/lib/db/schema.ts';
import { buildEntries, weatherSweep, type TripWeatherPlan } from './rules.ts';

/**
 * A previsão vem direto do navegador (o Open-Meteo não pede chave e tem CORS aberto): o limite é por
 * IP, então cada aparelho conta o seu, e nada passa pelo Supabase. Uma chamada para a viagem inteira.
 */
export class WeatherRequestError extends Error {
  /** `network`, `invalid` ou `http_<status>` */
  readonly code: string;
  constructor(code: string) {
    super(`Não deu para buscar a previsão (${code}).`);
    this.code = code;
  }
}

/**
 * Busca, guarda e devolve as entradas da viagem. As entradas da viagem que não vieram nesta resposta
 * (o dia que passou, o dia sem lugar, o que saiu do horizonte) saem do cache na mesma transação.
 * Uma falha do Open-Meteo não mexe na conectividade do app: a internet pode estar boa.
 */
export async function fetchTripWeather(plan: TripWeatherPlan): Promise<WeatherEntry[]> {
  if (!plan.start || !plan.end || plan.places.length === 0) return [];
  let res: Response;
  try {
    res = await fetch(
      forecastUrl({ places: plan.places, start: plan.start, end: plan.end, hourly: true }),
      { headers: { accept: 'application/json' } },
    );
  } catch {
    throw new WeatherRequestError('network');
  }
  if (!res.ok) throw new WeatherRequestError(`http_${String(res.status)}`);
  const parsed = parseForecast(await res.json().catch(() => null), plan.places.length);
  if (!parsed.ok) throw new WeatherRequestError('invalid');
  const entries = buildEntries(plan, parsed.forecasts, new Date().toISOString());
  const keep = new Set(entries.map((e) => e.trip_day_id));
  await db.transaction('rw', db.weather, async () => {
    await db.weather.filter((w) => w.trip_id === plan.trip_id && !keep.has(w.trip_day_id)).delete();
    await db.weather.bulkPut(entries);
  });
  return entries;
}

/**
 * Uma vez por abertura do app: tira do cache o dia que já passou e o de viagem que não está mais no
 * aparelho (encerrada há tempo, excluída, ou de que a pessoa saiu).
 */
export async function sweepWeather(now = new Date()): Promise<void> {
  const [entries, trips] = await Promise.all([db.weather.toArray(), db.trips.toArray()]);
  const live = new Set(trips.filter((t) => t.deleted_at === null).map((t) => t.id));
  const gone = weatherSweep(entries, live, todayIn(now));
  if (gone.length > 0) await db.weather.bulkDelete(gone);
}
