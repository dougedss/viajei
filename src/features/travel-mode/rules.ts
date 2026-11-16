import { isDepartureKind } from '@shared/constants.ts';
import { activeStops, isAutoStop } from '@/features/itinerary/rules.ts';
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
  /** o papel da próxima no dia: a chegada em casa pede Chegamos! (fase 24) */
  nextRole: NodeRole | null;
  /** a chegada em casa do dia, quando há (o último nó, uma origem que não é o primeiro) */
  arrival: Stop | null;
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
  /** nenhuma por fazer: com a chegada em casa no fim, só ela conclui o dia */
  finished: boolean;
};

/**
 * Origem e deslocamento são nós da estrada: sem "Como foi?", sem pílula no filme, sem pontos de
 * chegada. Pelo tipo só, eles são nós de saída ("Partiu!" é a ação deles); a exceção é a chegada em
 * casa (`isArrivalNode`), que só o dia inteiro diz qual é. Quem decide a ação lê `nodeRole`.
 */
export function isDepartureNode(stop: Pick<Stop, 'kind'>): boolean {
  return isDepartureKind(stop.kind);
}

/**
 * A chegada em casa (fase 24, a exceção da D29): **o último nó do dia, quando é uma origem e não é o
 * primeiro**. É assim que a conversa, a importação e o pedido para outras IAs a escrevem ("Chegada em
 * Papanduva", `kind: origin`), e as viagens que já existem passam a ler certo sem mudar nada do que
 * foi gravado. As paradas que se registraram sozinhas não contam para achar o último: parar 20 min em
 * casa depois de chegar não transforma a chegada em saída.
 */
export function isArrivalNode(stop: Pick<Stop, 'id' | 'kind'>, dayStops: readonly Stop[]): boolean {
  if (stop.kind !== 'origin') return false;
  const planned = activeStops(dayStops).filter((s) => !isAutoStop(s));
  return planned.length > 1 && planned.at(-1)?.id === stop.id;
}

/**
 * O papel do nó no dia: a saída e o deslocamento pedem Partiu!; a chegada em casa e as paradas pedem
 * Chegamos!. A chegada tem "chega às", é alvo da presença de 3 min como qualquer parada, e só ela
 * conclui o dia.
 */
export type NodeRole = 'departure' | 'arrival' | 'stop';
export function nodeRole(stop: Pick<Stop, 'id' | 'kind'>, dayStops: readonly Stop[]): NodeRole {
  if (isArrivalNode(stop, dayStops)) return 'arrival';
  return isDepartureNode(stop) ? 'departure' : 'stop';
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

  // a chegada em casa é um nó de chegada (fase 24): "chega às" e Chegamos!, nunca Partiu!
  const role = next ? nodeRole(next, ordered) : null;
  const leaves = role === 'departure';

  let countdown: Countdown | null = null;
  if (next) {
    if (onRoad && arriveAt) countdown = build(arriveAt, 'chega às', now);
    else if (leave) countdown = build(leave, 'sair às', now);
    else if (arriveAt) {
      const label = leaves ? 'sair às' : role === 'arrival' ? 'chega às' : 'próxima às';
      countdown = build(arriveAt, label, now);
    }
  }

  let primary: PrimaryAction = 'none';
  let departAvailable = false;
  let arriveAvailable = false;
  if (next) {
    if (at === null) {
      // início do dia: num nó de saída, Partiu!; numa parada comum, só Chegamos!
      if (leaves) {
        primary = 'depart';
        departAvailable = true;
      } else {
        primary = 'arrive';
        arriveAvailable = true;
      }
    } else if (!onRoad) {
      primary = 'depart';
      departAvailable = true;
      arriveAvailable = !leaves;
    } else {
      primary = leaves ? 'depart' : 'arrive';
      departAvailable = leaves;
      arriveAvailable = !leaves;
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
    nextRole: role,
    arrival: ordered.find((s) => isArrivalNode(s, ordered)) ?? null,
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
