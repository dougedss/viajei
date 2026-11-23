// caminhos relativos: a bateria do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import {
  DAY_TIME_WINDOWS,
  minutesText,
  SPAN_MINUTES,
} from '../../../supabase/functions/_shared/day-span.ts';
import type { LngLat } from '../../../supabase/functions/_shared/geo.ts';
import { openStatusAt } from '../../../supabase/functions/_shared/google-places.ts';
import type { OpeningPeriod } from '../../../supabase/functions/_shared/places-schema.ts';
import type { DayTime } from '../../../supabase/functions/_shared/plan-search-protocol.ts';
import { DWELL_MINUTES } from './assemble.ts';
import { weekdayOf } from './hours.ts';
import { readReach, type ReachAnswer } from './reach.ts';

/**
 * O tempo é o do passeio todo (fase 26, a 3.3; a decisão 3 do Douglas de 20/11): a estrada (de casa
 * ao passo 1, entre os passos na ordem, do último a casa), mais o tempo nos lugares, mais o que o
 * horário do lugar impõe (chegar antes de abrir espera até abrir; chegar depois de fechar não cabe).
 * Puro. Desde a correção de 22/11/2026 (o teste "buscar sushi em Canoinhas"):
 *
 * - **a estrada é a medida** (D310): o tempo de carro de cada trecho vem de quem chama (a tabela do
 *   Google); com um trecho ainda sem medida, **não há conta** (`null`), nunca uma estimativa;
 * - **a hora dita manda** (D311): "quero estar no sushi às 18:00" fixa a chegada, e a hora de sair é
 *   calculada para trás; chegar antes de uma hora dita é esperar por ela, chegar depois é o aviso;
 * - **o tempo em cada lugar é o de cada parada** (D312): o que a pessoa disse ("buscar" são 15 min), o
 *   que ela mudou na tela, ou o padrão do tipo, que a tela mostra.
 *
 * O total fica à vista desde o passo 1, cada candidato diz o total se for escolhido, e o que estoura o
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
  /** os minutos no lugar; sem isto, o padrão do tipo (`DWELL_MINUTES`) */
  dwell?: number;
  /** a hora dita para estar neste lugar ("18:00"): a conta parte dela */
  atTime?: string | null;
};

export type OutingInput = {
  /** de onde se sai e para onde se volta; null quando não se sabe (a conta fica sem a volta) */
  home: LngLat | null;
  stops: readonly OutingStop[];
  /** a hora de sair, "HH:MM", quando nenhuma hora dita a define (ou a que a pessoa disse, ou o "agora") */
  start: string;
  /**
   * o que a hora de sair é: `default`, a hora dita de um lugar a recalcula para trás; `said`, a pessoa
   * disse a hora de sair, e ela fica; `earliest` (a saída de hoje), é o mais cedo que dá: a hora dita
   * de um lugar pode atrasar a saída, nunca adiantar
   */
  startRule?: 'default' | 'said' | 'earliest';
  /**
   * o dia do passeio, "AAAA-MM-DD" (o dia da semana dos horários); **null quando ainda não se sabe**
   * (uma viagem: o dia sai da escrita): aí o horário dos lugares não entra na conta (D307: a rodada da
   * fase 26 esperou 6 h 40 um café abrir numa segunda que a pessoa não pediu, para um "domingo")
   */
  date: string | null;
  /**
   * o tempo de carro **medido** entre dois pontos, em minutos (a tabela do Google); null quando o
   * trecho ainda não foi medido ou não tem estrada: a conta não fecha
   */
  drive: (from: LngLat, to: LngLat) => number | null;
};

export type Arrival = {
  name: string;
  /** a hora prevista de chegar, "HH:MM" */
  at: string;
  /** esperou o lugar abrir (minutos) */
  waited: number;
  /** chegou antes da hora dita e esperou por ela (minutos) */
  early: number;
  /** o lugar está fechado na hora prevista e não abre mais nesse dia */
  closed: boolean;
  /** a chegada cai fora da hora do dia dita ("Chega às 13:25, e vocês queriam de manhã") */
  outsideWindow: string | null;
  /** a chegada passa da hora dita ("Chega às 18:20, e vocês queriam às 18:00") */
  late: string | null;
};

export type OutingAccount = {
  road: number;
  dwell: number;
  wait: number;
  total: number;
  arrivals: Arrival[];
  /** a hora prevista de chegar em casa; null sem casa */
  back: string | null;
  /** a hora de sair que a conta usou */
  start: string;
  /** a hora dita que definiu a hora de sair ("para estar em X às 18:00"); null quando não houve */
  anchor: { name: string; at: string } | null;
};

const toMin = (hhmm: string) => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};
const toHhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const dwellOf = (stop: Pick<OutingStop, 'kind' | 'dwell'>) =>
  stop.dwell ?? DWELL_MINUTES[stop.kind];

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

/**
 * A hora dita, em minutos, no dia em que o relógio da conta está: uma hora que ficou mais de 12 h
 * para trás do relógio é a do dia seguinte (o passeio que vira a noite).
 */
