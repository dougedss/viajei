import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TrailList } from '@/features/travel-mode/components/TrailList.tsx';
import { progress, type DayState } from '@/features/travel-mode/rules.ts';
import { formatKm, totalAscent } from '@/features/itinerary/rules.ts';
import type { DayRoute, Profile, RouteLeg } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { formatDuration } from '@/lib/time/index.ts';

/**
 * "Lista do dia": a lista acessível da trilha, recolhível. Com a maquete, começa fechada; sem
 * maquete (preferência, aparelho sem WebGL2, reduzir movimento), aberta. É o fallback permanente e
 * o conteúdo que o leitor de tela recebe.
 */
type Props = {
  state: DayState;
  legs: Map<string, RouteLeg>;
  profiles: Map<string, Profile>;
  route: DayRoute | null;
  defaultOpen: boolean;
  /** ações no rodapé da lista (ex.: "Ver como lista", "Ver a maquete") */
  footer?: ReactNode;
};

export function DayList({ state, legs, profiles, route, defaultOpen, footer }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const done = progress(state.stops);
  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : null;
  const duration = route ? route.legs.reduce((acc, l) => acc + l.duration_s, 0) / 60 : null;
  return (
    <section aria-labelledby="h-lista" className="grid gap-3 rounded-card bg-card p-5 shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="lista-do-dia"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-baseline gap-3">
          <span id="h-lista" className="label-caps text-accent-ink">
            Lista do dia
          </span>
          <span className="text-[15px] text-ink-2">
            {done.done} de {done.total} {done.total === 1 ? 'parada' : 'paradas'}
          </span>
        </span>
        <ChevronDown
          className={cx(
            'size-5 text-ink-2 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      <div id="lista-do-dia" hidden={!open} className="grid gap-3">
        {state.stops.length === 0 ? (
          <p className="text-[17px] text-ink-2">Nenhuma parada neste dia.</p>
        ) : (
          <TrailList state={state} legs={legs} profiles={profiles} />
        )}
        {route && distance !== null && duration !== null ? (
          <p className="border-t border-line pt-3 text-[15px] text-ink-2">
            Rota do dia · {formatKm(distance)} · {formatDuration(duration)} · sobe{' '}
            {totalAscent(route.elevation).toLocaleString('pt-BR')} m
          </p>
        ) : null}
        {footer ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">{footer}</div>
        ) : null}
      </div>
    </section>
  );
}
