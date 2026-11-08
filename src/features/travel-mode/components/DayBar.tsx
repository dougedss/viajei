import { Box, ChevronLeft, ChevronRight, List } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { DayBarState, DayLike } from '../screen.ts';

/**
 * A barra fixa do topo da tela da viagem (fase 14): o nome pequeno, que leva à lista; à direita,
 * botões de ícone (a lista ou a maquete, "Tela acesa"); embaixo, "‹ sáb, 12 dez · Dia 2 ›" e o chip
 * "Hoje" quando a pessoa saiu do dia de hoje. Altura fixa, com a área segura de cima; nada aqui rola.
 */
type Props<T extends DayLike> = {
  tripName: string;
  bar: DayBarState<T>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** a lista do dia ou a maquete: `null` quando não há escolha (sem WebGL, ou `?render=list`) */
  render: { mode: 'list' | 'world'; onToggle: () => void } | null;
  /** os outros botões de ícone à direita ("Tela acesa") */
  children?: ReactNode;
};

const icon =
  'grid size-12 shrink-0 place-items-center rounded-full text-ink-2 disabled:opacity-30 aria-pressed:bg-accent-soft aria-pressed:text-accent-ink';

export function DayBar<T extends DayLike>({
  tripName,
  bar,
  onPrev,
  onNext,
  onToday,
  render,
  children,
}: Props<T>) {
  return (
    <header className="shrink-0 bg-paper pt-[env(safe-area-inset-top,0px)] safe-x" data-day-bar>
      <div className="flex h-12 items-center justify-between gap-2">
        <Link
          to="/viagens"
          className="flex min-h-12 min-w-0 flex-1 items-center mv-text-15 font-semibold text-ink-2"
        >
          <span className="truncate">{tripName}</span>
        </Link>
        <div className="flex shrink-0 items-center">
          {children}
          {render ? (
            <button
              type="button"
              className={icon}
              aria-pressed={render.mode === 'list'}
              aria-label={render.mode === 'list' ? 'Ver a maquete' : 'Ver como lista'}
              onClick={render.onToggle}
              data-render-toggle={render.mode}
            >
              {render.mode === 'list' ? (
                <Box className="size-6" aria-hidden="true" />
              ) : (
                <List className="size-6" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </div>
      <div className="flex h-12 items-center gap-1">
        <button
          type="button"
          aria-label="Dia anterior"
          disabled={!bar.canPrev}
          onClick={onPrev}
          className={icon}
        >
          <ChevronLeft className="size-6" aria-hidden="true" />
        </button>
        <h1 className="flex min-w-0 flex-1 items-center justify-center gap-2 font-num mv-text-20 leading-none font-semibold">
          <span className="truncate" data-day-label>
            {bar.label}
          </span>
          {bar.showToday ? (
            <button
              type="button"
              onClick={onToday}
              className="inline-flex min-h-12 shrink-0 items-center rounded-full bg-accent-soft px-3 font-ui mv-text-14 font-semibold text-accent-ink"
            >
              Hoje
            </button>
          ) : null}
        </h1>
        <button
          type="button"
          aria-label="Dia seguinte"
          disabled={!bar.canNext}
          onClick={onNext}
          className={icon}
        >
          <ChevronRight className="size-6" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