function saidAt(atTime: string, clock: number): number {
  let target = toMin(atTime) + Math.floor(clock / 1440) * 1440;
  if (target + 720 < clock) target += 1440;
  return target;
}

/**
 * A conta do passeio todo: a estrada medida, o tempo nos lugares, a espera pelo horário e pela hora
 * dita, e a hora de cada chegada. **Null quando falta medir algum trecho**: a tela diz que está
 * medindo (ou que não deu), e não mostra um total de chute.
 */
export function outingAccount(input: OutingInput): OutingAccount | null {
  // a estrada, trecho a trecho: de casa ao primeiro lugar, entre os lugares, do último a casa
  const legs: number[] = [];
  let from: LngLat | null = input.home;
  for (const stop of input.stops) {
    if (stop.at && from) {
      const leg = input.drive(from, stop.at);
      if (leg === null) return null;
      legs.push(leg);
    } else legs.push(0);
    if (stop.at) from = stop.at;
  }
  let homeLeg = 0;
  if (input.home && from && from !== input.home) {
    const leg = input.drive(from, input.home);
    if (leg === null) return null;
    homeLeg = leg;
  }

  // a hora de sair: a primeira hora dita fixa a chegada nela, e a saída é calculada para trás
  const rule = input.startRule ?? 'default';
  let start = toMin(input.start);
  let anchor: OutingAccount['anchor'] = null;
  if (rule !== 'said') {
    let offset = 0;
    for (const [i, stop] of input.stops.entries()) {
      offset += legs[i] ?? 0;
      if (stop.atTime) {
        const wanted = toMin(stop.atTime) - offset;
        // na saída de hoje não se sai antes de agora: a hora dita só atrasa a saída
        if (rule === 'default' || wanted >= start) {
          start = wanted;
          anchor = { name: stop.name, at: stop.atTime };
        }
        break;
      }
      offset += dwellOf(stop);
    }
  }

  const day = input.date === null ? null : weekdayOf(input.date);
  let clock = start;
  let road = 0;
  let dwell = 0;
  let wait = 0;
  const arrivals: Arrival[] = [];
  for (const [i, stop] of input.stops.entries()) {
    const leg = legs[i] ?? 0;
    road += leg;
    clock += leg;
    const arrival = toHhmm(clock);
    let early = 0;
    let late: string | null = null;
    if (stop.atTime) {
      const target = saidAt(stop.atTime, clock);
      if (clock < target) {
        early = target - clock;
        wait += early;
        clock = target;
      } else if (clock > target) {
        late = `Chega às ${arrival}, e vocês queriam às ${stop.atTime}`;
      }
    }
    let waited = 0;
    let closed = false;
    if (day !== null && stop.hours && stop.hours.length > 0) {
      const status = openStatusAt(stop.hours, day, toHhmm(clock));
      if (status === 'closed') {
        const at = ((clock % 1440) + 1440) % 1440;
        const opens = nextOpening(stop.hours, day, at);
        if (opens === null) closed = true;
        else {
          waited = opens - at;
          wait += waited;
          clock += waited;
        }
      }
    }
    arrivals.push({
      name: stop.name,
      at: arrival,
      waited,
      early,
      closed,
      // com a hora exata dita, a janela da parte do dia não diz mais nada
      outsideWindow: stop.atTime ? null : windowNotice(stop.dayTime, arrival),
      late,
    });
    const stay = dwellOf(stop);
    dwell += stay;
    clock += stay;
  }
  let back: string | null = null;
  if (input.home && from) {
    road += homeLeg;
    clock += homeLeg;
    back = toHhmm(clock);
  }
  return {
    road,
    dwell,
    wait,
    total: road + dwell + wait,
    arrivals,
    back,
    start: toHhmm(start),
    anchor,
  };
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

/** "O passeio dá cerca de 1 h 05: 50 min de estrada e 15 min nos lugares" (mais a espera, quando há). */
export function totalText(acc: Pick<OutingAccount, 'total' | 'road' | 'dwell' | 'wait'>): string {
  const parts = [`${minutesText(acc.road)} de estrada`, `${minutesText(acc.dwell)} nos lugares`];
  if (acc.wait > 0) parts.push(`${minutesText(acc.wait)} de espera`);
  const list =
    parts.length > 2
      ? `${parts.slice(0, -1).join(', ')} e ${parts.at(-1) ?? ''}`
      : parts.join(' e ');
  return `O passeio dá cerca de ${minutesText(acc.total)}: ${list}`;
}

/**
 * "Saída às 17:35, para estar em Sushi Yume às 18:00": a hora de sair que a conta usou e, quando foi
 * uma hora dita que a definiu, qual. A tela mostra a leitura que o app fez, para a pessoa conferir.
 */
export function startText(acc: Pick<OutingAccount, 'start' | 'anchor'>): string {
  return acc.anchor
    ? `Saída às ${acc.start}, para estar em ${acc.anchor.name} às ${acc.anchor.at}`
    : `Saída às ${acc.start}`;
}

export { minutesText };
