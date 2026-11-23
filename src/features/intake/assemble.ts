// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import {
  measuredMinutes,
  type DriveTable,
} from '../../../supabase/functions/_shared/drive-schema.ts';
import type { LngLat } from '../../../supabase/functions/_shared/geo.ts';
import type { ImportData, ImportStop } from '../../../supabase/functions/_shared/import-schema.ts';
import type { OpeningPeriod, Place } from '../../../supabase/functions/_shared/places-schema.ts';
import type { DayTime } from '../../../supabase/functions/_shared/plan-search-protocol.ts';
import type {
  PlanNamed,
  PlanPending,
  PlanPlace,
  PlanPlaces,
  PlanWrite,
} from '../../../supabase/functions/_shared/plan-protocol.ts';
import { mainCategory } from './places.ts';

/**
 * A viagem nasce do que foi escolhido (fase 24), pura: das escolhas da pessoa, dos lugares que ela
 * nomeou, das sugestões do caminho e do que a IA escreveu, o roteiro no formato da importação, que a
 * revisão da fase 10 e 17 entende. **A regra de ouro do Douglas em código**: "apenas pode colocar
 * algo direto na rota se a pessoa realmente falar no chat". Na viagem entram só a saída, a chegada em
 * casa, as escolhas, os nomeados confirmados e as sugestões, e a sugestão nasce **desligada**; a IA só
 * escreve sobre o que veio por referência, e o que ela devolver fora disso sai aqui (`reconcile`).
 * O que é fato (o lugar, a coordenada, o tempo de carro, o horário de funcionamento) vem do mapa e da
 * rota; o que é texto (o nome da viagem, a frase de cada lugar, as missões, as listas) vem da IA.
 *
 * Desde a correção de 22/11/2026: o tempo de carro é o **medido** pelo Google (D310; o trecho sem
 * medida fica sem horário, nunca com uma estimativa); a hora que a pessoa disse para estar num lugar
 * fixa a chegada nele, e a hora de sair é calculada para trás (D311); o tempo em cada lugar é o que ela
 * disse ou mudou na tela, senão o padrão do tipo (D312).
 */

/**
 * Um lugar que vai para a viagem: a escolha (`e`), o nomeado (`n`) ou a sugestão (`s`); desde a fase 26,
 * a hora do dia dita para o passo dele ("de manhã"), para a revisão avisar quando o roteiro chega fora.
 */
export type PlacePick = {
  ref: string;
  place: Place;
  kind: StopKind;
  dayTime?: DayTime;
  /** os minutos no lugar que a pessoa disse ou mudou na tela (D312); sem isto, o padrão do tipo */
  dwell?: number;
  /** a hora que a pessoa disse para estar neste lugar, "HH:MM" (D311) */
  atTime?: string;
};

/**
 * A permanência padrão por tipo, em minutos: vale quando a pessoa não disse quanto tempo fica; a tela
 * das opções a mostra em cada lugar escolhido e deixa mudar (D312).
 */
export const DWELL_MINUTES: Readonly<Record<StopKind, number>> = {
  origin: 0,
  transit: 0,
  nature: 90,
  winery: 75,
  food: 75,
  hotel: 0,
  event: 120,
  city: 90,
  fuel: 15,
  other: 60,
};

/** Os minutos num lugar: o que a pessoa disse ou mudou, senão o padrão do tipo. */
export const dwellOf = (p: { kind: StopKind; dwell?: number | undefined }): number =>
  p.dwell ?? DWELL_MINUTES[p.kind];

/** O lugar do mapa como dado para a IA: a referência, o nome do mapa, a cidade, a categoria. */
export function placeForAi(p: PlacePick, minutes: number | null): PlanPlace {
  return {
    ref: p.ref,
    name: p.place.name.slice(0, 160),
    city: p.place.city,
    kind: p.kind,
    category: mainCategory(p.place.categories),
    lat: Math.round(p.place.lat * 1e4) / 1e4,
    lng: Math.round(p.place.lng * 1e4) / 1e4,
    opening_hours: p.place.opening_hours?.slice(0, 200) ?? null,
    minutes,
  };
}

