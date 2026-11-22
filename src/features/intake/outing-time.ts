// caminhos relativos: a bateria do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import {
  DAY_TIME_WINDOWS,
  minutesText,
  SPAN_MINUTES,
} from '../../../supabase/functions/_shared/day-span.ts';
import { driveMinutes } from '../../../supabase/functions/_shared/drive.ts';
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import { openStatusAt } from '../../../supabase/functions/_shared/google-places.ts';
import type { OpeningPeriod } from '../../../supabase/functions/_shared/places-schema.ts';
import type { DayTime } from '../../../supabase/functions/_shared/plan-search-protocol.ts';
import { DWELL_MINUTES } from './assemble.ts';
import { weekdayOf } from './hours.ts';
import { readReach, type ReachAnswer } from './reach.ts';

/**
 * O tempo é o do passeio todo (fase 26, a 3.3; a decisão 3 do Douglas de 20/11): a estrada (de casa
 * ao passo 1, entre os passos na ordem, do último a casa), mais o tempo nos lugares (a permanência
 * por tipo, D232), mais o que o horário do lugar impõe (chegar antes de abrir espera até abrir;
 * chegar depois de fechar não cabe). Puro: a estimativa de `driveMinutes` até existir a rota real; o
 * total fica à vista desde o passo 1, cada candidato diz o total se for escolhido, e o que estoura o
 * tempo aparece marcado, nunca escondido.
 */
export type OutingStop = {
  name: string;
  kind: StopKind;
  /** null para o que ainda não tem lugar (o pendente): não entra na estrada nem no horário */
  at: LngLat | null;
  hours?: readonly OpeningPeriod[] | null;
  /** a hora do dia dita para este passo ("de manhã"): a janela em que ele tem de cair */
  dayTime?: DayTime;
};

export type OutingInput = {
  /** de onde se sai e para onde se volta; null quando não se sabe (a conta fica sem a volta) */
  home: LngLat | null;
  stops: readonly OutingStop[];
  /** a hora de sair, "HH:MM" */
  start: string;
  /**
   * o dia do passeio, "AAAA-MM-DD" (o dia da semana dos horários); **null quando ainda não se sabe**
   * (uma viagem: o dia sai da escrita): aí o horário dos lugares não entra na conta (D307: a rodada da
   * fase 26 esperou 6 h 40 um café abrir numa segunda que a pessoa não pediu, para um "domingo")
   */
  date: string | null;
};

export type Arrival = {
  name: string;
  /** a hora prevista de chegar, "HH:MM" */
  at: string;
  /** esperou o lugar abrir (minutos) */
  waited: number;
  /** o lugar está fechado na hora prevista e não abre mais nesse dia */
  closed: boolean;
  /** a chegada cai fora da hora do dia dita ("Chega às 13:25, e vocês queriam de manhã") */
  outsideWindow: string | null;
};

export type OutingAccount = {
  road: number;
  dwell: number;
  wait: number;
  total: number;
  arrivals: Arrival[];
  /** a hora prevista de chegar em casa; null sem casa */
  back: string | null;
};

const toMin = (hhmm: string) => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};
const toHhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const legMinutes = (a: LngLat, b: LngLat) => driveMinutes(haversineM(a, b) / 1000);

/** A próxima abertura do lugar no dia, depois de `at` (minutos do dia); null quando não abre mais. */
function nextOpening(hours: readonly OpeningPeriod[], day: number, at: number): number | null {
  const opens = hours
    .filter((p) => p.day === day && toMin(p.open) > at)
    .map((p) => toMin(p.open))
    .sort((a, b) => a - b);
  return opens[0] ?? null;
}

/** "Chega às 13:25, e vocês queriam de manhã": a chegada fora da janela da hora do dia dita. */
export function windowNotice(dayTime: DayTime | undefined, at: string): string | null {
  if (!dayTime) return null;
  const w = DAY_TIME_WINDOWS[dayTime];
  const m = toMin(at);
  if (m >= w.from && m < w.to) return null;
  return `Chega às ${at}, e vocês queriam ${w.label}`;
}

