import { Check, Flag, SkipForward, Ticket, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button.tsx';
import type { Reservation } from '@/lib/db/schema.ts';
import { cx } from '@/lib/cx.ts';
import { formatClock, formatDuration } from '@/lib/time/index.ts';
import type { DayState } from '../rules.ts';

/**
 * O "Agora" compacto, sobre a maquete, embaixo (fase 14): a frase ("A caminho de · Parque · chega
 * às 10:00 · 12 min"), a ação principal grande (Partiu! ou Chegamos!, por `state.primary`) e, só
 * quando existem, os chips de contexto: "Ver reserva", a outra marcação quando as duas cabem e
 * "Pular parada". Legível em cinco segundos; nada aqui é fixo além da frase e da ação.
 */
type Props = {
  state: DayState;
  busy: boolean;
  onDepart: () => void;
  onArrive: () => void;
  onSkip: () => void;
  /** as reservas da parada atual e da próxima (e a hospedagem em curso) */
  reservations: readonly Reservation[];
  onOpenReservation: (r: Reservation) => void;
  /** uma linha discreta abaixo da frase: a posição, o GPS, a posição negada */
  line?: ReactNode;
};

const TEXT_COLOR = {
  ok: 'text-on-time-ink',
  tight: 'text-tight-ink',
  late: 'text-late-ink',
} as const;

const chip =
  'inline-flex min-h-12 items-center gap-1.5 rounded-full bg-paper px-3 mv-text-14 font-semibold text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]';

export function NowBar(props: Props) {
  const { state, busy, onDepart, onArrive, onSkip, reservations, onOpenReservation, line } = props;
  const { next, countdown, closingSoon } = state;
  const primary = state.primary;
  // a outra marcação possível, como chip: parado numa parada, Partiu! é a principal e Chegamos! na
  // seguinte ainda cabe (chegaram sem marcar a saída)
  const secondary =
    primary === 'depart' && state.arriveAvailable
      ? 'arrive'
      : primary === 'arrive' && state.departAvailable
        ? 'depart'
        : null;
  const chips: ReactNode[] = [];
  for (const r of reservations) {
    chips.push(
      <button
        key={r.id}
        type="button"
        className={chip}
        onClick={() => onOpenReservation(r)}
        aria-label={`Ver reserva: ${r.name}`}
      >
        <Ticket className="size-4" aria-hidden="true" />
        Ver reserva
      </button>,
    );
  }
  if (secondary === 'arrive') {
    chips.push(
      <button key="arrive" type="button" className={chip} disabled={busy} onClick={onArrive}>
        <Check className="size-4" aria-hidden="true" />
        Chegamos!
      </button>,
    );
  }
  if (secondary === 'depart') {
    chips.push(
      <button key="depart" type="button" className={chip} disabled={busy} onClick={onDepart}>
        <Flag className="size-4" aria-hidden="true" />
        Partiu!
      </button>,
    );
  }
  if (state.skipAvailable) {
    chips.push(
      <button
        key="skip"
        type="button"
        className={cx(chip, 'text-ink-2')}
        disabled={busy}
        onClick={onSkip}
      >
        <SkipForward className="size-4" aria-hidden="true" />
        Pular parada
      </button>,
    );
  }

  const stateKey = countdown?.state ?? 'ok';
  const minutes = countdown
    ? countdown.minutes < 0
      ? `${formatDuration(-countdown.minutes)} de atraso`
      : formatDuration(countdown.minutes)
    : null;

  return (
    <section
      aria-labelledby="h-agora"
      className="pointer-events-auto grid gap-2 rounded-card bg-card/95 p-3 shadow-card backdrop-blur-sm"
      data-now-bar
    >
      <h2 id="h-agora" className="sr-only">
        Agora
      </h2>
      {chips.length > 0 ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          {state.finished ? (
            <>
              <p className="font-num mv-text-22 leading-tight font-semibold">Dia concluído</p>
              <p className="mv-text-14 text-ink-2">Todas as paradas de hoje foram marcadas.</p>
            </>
          ) : !next ? (
            <p className="mv-text-16 text-ink-2">Este dia ainda não tem paradas.</p>
          ) : (
            <>
              <p className="label-caps text-ink-2">{state.onRoad ? 'A caminho de' : 'Próxima'}</p>
              <p className="truncate font-num mv-text-22 leading-tight font-semibold">
                {next.name}
              </p>
              {countdown ? (
                <p className={cx('mv-text-15 font-semibold', TEXT_COLOR[stateKey])}>
                  {countdown.label} <span className="num">{formatClock(countdown.target)}</span>
                  {minutes ? <span className="font-normal text-ink-2"> · {minutes}</span> : null}
                </p>
              ) : (
                <p className="mv-text-15 text-ink-2">Sem horário definido</p>
              )}
            </>
          )}
          {closingSoon ? (
            <p
              role="status"
              className="mt-0.5 flex items-center gap-1.5 mv-text-13 font-semibold text-tight-ink"
            >
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {closingSoon.minutes < 0
                ? `${closingSoon.stop.name} fechou às ${formatClock(closingSoon.closesAt)}`
                : `fecha às ${formatClock(closingSoon.closesAt)} · faltam ${formatDuration(closingSoon.minutes)}`}
            </p>
          ) : null}
          {line}
        </div>
        {primary === 'depart' ? (
          <Button className="min-h-14 shrink-0" loading={busy} onClick={onDepart}>
            <Flag className="size-6" aria-hidden="true" />
            Partiu!
          </Button>
        ) : primary === 'arrive' ? (
          <Button className="min-h-14 shrink-0" loading={busy} onClick={onArrive}>
            <Check className="size-6" aria-hidden="true" />
            Chegamos!
          </Button>
        ) : null}
      </div>
    </section>
  );
}