/**
 * Os trechos da rota por índice (a origem, as escolhas na ordem, a volta): o formato de antes da D310,
 * que um caminho guardado por uma versão anterior ainda traz. O caminho novo leva a tabela dos tempos
 * medidos (`drive`), e os trechos saem dela pelos pontos.
 */
export type Legs = readonly ({ duration_s: number } | null)[];
const legMinutes = (legs: Legs | null | undefined, i: number): number | null => {
  const s = legs?.[i]?.duration_s;
  return s === undefined ? null : Math.max(5, Math.round(s / 60 / 5) * 5);
};

/**
 * O que vai para a leitura que escreve: as escolhas com o tempo de carro até cada uma (medido; null
 * quando não se mediu, e a IA não recebe tempo nenhum), as sugestões com o desvio e, desde a fase 25
 * (D278), o que a pessoa pediu e não entrou, como dado, para a IA não escrever sobre isso como se
 * estivesse no roteiro.
 */
export function placesForAi(
  chosen: readonly PlacePick[],
  suggestions: readonly (PlacePick & { detour: number | null })[],
  /** os minutos de carro até cada escolha, desde o ponto anterior (a saída na primeira) */
  minutes: readonly (number | null)[],
  /** os minutos da volta para casa; null sem casa ou sem medida */
  homeMinutes: number | null,
  pending: readonly PlanPending[] = [],
): PlanPlaces {
  return {
    chosen: chosen.map((p, i) => placeForAi(p, minutes[i] ?? null)),
    suggestions: suggestions.map((s) => placeForAi(s, s.detour)),
    home_minutes: homeMinutes,
    ...(pending.length > 0 ? { pending: [...pending] } : {}),
  };
}

// ------------------------------------------------------------------ a regra de ouro em código
/**
 * A divisão em dias que vale (a reconciliação): só as referências das escolhas, cada uma uma vez e na
 * ordem do caminho. A referência desconhecida sai (a IA não acrescenta lugar), a sugestão posta num dia
 * sai do dia (quem liga sugestão é a pessoa), a repetida sai, e a escolha que a IA esqueceu volta no
 * dia da escolha anterior. Os dias nunca andam para trás no caminho.
 */
export function reconcile(write: PlanWrite, chosenRefs: readonly string[]): string[][] {
  const known = new Set(chosenRefs);
  const dayOf = new Map<string, number>();
  write.days.forEach((day, d) => {
    for (const s of day.stops) if (known.has(s.ref) && !dayOf.has(s.ref)) dayOf.set(s.ref, d);
  });
  const days = Math.max(1, write.days.length);
  const out: string[][] = Array.from({ length: days }, () => []);
  let current = 0;
  for (const ref of chosenRefs) {
    current = Math.max(current, Math.min(days - 1, dayOf.get(ref) ?? current));
    out[current]?.push(ref);
  }
  return out;
}

// ---------------------------------------------------------------------------- os horários
const toMin = (hhmm: string) => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};
const toHhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Um ponto do dia para a conta dos horários: a chave da revisão, o tipo e onde fica. */
export type ScheduleStop = { key: string; kind: StopKind; lat: number | null; lng: number | null };
/** O que a revisão guarda para refazer os horários no aparelho ao ligar ou desligar uma parada. */
export type Schedule = {
  /** a hora de sair de cada dia (quando nenhuma hora dita a recalcula) */
  starts: Readonly<Record<string, string>>;
  /**
   * os minutos de carro por par de chaves ("d0s0>d0s1"): o formato de antes da D310 (uma revisão
   * guardada por uma versão anterior); a montagem nova deixa vazio e usa `drive`
   */
  legs: Readonly<Record<string, number>>;
  /**
   * os tempos de carro medidos, por par de pontos (D310): a revisão refaz os horários com eles quando a
   * pessoa liga ou desliga uma parada; o trecho que não está aqui não se sabe
   */
  drive?: DriveTable;
  /** os minutos em cada lugar que não são o padrão do tipo, pela chave da revisão (D312) */
  dwell?: Readonly<Record<string, number>>;
  /** a hora dita para estar num lugar, pela chave da revisão (D311): a saída do dia é calculada para trás */
  fixed?: Readonly<Record<string, string>>;
  /**
   * o que a hora de sair de um dia é, pela data: `said`, a pessoa disse a hora de sair, e ela fica;
   * `earliest` (a saída de hoje), o mais cedo que dá. Sem isto, a hora dita de um lugar a recalcula
   */
  startRule?: Readonly<Record<string, 'said' | 'earliest'>>;
};