/** A conta do passeio todo: a estrada, a permanência, a espera pelo horário, e a hora de cada chegada. */
export function outingAccount(input: OutingInput): OutingAccount {
  const day = input.date === null ? null : weekdayOf(input.date);
  let clock = toMin(input.start);
  let road = 0;
  let dwell = 0;
  let wait = 0;
  let at: LngLat | null = input.home;
  const arrivals: Arrival[] = [];
  for (const stop of input.stops) {
    if (stop.at && at) {
      const leg = legMinutes(at, stop.at);
      road += leg;
      clock += leg;
    }
    if (stop.at) at = stop.at;
    const arrival = toHhmm(clock);
    let waited = 0;
    let closed = false;
    if (day !== null && stop.hours && stop.hours.length > 0) {
      const status = openStatusAt(stop.hours, day, arrival);
      if (status === 'closed') {
        const opens = nextOpening(stop.hours, day, clock % 1440);
        if (opens === null) closed = true;
        else {
          waited = opens - (clock % 1440);
          wait += waited;
          clock += waited;
        }
      }
    }
    arrivals.push({
      name: stop.name,
      at: arrival,
      waited,
      closed,
      outsideWindow: windowNotice(stop.dayTime, arrival),
    });
    dwell += DWELL_MINUTES[stop.kind];
    clock += DWELL_MINUTES[stop.kind];
  }
  let back: string | null = null;
  if (input.home && at) {
    const leg = at === input.home ? 0 : legMinutes(at, input.home);
    road += leg;
    clock += leg;
    back = toHhmm(clock);
  }
  return { road, dwell, wait, total: road + dwell + wait, arrivals, back };
}

/**
 * A hora de sair da conta das opções, antes da escrita (fase 26, D307): a do começo da janela da hora do
 * dia dita para o primeiro passo ("almoçar" sai às 11:30; "à tarde" ao meio-dia; "à noite" às 18:00),
 * para a conta não avisar "chega às 08:55, e vocês queriam no almoço" só porque supôs 08:00; sem hora
 * do dia (ou de manhã), as 08:00 da montagem.
 */
export function startFor(firstDayTime: DayTime | undefined, fallback = '08:00'): string {
  if (!firstDayTime || firstDayTime === 'manha') return fallback;
  const from = DAY_TIME_WINDOWS[firstDayTime].from;
  return `${String(Math.floor(from / 60)).padStart(2, '0')}:${String(from % 60).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ o tempo que a pessoa tem
/** Os minutos de uma resposta lida (`readReach`): as horas como ditas; a parte do dia pela tabela. */
export function minutesOfReach(read: ReachAnswer | null): number | null {
  if (!read) return null;
  if (read.hours) return Math.round(read.hours * 60);
  return read.span ? SPAN_MINUTES[read.span] : null;
}

/**
 * O tempo que a pessoa tem, em minutos: a resposta à pergunta do tempo (a do app ou a da IA, ou a que
 * ela mudou na tela) vale acima do que a IA leu do pedido (`tempo_min`). Null quando ninguém disse:
 * a conta aparece sem a comparação.
 */
export function timeBudget(input: {
  answer: string | null | undefined;
  tempo_min: number | null | undefined;
}): { minutes: number | null; label: string } | null {
  const answer = input.answer?.trim() ?? '';
  if (answer !== '') {
    const read = readReach(answer);
    if (read) {
      const minutes = minutesOfReach(read);
      return { minutes, label: minutes === null ? 'até amanhã' : answer };
    }
  }
  if (input.tempo_min && input.tempo_min > 0) {
    return { minutes: input.tempo_min, label: minutesText(input.tempo_min) };
  }
  return null;
}

/** O que estoura: o total maior que o tempo que têm (sem teto, nada estoura). */
export function overBudget(total: number, budget: number | null): boolean {
  return budget !== null && total > budget;
}

/** "O passeio dá cerca de 4 h 10: 2 h 40 de estrada e 1 h 30 nos lugares" (mais a espera, quando há). */
export function totalText(acc: Pick<OutingAccount, 'total' | 'road' | 'dwell' | 'wait'>): string {
  const parts = [`${minutesText(acc.road)} de estrada`, `${minutesText(acc.dwell)} nos lugares`];
  if (acc.wait > 0) parts.push(`${minutesText(acc.wait)} esperando abrir`);
  return `O passeio dá cerca de ${minutesText(acc.total)}: ${parts.join(' e ')}`;
}

export { minutesText };
