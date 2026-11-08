import { hourText, weatherCode, type HourWeather } from '@shared/weather.ts';
import { cx } from '@/lib/cx.ts';
import { WeatherGlyph } from './WeatherGlyph.tsx';

type Props = {
  forecast: (HourWeather & { hour: string }) | null;
  /** "às 13:30" quando o texto precisa dizer de que hora é (o "Agora", a folha do mapa) */
  at?: string | undefined;
  className?: string;
};

/**
 * A previsão no horário de uma parada, pequena: ícone, temperatura e chuva naquela hora, rotulada
 * como previsão. Só para parada com horário escrito; sem previsão, nada.
 */
export function StopForecast({ forecast, at, className }: Props) {
  if (!forecast) return null;
  const info = weatherCode(forecast.code, forecast.is_day);
  const text = hourText(forecast);
  return (
    <p
      className={cx('mt-1 flex items-center gap-1.5 mv-text-14 text-ink-2', className)}
      aria-label={`Previsão${at ? ` ${at}` : ''}: ${info.known ? `${info.label}, ` : ''}${text.replace(' · ', ', ')}`}
      data-stop-forecast
    >
      <WeatherGlyph code={forecast.code} isDay={forecast.is_day} className="size-4" />
      <span aria-hidden="true">
        previsão{at ? ` ${at}` : ''} <span className="num font-semibold text-ink">{text}</span>
      </span>
    </p>
  );
}