/**
 * O tempo de carro entre dois pontos do dia: o medido (pelos pontos, D310), ou o trecho guardado pelas
 * chaves numa revisão de antes. **Null quando não se sabe** (um ponto sem lugar, um trecho sem medida):
 * a conta dos horários não chuta.
 */
export function travelBetween(a: ScheduleStop, b: ScheduleStop, schedule: Schedule): number | null {
  const byKey = schedule.legs[`${a.key}>${b.key}`];
  if (byKey !== undefined) return byKey;
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return measuredMinutes(schedule.drive, [a.lng, a.lat], [b.lng, b.lat]);
}

const located = (s: ScheduleStop) => s.lat !== null && s.lng !== null;
const stayOf = (s: ScheduleStop, schedule: Schedule) =>
  schedule.dwell?.[s.key] ?? DWELL_MINUTES[s.kind];

/**
 * A hora de sair de um dia, em minutos: a primeira parada com hora dita fixa a chegada nela, e a saída
 * é a hora dita menos a estrada e o tempo nos lugares até lá (D311); sem hora dita, com a hora de sair
 * dita pela pessoa, ou sem medida de um trecho até lá, a hora de sair do dia.
 */
function dayStart(
  stops: readonly ScheduleStop[],
  start: string,
  schedule: Schedule,
  rule: 'default' | 'said' | 'earliest',
): number {
  const fallback = toMin(start);
  if (rule === 'said' || !schedule.fixed) return fallback;
  let offset = 0;
  let last: ScheduleStop | null = null;
  for (const stop of stops) {
    if (located(stop)) {
      if (last) {
        const leg = travelBetween(last, stop, schedule);
        if (leg === null) return fallback;
        offset += leg;
      }
      last = stop;
    }
    const said = schedule.fixed[stop.key];
    if (said) {
      const wanted = toMin(said) - offset;
      // na saída de hoje não se sai antes de agora: a hora dita só atrasa a saída
      return rule === 'earliest' ? Math.max(fallback, wanted) : wanted;
    }
    offset += stayOf(stop, schedule);
  }
  return fallback;
}

/**
 * Os horários de um dia: a hora de sair (a do dia, ou a calculada para trás de uma hora dita), e cada
 * parada seguinte no fim da anterior (o tempo no lugar) mais o tempo de carro medido do trecho. Chegar
 * antes de uma hora dita é esperar por ela. A parada sem lugar (pendente) não tem estrada: fica na
 * hora em que se chegaria nela sem sair do lugar anterior, e o trecho seguinte é medido do último ponto
 * com lugar. **Depois de um trecho sem medida, os horários ficam sem hora** (null), até uma hora dita
 * dizer de novo onde o dia está. Devolve, por chave, o horário e os minutos até a próxima.
 */
export function scheduleDay(
  stops: readonly ScheduleStop[],
  start: string,
  schedule: Schedule,
  rule: 'default' | 'said' | 'earliest' = 'default',
): Map<string, { time: string | null; travel: number | null }> {
  const out = new Map<string, { time: string | null; travel: number | null }>();
  let clock: number | null = dayStart(stops, start, schedule, rule);
  let last: ScheduleStop | null = null;
  for (const [i, stop] of stops.entries()) {
    if (located(stop)) {
      if (last && clock !== null) {
        const leg = travelBetween(last, stop, schedule);
        clock = leg === null ? null : clock + leg;
      }
      last = stop;
    }
    const said = schedule.fixed?.[stop.key];
    if (said) {
      const target = toMin(said);
      clock = clock === null ? target : Math.max(clock, sameDay(target, clock));
    }
    const next = stops[i + 1];
    out.set(stop.key, {
      time: clock === null ? null : toHhmm(clock),
      travel: next ? travelBetween(stop, next, schedule) : null,
    });
    if (clock !== null) clock += stayOf(stop, schedule);
  }
  return out;
}

