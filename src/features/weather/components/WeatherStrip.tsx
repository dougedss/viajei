import { Droplet } from 'lucide-react';
import { degrees, rainShown } from '@shared/weather.ts';
import { Card } from '@/components/ui/Card.tsx';
import { dayMonthOf, weekdayShortOf } from '../format.ts';
import type { TripWeather } from '../queries.ts';
import { daySummary, type DaySummary } from '../rules.ts';
import { WeatherCredit } from './WeatherCredit.tsx';
import { WeatherGlyph } from './WeatherGlyph.tsx';

/**
 * A faixa da visão geral: um quadro por dia com previsão (ícone, máxima, mínima e a chuva, quando
 * passa de 20%), "a partir de 26/11" nos dias além dos 15 do Open-Meteo, e a atribuição. O dia que
 * passou, o dia sem lugar e o dia sem números não aparecem: sem previsão, nada.
 */
export function WeatherStrip({ weather }: { weather: TripWeather }) {
  if (!weather.plan) return null;
  type Tile = {
    id: string;
    date: string;
    label: string;
    later: string | null;
    summary: DaySummary | null;
  };
  const tiles = weather.plan.days.flatMap((d): Tile[] => {
    const label = `${weekdayShortOf(d.date)} ${d.date.slice(8, 10)}`;
    if (d.horizon.status === 'later' && d.points.ends) {
      return [{ id: d.day_id, date: d.date, label, later: d.horizon.from, summary: null }];
    }
    const summary = daySummary(weather.entries.get(d.day_id));
    return d.needs && summary ? [{ id: d.day_id, date: d.date, label, later: null, summary }] : [];
  });
  if (tiles.length === 0) return null;
  const anyForecast = tiles.some((t) => t.summary);

  return (
    <section className="grid gap-3" aria-labelledby="h-tempo" data-weather-strip>
      <h2 id="h-tempo" className="label-caps text-accent-ink">
        Previsão do tempo
      </h2>
      <Card className="grid gap-3">
        <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
          {tiles.map((t) => {
            const rain = t.summary ? rainShown(t.summary.day.rain) : null;
            return (
              <li
                key={t.id}
                data-weather-day={t.date}
                className="grid min-w-[78px] snap-start justify-items-center gap-1 rounded-[14px] bg-paper px-2 py-2.5 text-center"
              >
                <span className="text-[13px] font-semibold text-ink-2">{t.label}</span>
                {t.summary ? (
                  <>
                    <WeatherGlyph code={t.summary.day.code} className="size-7" />
                    <span className="num text-[20px] leading-none font-semibold" data-weather-max>
                      {degrees(t.summary.day.max)}
                    </span>
                    <span className="num text-[15px] leading-none text-ink-2" data-weather-min>
                      {degrees(t.summary.day.min)}
                    </span>
                    <span
                      className="flex h-4 items-center gap-0.5 num text-[13px] font-semibold text-person-sky"
                      aria-label={rain === null ? undefined : `chuva ${String(rain)}%`}
                    >
                      {rain === null ? null : (
                        <>
                          <Droplet className="size-3.5" aria-hidden="true" />
                          {rain}%
                        </>
                      )}
                    </span>
                  </>
                ) : (
                  <span
                    className="max-w-[72px] text-[12px] leading-tight text-ink-2"
                    data-weather-later
                  >
                    previsão a partir de {dayMonthOf(t.later ?? '')}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <WeatherCredit updatedAt={anyForecast ? weather.updatedAt : null} />
      </Card>
    </section>
  );
}
