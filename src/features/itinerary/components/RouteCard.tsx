import { useQuery } from '@tanstack/react-query';
import { Mountain, RefreshCw, Route as RouteIcon, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import type { DayRoute } from '@/lib/db/schema.ts';
import { formatDuration } from '@/lib/time/index.ts';
import type { DayRouteState } from '../route.ts';
import { formatKm, totalAscent } from '../rules.ts';

type Props = { state: DayRouteState };

const PROVIDER_LABEL: Record<string, string> = {
  ors: 'OpenRouteService',
  'osrm+open-meteo': 'OSRM e Open-Meteo',
};

/** Leitura do lugar, calculada no celular a partir da rota e dos dados embutidos (chunk lazy). */
function usePlaceReading(route: DayRoute | null) {
  return useQuery({
    queryKey: ['place', route?.trip_day_id, route?.hash],
    enabled: route !== null,
    staleTime: Infinity,
    queryFn: async () => {
      if (!route) return null;
      const geo = await import('@/lib/geo/index.ts');
      const reading = geo.readPlace(route);
      return { ...reading, labels: geo.SCENERY_LABELS };
    },
  });
}

/** A rota real do dia: totais, estado do cálculo, botão "atualizar rota" e a leitura do caminho. */
export function RouteCard({ state }: Props) {
  const { route, status, error, stale, refresh } = state;
  const reading = usePlaceReading(route);
  const place = reading.data ?? null;
  const duration = route ? route.legs.reduce((acc, l) => acc + l.duration_s, 0) / 60 : 0;
  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : 0;

  return (
    <Card className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-num text-[22px] leading-tight font-semibold">
          <RouteIcon className="size-5 text-accent-ink" aria-hidden="true" />
          Rota do dia
        </h2>
        {status !== 'insufficient' ? (
          <Button
            variant="secondary"
            size="sm"
            loading={status === 'loading'}
            onClick={refresh}
            aria-label="Atualizar rota"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualizar
          </Button>
        ) : null}
      </div>

      {route ? (
        <p className="flex flex-wrap items-baseline gap-x-3 text-[15px] text-ink-2">
          <span className="num text-[24px] font-semibold text-ink">{formatKm(distance)}</span>
          <span className="num text-[24px] font-semibold text-ink">{formatDuration(duration)}</span>
          <span className="inline-flex items-center gap-1">
            <Mountain className="size-4" aria-hidden="true" />
            sobe {totalAscent(route.elevation).toLocaleString('pt-BR')} m
          </span>
          <span>· {PROVIDER_LABEL[route.provider] ?? route.provider}</span>
        </p>
      ) : null}

      {status === 'insufficient' ? (
        <p className="text-[15px] text-ink-2">
          Marque pelo menos duas paradas no mapa para calcular a rota por estrada.
        </p>
      ) : status === 'loading' ? (
        <p className="text-[15px] text-ink-2">Calculando a rota por estrada…</p>
      ) : status === 'offline' ? (
        <p className="flex items-center gap-2 text-[15px] text-ink-2">
          <WifiOff className="size-4" aria-hidden="true" />
          {route
            ? 'Sem conexão: usando a rota guardada.'
            : 'Sem conexão: a rota é calculada quando a rede voltar.'}
        </p>
      ) : status === 'error' && error ? (
        <p role="alert" className="text-[15px] font-semibold text-late-ink">
          {error.message}
        </p>
      ) : stale ? (
        <p className="text-[15px] text-ink-2">As paradas mudaram: a rota será recalculada.</p>
      ) : null}

      {place ? (
        <div className="grid gap-2 border-t border-line pt-3">
          <p className="label-caps text-accent-ink">Leitura do caminho</p>
          <p className="text-[15px]">
            {place.segments
              .map((s) => `${place.labels[s.kind]} ${formatKm(s.to_m - s.from_m)}`)
              .join(' → ')}
          </p>
          {place.curiosities.length > 0 ? (
            <ul className="grid gap-1 text-[14px] text-ink-2">
              {place.curiosities.slice(0, 5).map((c) => (
                <li key={`${c.kind}-${c.at_m}`}>
                  km {Math.round(c.at_m / 1000)} · {c.caption}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