/** A hora dita no dia em que o relógio está (a que ficou mais de 12 h para trás é a do dia seguinte). */
function sameDay(target: number, clock: number): number {
  let t = target + Math.floor(clock / 1440) * 1440;
  if (t + 720 < clock) t += 1440;
  return t;
}

// ------------------------------------------------------------------------------ a montagem
export type AssembleInput = {
  /** "Papanduva, SC": a saída e a chegada em casa levam o nome dela */
  origin: { label: string; at: LngLat } | null;
  /** as escolhas e os nomeados confirmados, na ordem do caminho */
  chosen: readonly PlacePick[];
  /** as sugestões do caminho, com o desvio medido (null sem medida) e onde caem na rota (de 0 a 1) */
  suggestions: readonly (PlacePick & { detour: number | null; fraction: number })[];
  /** onde cada escolha cai na rota (de 0 a 1), na mesma ordem */
  chosenFractions: readonly number[];
  /** onde dormir: as hospedagens perto do destino, sugestões no fim de cada dia que não é o último */
  nights: readonly PlacePick[];
  /** os trechos por índice de um caminho guardado antes da D310; o caminho novo manda `drive` */
  legs?: Legs | null;
  /** os tempos de carro medidos, por par de pontos (D310): os horários saem deles */
  drive?: DriveTable;
  /** a hora de sair que a pessoa disse ("saindo às 8", D311); vale no primeiro dia, acima da IA */
  saidStart?: string | null;
  /** a saída de hoje: a hora de sair é o mais cedo que dá (uma hora dita só a atrasa) */
  today?: boolean;
  /**
   * os lugares que a pessoa nomeou e o mapa não achou: ela disse, então entram (a regra de ouro), sem
   * coordenada, no fim do último dia antes da chegada; a revisão procura de novo e a tela diz
   */
  missing?: readonly PlanNamed[];
  write: PlanWrite;
  /** o dia da viagem quando a IA não disse (amanhã numa viagem, hoje na saída de hoje) */
  firstDate: string;
  /** a hora de sair quando nem a pessoa nem a IA disseram */
  defaultStart: string;
  /**
   * o destino que a pessoa disse ("vou pra Curitiba"), pelo nome da cidade (fase 28): o objetivo do
   * trecho. Quando a cidade entra como parada (D304), é ela; quando não entra porque um lugar escolhido
   * fica nela (D313, a correção do sushi), é o último lugar escolhido nela
   */
  destination?: string | null;
};

/** O que a revisão recebe: o roteiro, as sugestões por chave (desligadas) e os horários para refazer. */
export type Assembled = {
  data: ImportData;
  trip: { name: string | null; start_date: string; end_date: string; origin: string | null };
  suggestions: Record<string, { detour: number | null; city: string | null; night: boolean }>;
  schedule: Schedule;
  /** as chaves de cada ponto do dia, na ordem, com o tipo e o lugar (para refazer os horários) */
  points: Record<string, ScheduleStop[]>;
  /**
   * o objeto do OpenStreetMap de cada lugar escolhido, pela chave da revisão (fase 23): é por ele que
   * o cartão-postal do lugar se acha no catálogo. Até a fase 23 ele se perdia aqui.
   */
  osm: Record<string, OsmRef>;
  /** as chaves da revisão das paradas pendentes (fase 25, D278): sem local, a busca só pelo nome */
  pending: string[];
  /** o `place_id` do Google de cada lugar escolhido, pela chave da revisão (fase 27, a decisão 4) */
  google: Record<string, string>;
  /** os períodos de funcionamento de cada lugar (o Google, fase 27), para a conta do passeio */
  hours: Record<string, OpeningPeriod[]>;
  /** a hora do dia dita para cada lugar (fase 26), pela chave da revisão: o aviso quando o roteiro chega fora */
  dayTimes: Record<string, DayTime>;
  /**
   * as chaves da revisão das paradas que são o objetivo do trecho (fase 28, D318): o mapa da viagem
   * mostra um trecho por vez, até o destino que a pessoa disse
   */
  objective: string[];
};

