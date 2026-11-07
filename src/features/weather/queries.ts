import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { todayIn } from '@shared/weather.ts';
import { useTripDays, useTripStops } from '@/features/itinerary/queries.ts';
import { useNow } from '@/features/travel-mode/hooks.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { db, type Trip, type WeatherEntry } from '@/lib/db/schema.ts';
import { fetchTripWeather } from './fetch.ts';
import { freshFor, planTripWeather, weatherStale, type TripWeatherPlan } from './rules.ts';

export type TripWeather = {
  plan: TripWeatherPlan | null;
  /** o que está guardado no aparelho, por dia */
  entries: ReadonlyMap<string, WeatherEntry>;
  /** o cache já respondeu */
  loaded: boolean;
  fetching: boolean;
  /** a última busca falhou (o que está guardado continua valendo) */
  failed: boolean;
  /** a previsão mais antiga entre os dias que precisam dela: é o "atualizado às" honesto */
  updatedAt: string | null;
  today: string;
};

const EMPTY: ReadonlyMap<string, WeatherEntry> = new Map();

/**
 * A previsão da viagem, como a rota do dia (`useDayRoute`): lê o Dexie; com rede e cache velho, busca
 * pelo TanStack Query e grava. Velho é outro `hash` (uma parada mudou de lugar ou de horário), um dia
 * do horizonte sem previsão ou o prazo (1 h durante a viagem, 6 h antes). Sem rede, mostra o que tem.
 * Todas as telas da viagem usam o mesmo hook: a mesma chave, uma busca só.
 */
export function useTripWeather(
  trip: Pick<Trip, 'id' | 'start_date' | 'end_date'> | null | undefined,
): TripWeather {
  const tripId = trip?.id ?? '';
  const days = useTripDays(tripId);
  const stops = useTripStops(tripId);
  const now = useNow(60_000);
  const online = useOnline();
  const today = todayIn(now);
  const dayIds = (days ?? []).map((d) => d.id);
  const dayKey = dayIds.join(',');
  // o resultado leva a chave dos dias que consultou: quando os dias mudam (ao carregar), o
  // `useLiveQuery` ainda devolve o resultado anterior até o novo chegar, e um cache "vazio" de outros
  // dias dispararia uma busca antes de o que está guardado ser lido
  const read = useLiveQuery(
    async () => ({
      key: dayKey,
      rows:
        dayIds.length === 0 ? [] : await db.weather.where('trip_day_id').anyOf(dayIds).toArray(),
    }),
    [dayKey],
  );
  const stored = read?.key === dayKey ? read.rows : undefined;
  const entries = stored ? new Map(stored.map((e) => [e.trip_day_id, e])) : EMPTY;
  const plan =
    trip && days
      ? planTripWeather(trip.id, days, (id) => stops.filter((s) => s.trip_day_id === id), today)
      : null;
  const needed = plan ? plan.days.filter((d) => d.needs) : [];
  const updatedAt =
    needed
      .map((d) => entries.get(d.day_id)?.fetched_at)
      .filter((x): x is string => x !== undefined)
      .sort()[0] ?? null;
  const stale =
    !!trip &&
    !!plan &&
    stored !== undefined &&
    weatherStale(plan, entries, now, freshFor(trip, today));

  const query = useQuery({
    // a hora do que está guardado entra na chave: quando o prazo vence, é uma busca nova
    queryKey: ['weather', tripId, plan?.hash ?? '', updatedAt ?? ''],
    queryFn: () => (plan ? fetchTripWeather(plan) : Promise.resolve([])),
    enabled: online && stale,
    retry: 1,
    retryDelay: 30_000,
    staleTime: Infinity,
  });

  return {
    plan,
    entries,
    loaded: stored !== undefined && days !== undefined,
    fetching: query.isFetching,
    failed: query.isError,
    updatedAt,
    today,
  };
}
