// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { StopKind } from '../../../supabase/functions/_shared/constants.ts';
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import type { ImportData, ImportStop } from '../../../supabase/functions/_shared/import-schema.ts';
import type { OpeningPeriod, Place } from '../../../supabase/functions/_shared/places-schema.ts';
import type {
  PlanNamed,
  PlanPending,
  PlanPlace,
  PlanPlaces,
  PlanWrite,
} from '../../../supabase/functions/_shared/plan-protocol.ts';
import { mainCategory } from './places.ts';
import { driveMinutes } from './search.ts';

/**
 * A viagem nasce do que foi escolhido (fase 24), pura: das escolhas da pessoa, dos lugares que ela
 * nomeou, das sugestões do caminho e do que a IA escreveu, o roteiro no formato da importação, que a
 * revisão da fase 10 e 17 entende. **A regra de ouro do Douglas em código**: "apenas pode colocar
 * algo direto na rota se a pessoa realmente falar no chat". Na viagem entram só a saída, a chegada em
 * casa, as escolhas, os nomeados confirmados e as sugestões, e a sugestão nasce **desligada**; a IA só
 * escreve sobre o que veio por referência, e o que ela devolver fora disso sai aqui (`reconcile`).
 * O que é fato (o lugar, a coordenada, o tempo de carro, o horário de funcionamento) vem do mapa e da
 * rota; o que é texto (o nome da viagem, a frase de cada lugar, as missões, as listas) vem da IA.
 */

/** Um lugar que vai para a viagem: a escolha (`e`), o nomeado (`n`) ou a sugestão (`s`). */
export type PlacePick = { ref: string; place: Place; kind: StopKind };

/** A permanência padrão por tipo, em minutos: dá os horários; a pessoa ajusta na revisão. */
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

/** Os minutos de carro de cada trecho da rota (a origem, as escolhas na ordem, a volta). */
export type Legs = readonly { duration_s: number }[];
const legMinutes = (legs: Legs | null, i: number): number | null => {
  const s = legs?.[i]?.duration_s;
  return s === undefined ? null : Math.max(5, Math.round(s / 60 / 5) * 5);
};

/**
 * O que vai para a leitura que escreve: as escolhas com o tempo de carro, as sugestões com o desvio e,
 * desde a fase 25 (D278), o que a pessoa pediu e não entrou, como dado, para a IA não escrever sobre
 * isso como se estivesse no roteiro.
 */
export function placesForAi(
  chosen: readonly PlacePick[],
  suggestions: readonly (PlacePick & { detour: number })[],
  legs: Legs | null,
  home: boolean,
  pending: readonly PlanPending[] = [],
): PlanPlaces {
  return {
    chosen: chosen.map((p, i) => placeForAi(p, legMinutes(legs, i))),
    suggestions: suggestions.map((s) => placeForAi(s, s.detour)),
    home_minutes: home ? legMinutes(legs, chosen.length) : null,
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
/** O que a revisão guarda para refazer os horários no aparelho ao ligar uma sugestão. */
export type Schedule = {
  /** a hora de sair de cada dia */
  starts: Readonly<Record<string, string>>;
  /** os minutos de carro que a rota real deu, por par de chaves ("d0s0>d0s1") */
  legs: Readonly<Record<string, number>>;
};

/** O tempo de carro entre dois pontos: o da rota real quando houve, senão a estimativa. */
export function travelBetween(a: ScheduleStop, b: ScheduleStop, schedule: Schedule): number | null {
  const real = schedule.legs[`${a.key}>${b.key}`];
  if (real !== undefined) return real;
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return driveMinutes(haversineM([a.lng, a.lat], [b.lng, b.lat]) / 1000);
}

/**
 * Os horários de um dia: a hora de sair, e cada parada seguinte no fim da anterior (a permanência do
 * tipo) mais o tempo de carro do trecho. Devolve, por chave, o horário e os minutos até a próxima.
 */
export function scheduleDay(
  stops: readonly ScheduleStop[],
  start: string,
  schedule: Schedule,
): Map<string, { time: string; travel: number | null }> {
  const out = new Map<string, { time: string; travel: number | null }>();
  let at = toMin(start);
  stops.forEach((stop, i) => {
    const next = stops[i + 1];
    const travel = next ? travelBetween(stop, next, schedule) : null;
    out.set(stop.key, { time: toHhmm(at), travel });
    at += DWELL_MINUTES[stop.kind] + (travel ?? 0);
  });
  return out;
}

// ------------------------------------------------------------------------------ a montagem
export type AssembleInput = {
  /** "Papanduva, SC": a saída e a chegada em casa levam o nome dela */
  origin: { label: string; at: LngLat } | null;
  /** as escolhas e os nomeados confirmados, na ordem do caminho */
  chosen: readonly PlacePick[];
  /** as sugestões do caminho, com o desvio e onde caem na rota (de 0 a 1) */
  suggestions: readonly (PlacePick & { detour: number; fraction: number })[];
  /** onde cada escolha cai na rota (de 0 a 1), na mesma ordem */
  chosenFractions: readonly number[];
  /** onde dormir: as hospedagens perto do destino, sugestões no fim de cada dia que não é o último */
  nights: readonly PlacePick[];
  /** os trechos da rota real: da saída a cada escolha, e a volta */
  legs: Legs | null;
  /**
   * os lugares que a pessoa nomeou e o mapa não achou: ela disse, então entram (a regra de ouro), sem
   * coordenada, no fim do último dia antes da chegada; a revisão procura de novo e a tela diz
   */
  missing?: readonly PlanNamed[];
  write: PlanWrite;
  /** o dia da viagem quando a IA não disse (amanhã numa viagem, hoje na saída de hoje) */
  firstDate: string;
  /** a hora de sair quando a IA não disse */
  defaultStart: string;
};

/** O que a revisão recebe: o roteiro, as sugestões por chave (desligadas) e os horários para refazer. */
export type Assembled = {
  data: ImportData;
  trip: { name: string | null; start_date: string; end_date: string; origin: string | null };
  suggestions: Record<string, { detour: number; city: string | null; night: boolean }>;
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
    detour: detours.get(p.ref) ?? 0,
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
      return {
        key,
        kind: slot.pick.kind,
        lat: coord(slot.pick.place.lat),
        lng: coord(slot.pick.place.lng),
      };
    });
  });
  // sem origem, a rota começa na primeira escolha: o trecho 0 da rota é saída → primeira escolha
  const offset = input.origin ? 0 : 1;
  for (let i = 0; i + 1 < routed.length; i++) {
    const m = legMinutes(input.legs, i + offset);
    if (m !== null) legs[`${routed[i] ?? ''}>${routed[i + 1] ?? ''}`] = m;
  }

  const starts: Record<string, string> = {};
  dates.forEach((date, d) => {
    starts[date] = write.days[d]?.start ?? input.defaultStart;
  });
  const schedule: Schedule = { starts, legs };

  const days = slots.map((day, d) => {
    const date = dates[d] ?? start;
    const on = (points[date] ?? []).filter((p) => !suggestions[p.key]);
    const times = scheduleDay(on, starts[date] ?? input.defaultStart, schedule);
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
  };
}

/** Uma viagem só com a saída e a chegada não é um sucesso: falta lugar. */
export function hasPlace(stops: readonly { kind: StopKind; include: boolean }[]): boolean {
  return stops.some((s) => s.include && s.kind !== 'origin' && s.kind !== 'transit');
}