export type OsmRef = { type: 'node' | 'way' | 'relation'; id: number };

const plusDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const coord = (n: number) => (Number.isFinite(n) ? n : null);
const stopOf = (p: PlacePick, note: string | null): ImportStop => ({
  time: null,
  kind: p.kind,
  name: p.place.name,
  address: p.place.address ?? p.place.city,
  closes_at: null,
  travel_minutes_to_next: null,
  notes: note,
  url: null,
  lat: coord(p.place.lat),
  lng: coord(p.place.lng),
});

/** "Curitiba, PR" e "curitiba" são a mesma cidade: o nome antes da vírgula, sem caixa e sem acento. */
const cityKey = (name: string) =>
  (name.split(',')[0] ?? '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/**
 * O objetivo do trecho (fase 28, D318): a parada do destino dito (o lugar `destination:` da conversa,
 * D304); sem ela, e com o destino dito, o último lugar escolhido na cidade dele (D313: "buscar sushi em
 * Canoinhas" não ganha a parada da cidade, e o objetivo é o sushi). Nunca uma sugestão nem um pendente.
 */
function objectiveKeys(slots: readonly (readonly Slot[])[], destination: string | null): string[] {
  const picks = slots.flatMap((day, d) =>
    day.flatMap((slot, i) =>
      slot.type === 'pick' && !slot.suggestion && !slot.pick.place.id.startsWith('missing:')
        ? [{ key: `d${String(d)}s${String(i)}`, place: slot.pick.place }]
        : [],
    ),
  );
  const said = picks.filter((p) => p.place.id.startsWith('destination:'));
  if (said.length > 0) return said.map((p) => p.key);
  if (!destination) return [];
  const city = cityKey(destination);
  const inCity = picks.filter((p) => p.place.city !== null && cityKey(p.place.city) === city);
  const last = inCity.at(-1);
  return last ? [last.key] : [];
}

type Slot =
  | { type: 'origin'; name: string; at: LngLat }
  | {
      type: 'pick';
      pick: PlacePick;
      note: string | null;
      suggestion: Assembled['suggestions'][string] | null;
    };

/**
 * Monta o roteiro: a saída de casa no primeiro dia, as escolhas pelos dias da reconciliação, as
 * sugestões na ordem do caminho (logo depois da escolha que vem antes delas na rota), as hospedagens
 * no fim de cada dia que não é o último, e a chegada em casa no fim do último. Os horários contam só o
 * que está ligado (as sugestões nascem desligadas); a revisão os refaz quando a pessoa liga uma.
 */
export function assemble(input: AssembleInput): Assembled {
  const { write, chosen } = input;
  const notes = new Map<string, string | null>();
  for (const day of write.days)
    for (const s of day.stops) if (!notes.has(s.ref)) notes.set(s.ref, s.note);
  for (const s of write.suggestions) if (!notes.has(s.ref)) notes.set(s.ref, s.note);
  const byRef = new Map(chosen.map((p) => [p.ref, p]));
  const split = reconcile(
    write,
    chosen.map((p) => p.ref),
  );
  const start = write.trip.start_date ?? write.days[0]?.date ?? input.firstDate;
  const dates = split.map((_, d) => plusDays(start, d));

  // onde cada sugestão entra: depois da última escolha que vem antes dela no caminho
  const after = new Map<string, PlacePick[]>();
  const before: PlacePick[] = [];
  for (const s of [...input.suggestions].sort((a, b) => a.fraction - b.fraction)) {
    const anchor =
      chosen.filter((_, i) => (input.chosenFractions[i] ?? 0) <= s.fraction).at(-1)?.ref ?? null;
    if (anchor === null) before.push(s);
    else after.set(anchor, [...(after.get(anchor) ?? []), s]);
  }
  const detours = new Map(input.suggestions.map((s) => [s.ref, s.detour]));
  const suggestionMeta = (p: PlacePick, night: boolean) => ({
    // o desvio medido; a hospedagem e a sugestão sem medida ficam sem número (a tela não chuta)
    detour: detours.get(p.ref) ?? null,
    city: p.place.city,
    night,
  });

  const slots: Slot[][] = split.map((refs, d) => {
    const day: Slot[] = [];
    if (d === 0 && input.origin) {
      day.push({ type: 'origin', name: `Saída de ${input.origin.label}`, at: input.origin.at });
    }
    if (d === 0) {
      for (const s of before)
        day.push({
          type: 'pick',
          pick: s,
          note: notes.get(s.ref) ?? null,
          suggestion: suggestionMeta(s, false),
        });
    }
    for (const ref of refs) {
      const pick = byRef.get(ref);
      if (!pick) continue;
      day.push({ type: 'pick', pick, note: notes.get(ref) ?? null, suggestion: null });
      for (const s of after.get(ref) ?? []) {
        day.push({
          type: 'pick',
          pick: s,
          note: notes.get(s.ref) ?? null,
          suggestion: suggestionMeta(s, false),
        });
      }
    }
    if (d < split.length - 1) {
      for (const n of input.nights) {
        day.push({
          type: 'pick',
          pick: { ...n, ref: `${n.ref}d${String(d)}` },
          note: null,
          suggestion: suggestionMeta(n, true),
        });
      }
    }
    if (d === split.length - 1) {
      (input.missing ?? []).forEach((n, i) => {
        day.push({
          type: 'pick',
          pick: {
            ref: `m${String(i + 1)}`,
            kind: n.kind,
            place: {
              id: `missing:${String(i)}`,
              name: n.name,
              lat: Number.NaN,
              lng: Number.NaN,
              categories: [],
              city: n.city,
              address: n.city,
              opening_hours: null,
              website: null,
              osm: null,
              distance_m: null,
            },
          },
          note: null,
          suggestion: null,
        });
      });
    }
    if (d === split.length - 1 && input.origin) {
      day.push({ type: 'origin', name: `Chegada em ${input.origin.label}`, at: input.origin.at });
    }
    return day;
  });

  // as chaves da revisão são as da ordem do roteiro (`d<dia>s<parada>`, como `reviewOf` dá)
  const legs: Record<string, number> = {};
  const points: Record<string, ScheduleStop[]> = {};
  const suggestions: Assembled['suggestions'] = {};
  const osm: Assembled['osm'] = {};
  const google: Assembled['google'] = {};
  const hours: Assembled['hours'] = {};
  const dayTimes: Assembled['dayTimes'] = {};
  const dwell: Record<string, number> = {};
  const fixed: Record<string, string> = {};
  const pending: string[] = [];
  // a rota real liga os pontos ligados de saída: a origem, as escolhas na ordem e a volta
  const routed: string[] = [];
  slots.forEach((day, d) => {
    points[dates[d] ?? ''] = day.map((slot, i) => {
      const key = `d${String(d)}s${String(i)}`;
      if (slot.type === 'origin') {
        routed.push(key);
        return { key, kind: 'origin', lat: slot.at[1], lng: slot.at[0] };
      }
      if (slot.suggestion) suggestions[key] = slot.suggestion;
      else if (Number.isFinite(slot.pick.place.lat)) routed.push(key);
      else pending.push(key);
      if (slot.pick.place.osm) osm[key] = slot.pick.place.osm;
      if (slot.pick.place.google_place_id) google[key] = slot.pick.place.google_place_id;
      if (slot.pick.place.hours && slot.pick.place.hours.length > 0)
        hours[key] = slot.pick.place.hours;
      if (slot.pick.dayTime) dayTimes[key] = slot.pick.dayTime;
      if (slot.pick.dwell !== undefined) dwell[key] = slot.pick.dwell;
      // a hora dita é de uma escolha da pessoa: uma sugestão não fixa hora nenhuma
      if (slot.pick.atTime && !slot.suggestion) fixed[key] = slot.pick.atTime;
      return {
        key,
        kind: slot.pick.kind,
        lat: coord(slot.pick.place.lat),
        lng: coord(slot.pick.place.lng),
      };
    });
  });
  // um caminho guardado antes da D310 traz os trechos por índice (a saída, as escolhas, a volta): viram
  // os trechos pelas chaves, como antes; o caminho novo traz a tabela dos tempos medidos, pelos pontos
  if (input.legs && !input.drive) {
    // sem origem, a rota começa na primeira escolha: o trecho 0 da rota é saída → primeira escolha
    const offset = input.origin ? 0 : 1;
    for (let i = 0; i + 1 < routed.length; i++) {
      const m = legMinutes(input.legs, i + offset);
      if (m !== null) legs[`${routed[i] ?? ''}>${routed[i + 1] ?? ''}`] = m;
    }
  }

  const starts: Record<string, string> = {};
  const startRule: Record<string, 'said' | 'earliest'> = {};
  dates.forEach((date, d) => {
    // a hora de sair que a pessoa disse vale acima da que a IA escreveu (D311), no primeiro dia
    const said = d === 0 ? (input.saidStart ?? null) : null;
    starts[date] = said ?? write.days[d]?.start ?? input.defaultStart;
    if (said) startRule[date] = 'said';
    else if (input.today && d === 0) startRule[date] = 'earliest';
  });
  const schedule: Schedule = {
    starts,
    legs,
    ...(input.drive ? { drive: input.drive } : {}),
    ...(Object.keys(dwell).length > 0 ? { dwell } : {}),
    ...(Object.keys(fixed).length > 0 ? { fixed } : {}),
    ...(Object.keys(startRule).length > 0 ? { startRule } : {}),
  };

  const days = slots.map((day, d) => {
    const date = dates[d] ?? start;
    const on = (points[date] ?? []).filter((p) => !suggestions[p.key]);
    const times = scheduleDay(
      on,
      starts[date] ?? input.defaultStart,
      schedule,
      startRule[date] ?? 'default',
    );
    return {
      date,
      title: write.days[d]?.title ?? null,
      stops: day.map((slot, i): ImportStop => {
        const key = `d${String(d)}s${String(i)}`;
        const t = times.get(key);
        const base: ImportStop =
          slot.type === 'origin'
            ? {
                time: null,
                kind: 'origin',
                name: slot.name,
                address: input.origin?.label ?? null,
                closes_at: null,
                travel_minutes_to_next: null,
                notes: null,
                url: null,
                lat: slot.at[1],
                lng: slot.at[0],
              }
            : stopOf(slot.pick, slot.note);
        return { ...base, time: t?.time ?? null, travel_minutes_to_next: t?.travel ?? null };
      }),
    };
  });

  const refToName = new Map(
    [...chosen, ...input.suggestions].map((p) => [p.ref, p.place.name] as const),
  );
  const end = dates.at(-1) ?? start;
  return {
    data: {
      days,
      reservations: [],
      contacts: [],
      checklist_before: write.checklist_before,
      checklist_pack: write.checklist_pack,
      quests: write.quests.map((q) => ({
        text: q.text,
        stop_ref: q.ref ? (refToName.get(q.ref) ?? null) : null,
      })),
      unclassified: [],
    },
    trip: {
      name: write.trip.name,
      start_date: start,
      end_date: write.trip.end_date && write.trip.end_date > end ? write.trip.end_date : end,
      origin: input.origin?.label ?? null,
    },
    suggestions,
    schedule,
    points,
    osm,
    pending,
    google,
    hours,
    dayTimes,
    objective: objectiveKeys(slots, input.destination ?? null),
  };
}

/** Uma viagem só com a saída e a chegada não é um sucesso: falta lugar. */
export function hasPlace(stops: readonly { kind: StopKind; include: boolean }[]): boolean {
  return stops.some((s) => s.include && s.kind !== 'origin' && s.kind !== 'transit');
}
