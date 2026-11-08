import { List } from 'lucide-react';
import type { ReactNode } from 'react';
import { TrailList } from '@/features/travel-mode/components/TrailList.tsx';
import { progress, type DayState } from '@/features/travel-mode/rules.ts';
import { formatKm, totalAscent } from '@/features/itinerary/rules.ts';
import type { DayRoute, Profile, RouteLeg, Stop } from '@/lib/db/schema.ts';
import { formatDuration } from '@/lib/time/index.ts';

/**
 * "Lista do dia": a lista acessível da trilha, no lugar da maquete (por preferência do aparelho,
 * `?render=list`, aparelho sem WebGL2). Ocupa a área inteira e rola dentro dela; a barra do dia e o
 * "Agora" ficam onde estão. É o fallback permanente e o conteúdo que o leitor de tela recebe.
 */
type Props = {
  state: DayState;
  legs: Map<string, RouteLeg>;
  profiles: Map<string, Profile>;
  route: DayRoute | null;
  /** um aviso discreto quando a maquete não pôde ser desenhada */
  notice?: string | undefined;
  stopExtras?: ((stop: Stop) => ReactNode) | undefined;
  /** tocar no nome de uma parada abre a folha dela */
  onOpenStop?: ((stopId: string) => void) | undefined;
  /** o espaço reservado embaixo para a barra do "Agora", em px */
  bottomInset: number;
};

export function DayList({
  state,
  legs,
  profiles,
  route,
  notice,
  stopExtras,
  onOpenStop,
  bottomInset,
}: Props) {
  const done = progress(state.stops);
  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : null;
  const duration = route ? route.legs.reduce((acc, l) => acc + l.duration_s, 0) / 60 : null;
  return (
    <section
      aria-labelledby="h-lista"
      className="absolute inset-0 overflow-y-auto bg-paper px-4 pt-3"
      style={{ paddingBottom: bottomInset + 16 }}
      data-day-list
    >
      <div className="flex items-baseline gap-3 pb-3">
        <h2 id="h-lista" className="label-caps text-accent-ink">
          Lista do dia
        </h2>
        <span className="mv-text-15 text-ink-2">
          {done.done} de {done.total} {done.total === 1 ? 'parada' : 'paradas'}
        </span>
      </div>
      {notice ? (
        <p className="flex items-center gap-2 pb-3 mv-text-14 text-ink-2">
          <List className="size-4" aria-hidden="true" />
          {notice}
        </p>
      ) : null}
      {state.stops.length === 0 ? (
        <p className="mv-text-17 text-ink-2">Nenhuma parada neste dia.</p>
      ) : (
        <TrailList
          state={state}
          legs={legs}
          profiles={profiles}
          stopExtras={stopExtras}
          onOpenStop={onOpenStop}
        />
      )}
      {route && distance !== null && duration !== null ? (
        <p className="border-t border-line pt-3 mv-text-15 text-ink-2">
          Rota do dia · {formatKm(distance)} · {formatDuration(duration)} · sobe{' '}
          {totalAscent(route.elevation).toLocaleString('pt-BR')} m
        </p>
      ) : null}
    </section>
  );
}
