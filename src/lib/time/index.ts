import { addMinutes, format, parse, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Tudo em hora de parede local (America/Sao_Paulo no uso real): o dia guarda `date`, a parada
 * guarda `time` sem fuso, e as contas são feitas com `date-fns` sobre `date + time`. Nunca `Date`
 * em UTC para decidir horário de saída.
 */

/** 'HH:mm' a partir de 'HH:mm', 'HH:mm:ss' ou 'HH:mm:ss.SSS' (como o banco devolve `time`). */
export function hhmm(time: string): string {
  return time.slice(0, 5);
}

/** `date` 'yyyy-MM-dd' mais `time` como um instante local. */
export function wallTime(date: string, time: string): Date {
  return parse(`${date} ${hhmm(time)}`, 'yyyy-MM-dd HH:mm', new Date());
}

/** Hora de sair: o horário da próxima parada menos o deslocamento até ela. */
export function leaveAt(date: string, nextTime: string, travelMinutes: number): Date {
  return addMinutes(wallTime(date, nextTime), -travelMinutes);
}

export type CountdownState = 'ok' | 'tight' | 'late';
/** Abaixo disto o anel fica âmbar. */
export const TIGHT_MINUTES = 15;

/** Minutos inteiros até o alvo (negativos quando já passou) e o estado do anel. */
export function countdownState(
  target: Date,
  now: Date,
): { minutes: number; state: CountdownState } {
  const minutes = Math.floor((target.getTime() - now.getTime()) / 60_000);
  return { minutes, state: minutes < 0 ? 'late' : minutes < TIGHT_MINUTES ? 'tight' : 'ok' };
}

/** O dia atual da viagem: hoje; senão o próximo; senão o último. `null` sem dias. */
export function currentDay<T extends { date: string }>(
  days: readonly T[],
  today: string,
): T | null {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  return (
    sorted.find((d) => d.date === today) ??
    sorted.find((d) => d.date > today) ??
    sorted.at(-1) ??
    null
  );
}

/** Noite para o tema automático do Modo Viagem: das 18:30 às 6:00. Regra simples por hora nesta fase. */
export function isNight(now: Date): boolean {
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= 18.5 || h < 6;
}

export function formatClock(d: Date): string {
  return format(d, 'HH:mm');
}

// formatDuration vive em _shared/format.ts: o texto dos avisos (servidor) e o "Agora" usam a mesma função
export { formatDuration } from '@shared/format.ts';

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

/** "sex 11/12" (a abreviação do date-fns em pt-BR varia entre versões; aqui é fixa) */
export function formatDayShort(date: string): string {
  const d = parseISO(date);
  return `${WEEKDAYS_SHORT[d.getDay()] ?? ''} ${format(d, 'dd/MM')}`;
}

/** "sexta-feira, 11 de dezembro" */
export function formatDayLong(date: string): string {
  return format(parseISO(date), "EEEE, d 'de' MMMM", { locale: ptBR });
}

/** "11/12" */
export function formatDayNumeric(date: string): string {
  return format(parseISO(date), 'dd/MM');
}

/** Hora de um carimbo ISO, em hora local: "14:02". */
export function formatStamp(iso: string): string {
  return format(new Date(iso), 'HH:mm');
}
