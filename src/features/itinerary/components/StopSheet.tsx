import { ListOrdered } from 'lucide-react';
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/ui/ButtonLink.tsx';
import { Sheet } from '@/components/ui/Sheet.tsx';
import { StopForecast } from '@/features/weather/components/StopForecast.tsx';
import { WeatherCredit } from '@/features/weather/components/WeatherCredit.tsx';
import type { Stop, WeatherEntry } from '@/lib/db/schema.ts';
import { stopForecast } from '@/features/weather/rules.ts';
import { OSM_ATTRIBUTION } from '@/lib/geocode/nominatim.ts';
import { hhmm } from '@/lib/time/index.ts';
import { autoLine, isAutoStop } from '../rules.ts';
import { kindLabel, stopRole } from '../stop-kinds.ts';
import { NavLinks } from './StopCard.tsx';

/**
 * A folha de uma parada (fase 14): a mesma no mapa 2D (o pino) e na maquete (a miniatura, a pílula e
 * a linha da lista): nome, tipo, dia e posição, horário, "fecha às", endereço, a previsão no horário,
 * Google Maps e Waze, "Ver no roteiro". Quem abre pode acrescentar ações (Chegamos!, "+ Gasto").
 * A parada que se registrou sozinha (fase 15) diz isso, com as horas medidas, e o crédito do
 * OpenStreetMap quando o nome e o endereço vieram de lá.
 */
type Props = {
  stop: Stop | null;
  tripId: string;
  /** o dia da parada e a posição dela na lista do dia (1 é a primeira) */
  day: { id: string; index: number } | null;
  position: number | null;
  weather: { entry: WeatherEntry | undefined; updatedAt: string | null };
  onClose: () => void;
  /** as ações de quem abre, acima dos links de navegação */
  actions?: ReactNode;
};

export function StopSheet({ stop, tripId, day, position, weather, onClose, actions }: Props) {
  const forecast = stop ? stopForecast(weather.entry, stop.id) : null;
  return (
    <Sheet
      open={stop !== null}
      onClose={onClose}
      title={stop?.name ?? ''}
      {...(stop && day
        ? {
            description: `${kindLabel(stop.kind)} · Dia ${String(day.index + 1)} · ${stopRole(stop.kind, position)}`,
          }
        : {})}
    >
      {stop && day ? (
        <div className="grid gap-3" data-stop-sheet={stop.id}>
          {stop.time || stop.closes_at ? (
            <p className="flex flex-wrap items-baseline gap-x-2 mv-text-16">
              {stop.time ? (
                <span className="num mv-text-22 font-semibold">{hhmm(stop.time)}</span>
              ) : null}
              {stop.closes_at ? (
                <span className="text-ink-2">fecha às {hhmm(stop.closes_at)}</span>
              ) : null}
            </p>
          ) : null}
          {isAutoStop(stop) ? <AutoLine stop={stop} /> : null}
          {stop.address ? <p className="mv-text-15 text-ink-2">{stop.address}</p> : null}
          {stop.time ? (
            <StopForecast forecast={forecast} at={`às ${hhmm(stop.time)}`} className="mv-text-15" />
          ) : null}
          {actions}
          <NavLinks stop={stop} />
          <ButtonLink to={`/viagens/${tripId}/roteiro/${day.id}`} variant="secondary" size="md">
            <ListOrdered className="size-5" aria-hidden="true" />
            Ver no roteiro
          </ButtonLink>
          {forecast ? <WeatherCredit updatedAt={weather.updatedAt} /> : null}
          {isAutoStop(stop) && stop.address ? (
            <p className="text-[13px] text-ink-2" data-osm-credit>
              {OSM_ATTRIBUTION}
            </p>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function AutoLine({ stop }: { stop: Stop }) {
  return (
    <p className="mv-text-15 text-ink-2" data-auto-stop>
      {autoLine(stop)}
    </p>
  );
}
