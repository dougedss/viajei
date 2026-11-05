import { Check, Flag, SkipForward, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button.tsx';
import { Ring } from '@/components/ui/Ring.tsx';
import { formatClock, formatDuration } from '@/lib/time/index.ts';
import type { DayState } from '../rules.ts';

type Props = {
  state: DayState;
  busy: boolean;
  onDepart: () => void;
  onArrive: () => void;
  onSkip: () => void;
};

const RING_COLOR = {
  ok: 'var(--color-on-time)',
  tight: 'var(--color-tight)',
  late: 'var(--color-late)',
} as const;
const TEXT_COLOR = {
  ok: 'text-on-time-ink',
  tight: 'text-tight-ink',
  late: 'text-late-ink',
} as const;

/** Legível em cinco segundos: próxima saída grande, "sair às", anel, Partiu!, Chegamos!, Pular. */
export function AgoraHeader({ state, busy, onDepart, onArrive, onSkip }: Props) {
  const { next, countdown, closingSoon } = state;

  if (state.finished) {
    return (
      <section
        aria-labelledby="h-agora"
        className="grid gap-3 rounded-card bg-card p-5 shadow-card"
      >
        <h2 id="h-agora" className="label-caps text-accent-ink">
          Agora
        </h2>
        <p className="font-num text-[30px] leading-tight font-semibold">Dia concluído</p>
        <p className="text-[17px] text-ink-2">
          Todas as paradas de hoje foram marcadas. Bom descanso.
        </p>
      </section>
    );
  }

  if (!next) {
    return (
      <section
        aria-labelledby="h-agora"
        className="grid gap-3 rounded-card bg-card p-5 shadow-card"
      >
        <h2 id="h-agora" className="label-caps text-accent-ink">
          Agora
        </h2>
        <p className="text-[17px] text-ink-2">Este dia ainda não tem paradas.</p>
      </section>
    );
  }

  const ringValue = countdown ? Math.max(0, Math.min(1, countdown.minutes / 60)) : 0;
  const travel = state.at?.travel_minutes_to_next ?? null;
  const stateKey = countdown?.state ?? 'ok';
  const minutesLabel = countdown
    ? countdown.minutes < 0
      ? `${formatDuration(-countdown.minutes)} atrasado`
      : formatDuration(countdown.minutes)
    : null;

  return (
    <section aria-labelledby="h-agora" className="grid gap-4 rounded-card bg-card p-5 shadow-card">
      <h2 id="h-agora" className="label-caps text-accent-ink">
        Agora
      </h2>

      <div className="flex items-center gap-4">
        <Ring
          value={countdown ? ringValue : 0}
          color={RING_COLOR[stateKey]}
          className="size-24 shrink-0"
          label={minutesLabel ? `Contagem: ${minutesLabel}` : 'Sem horário'}
        >
          {countdown ? (
            <span className={`num text-[26px] leading-none font-bold ${TEXT_COLOR[stateKey]}`}>
              {Math.abs(countdown.minutes) >= 100
                ? formatDuration(Math.abs(countdown.minutes))
                : Math.abs(countdown.minutes)}
              {Math.abs(countdown.minutes) < 100 ? (
                <span className="block text-[12px] font-semibold tracking-wide uppercase">
                  {countdown.minutes < 0 ? 'atraso' : 'min'}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-[14px] text-ink-2">sem hora</span>
          )}
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-ink-2">{state.onRoad ? 'A caminho de' : 'Próxima'}</p>
          <p className="font-num text-[28px] leading-tight font-semibold break-words">
            {next.name}
          </p>
          {countdown ? (
            <p className={`num text-[34px] leading-none font-bold ${TEXT_COLOR[stateKey]}`}>
              <span className="font-ui text-[17px] font-semibold text-ink-2">
                {countdown.label}{' '}
              </span>
              {formatClock(countdown.target)}
            </p>
          ) : (
            <p className="text-[17px] text-ink-2">Sem horário definido</p>
          )}
          {travel !== null && state.arriveAt ? (
            <p className="text-[17px] text-ink-2">
              {formatDuration(travel)} de estrada · chega {formatClock(state.arriveAt)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        {state.departAvailable ? (
          <Button
            variant={state.primary === 'depart' ? 'primary' : 'secondary'}
            className="min-h-14"
            loading={busy}
            onClick={onDepart}
          >
            <Flag className="size-6" aria-hidden="true" />
            Partiu!
          </Button>
        ) : null}
        {state.arriveAvailable ? (
          <Button
            variant={state.primary === 'arrive' ? 'primary' : 'secondary'}
            className="min-h-14"
            loading={busy}
            onClick={onArrive}
          >
            <Check className="size-6" aria-hidden="true" />
            Chegamos!
          </Button>
        ) : null}
        {state.skipAvailable ? (
          <Button variant="ghost" size="md" className="min-h-12" disabled={busy} onClick={onSkip}>
            <SkipForward className="size-5" aria-hidden="true" />
            Pular esta parada
          </Button>
        ) : null}
      </div>

      {closingSoon ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-field bg-tight/15 px-4 py-3 text-[17px] font-semibold text-tight-ink"
        >
          <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
          {closingSoon.minutes < 0
            ? `${closingSoon.stop.name} fechou às ${formatClock(closingSoon.closesAt)}`
            : `${closingSoon.stop.name} fecha às ${formatClock(closingSoon.closesAt)} · faltam ${formatDuration(closingSoon.minutes)}`}
        </p>
      ) : null}
    </section>
  );
}
