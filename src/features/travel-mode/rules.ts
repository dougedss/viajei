import { isDepartureKind } from '@shared/constants.ts';
import { activeStops } from '@/features/itinerary/rules.ts';
import type { Stop, TripDay } from '@/lib/db/schema.ts';
import { countdownState, leaveAt, wallTime, type CountdownState } from '@/lib/time/index.ts';

/**
 * A semântica do "Agora", pura: o carro fica no último nó concluído, o halo pulsa no próximo,
 * Partiu! põe o carro na estrada, Chegamos! conclui. A fase 5 desenha a maquete por cima deste
 * mesmo estado; a lista acessível desta fase é o fallback permanente.
 */
export type StopStatus = 'done' | 'skipped' | 'next' | 'pending';
export type PrimaryAction = 'depart' | 'arrive' | 'none';
export type CountdownLabel = 'sair às' | 'próxima às' | 'chega às';

export type Countdown = {
  target: Date;
  label: CountdownLabel;
  minutes: number;
  state: CountdownState;
};

export type ClosingSoon = { stop: Stop; closesAt: Date; minutes: number };

export type DayState = {
  stops: Stop[];
  /** último nó concluído: onde o carro está; null no início do dia */
  at: Stop | null;
  /** o carro saiu de `at` e está na estrada */
  onRoad: boolean;
  /** primeira parada não concluída nem pulada */
  next: Stop | null;
  /** hora de sair de `at` para chegar em `next` no horário */
  leaveAt: Date | null;
  /** horário previsto de `next` */
  arriveAt: Date | null;
  countdown: Countdown | null;
  primary: PrimaryAction;
  departAvailable: boolean;
  arriveAvailable: boolean;
  skipAvailable: boolean;
  closingSoon: ClosingSoon | null;
  finished: boolean;
};

/** Origem e deslocamento são nós de saída: "Partiu!" é a ação deles, nunca "Chegamos!". */
export function isDepartureNode(stop: Pick<Stop, 'kind'>): boolean {
  return isDepartureKind(stop.kind);
}

export const CLOSING_SOON_MINUTES = 60;

export function statusOf(stop: Stop, state: Pick<DayState, 'next'>): StopStatus {
  if (stop.done_at !== null) return 'done';
  if (stop.skipped) return 'skipped';
  if (state.next?.id === stop.id) return 'next';
  return 'pending';
}

export function dayState(day: Pick<TripDay, 'date'>, stops: readonly Stop[], now: Date): DayState {
  const ordered = activeStops(stops);
  const done = ordered.filter((s) => s.done_at !== null);
  const at = done.at(-1) ?? null;
  const onRoad = at !== null && at.departed_at !== null;
  const next = ordered.find((s) => s.done_at === null && !s.skipped) ?? null;
  const finished = ordered.length > 0 && next === null;

  const arriveAt = next?.time ? wallTime(day.date, next.time) : null;
  const leave =
    at !== null && !onRoad && next?.time && at.travel_minutes_to_next !== null
      ? leaveAt(day.date, next.time, at.travel_minutes_to_next)
      : null;

  let countdown: Countdown | null = null;
  if (next) {
    if (onRoad && arriveAt) countdown = build(arriveAt, 'chega às', now);
    else if (leave) countdown = build(leave, 'sair às', now);
    else if (arriveAt) {
      countdown = build(arriveAt, isDepartureNode(next) ? 'sair às' : 'próxima às', now);
    }
  }

  let primary: PrimaryAction = 'none';
  let departAvailable = false;
  let arriveAvailable = false;
  if (next) {
    if (at === null) {
      // início do dia: num nó de saída, Partiu!; numa parada comum, só Chegamos!
      if (isDepartureNode(next)) {
        primary = 'depart';
        departAvailable = true;
      } else {
        primary = 'arrive';
        arriveAvailable = true;
      }
    } else if (!onRoad) {
      primary = 'depart';
      departAvailable = true;
      arriveAvailable = !isDepartureNode(next);
    } else {
      primary = isDepartureNode(next) ? 'depart' : 'arrive';
      departAvailable = isDepartureNode(next);
      arriveAvailable = !isDepartureNode(next);
    }
  }

  const here = onRoad ? next : (at ?? next);
  let closingSoon: ClosingSoon | null = null;
  if (here?.closes_at) {
    const closesAt = wallTime(day.date, here.closes_at);
    const minutes = countdownState(closesAt, now).minutes;
    if (minutes <= CLOSING_SOON_MINUTES) closingSoon = { stop: here, closesAt, minutes };
  }

  return {
    stops: ordered,
    at,
    onRoad,
    next,
    leaveAt: leave,
    arriveAt,
    countdown,
    primary,
    departAvailable,
    arriveAvailable,
    skipAvailable: next !== null,
    closingSoon,
    finished,
  };
}

function build(target: Date, label: CountdownLabel, now: Date): Countdown {
  return { target, label, ...countdownState(target, now) };
}

/** Quantas concluídas (puladas não contam) e o total. */
export function progress(stops: readonly Stop[]): { done: number; total: number } {
  const ordered = activeStops(stops);
  return { done: ordered.filter((s) => s.done_at !== null).length, total: ordered.length };
}
