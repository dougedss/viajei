import { ArrowRight } from 'lucide-react';
import { rainShown, rangeText } from '@shared/weather.ts';
import { Card } from '@/components/ui/Card.tsx';
import type { Stop } from '@/lib/db/schema.ts';
import { dayMonthOf } from '../format.ts';
import type { TripWeather } from '../queries.ts';
import { daySummary } from '../rules.ts';
import { usePlaceName } from '../usePlaceName.ts';
import { WeatherCredit } from './WeatherCredit.tsx';
import { WeatherGlyph } from './WeatherGlyph.tsx';

type Props = {
  weather: TripWeather;
  dayId: string;
  /** as paradas do dia, em ordem: o nome de reserva de onde começa e de onde termina */
  stops: readonly Stop[];
};

function located(stops: readonly Stop[]): Stop[] {
  return stops.filter((s) => !s.skipped && s.lat !== null && s.lng !== null);
}

/**
 * A previsão de um dia na página dele: onde começa e onde termina, com o nome do município
 * ("Papanduva 26° / 15° → Nova Petrópolis 31° / 19° · chuva 60%"), ou "Previsão a partir de 26/11"
 * para o dia além do horizonte. O dia que passou e o dia sem previsão não mostram nada.
 */
export function DayForecast({ weather, dayId, stops }: Props) {
  const plan = weather.plan?.days.find((d) => d.day_id === dayId);
  const summary = daySummary(weather.entries.get(dayId));
  const ends = located(stops);
  const startName = usePlaceName(summary?.start ?? null, ends[0]?.name ?? null);
  const endName = usePlaceName(summary?.end ?? null, ends.at(-1)?.name ?? null);
  if (!plan) return null;

  if (plan.horizon.status === 'later' && plan.points.ends) {
    return (
      <p className="text-[15px] text-ink-2" data-weather-later>
        Previsão do tempo a partir de {dayMonthOf(plan.horizon.from)}
      </p>
    );
  }
  if (!plan.needs || !summary) return null;
  const rain = rainShown(summary.day.rain);

  return (
    <Card className="grid gap-2" data-day-forecast>
      <p className="label-caps text-accent-ink">Previsão do tempo</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[16px]">
        <span className="inline-flex items-center gap-1.5">
          <WeatherGlyph code={summary.start.day.code} className="size-5" />
          <span className="font-semibold">{startName}</span>
          <span className="num">{rangeText(summary.start.day)}</span>
        </span>
        {summary.end ? (
          <>
            <ArrowRight className="size-4 text-ink-2" aria-label="até" />
            <span className="inline-flex items-center gap-1.5">
              <WeatherGlyph code={summary.end.day.code} className="size-5" />
              <span className="font-semibold">{endName}</span>
              <span className="num">{rangeText(summary.end.day)}</span>
            </span>
          </>
        ) : null}
        {rain === null ? null : <span className="text-person-sky">· chuva {rain}%</span>}
      </p>
      <WeatherCredit updatedAt={weather.updatedAt} />
    </Card>
  );
}
