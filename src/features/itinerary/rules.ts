import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { comparePosition } from '@/lib/ids/position.ts';
import type { DayRoute, RouteLeg, Stop, TripDay } from '@/lib/db/schema.ts';
import { formatDayNumeric } from '@/lib/time/index.ts';

/** Datas de `start` a `end`, inclusive, no formato das colunas `date`. */
export function datesBetween(start: string, end: string): string[] {
  const a = parseISO(start);
  const n = differenceInCalendarDays(parseISO(end), a);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => format(addDays(a, i), 'yyyy-MM-dd'));
}

export type DaysPlan = {
  /** datas sem dia local: criar com id determinístico */
  create: string[];
  /** dias locais aposentados que voltam para o intervalo: só tirar o deleted_at */
  restore: TripDay[];
  /** dias que saem do intervalo e não têm paradas: aposentar */
  retire: TripDay[];
  /** dias que saem do intervalo com paradas: bloqueiam a mudança */
  blocked: { day: TripDay; stops: Stop[] }[];
};

/**
 * O que fazer com os dias quando a viagem é criada ou muda de datas. Dias são derivados das
 * datas: um por data, nunca por posição. Encurtar só aposenta dia vazio; dia com paradas bloqueia,
 * e a pessoa move ou exclui as paradas antes. Nada é apagado por acidente.
 */
export function planDays(
  range: { start_date: string; end_date: string },
  days: readonly TripDay[],
  stops: readonly Stop[],
): DaysPlan {
  const wanted = new Set(datesBetween(range.start_date, range.end_date));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const plan: DaysPlan = { create: [], restore: [], retire: [], blocked: [] };
  for (const date of wanted) {
    const day = byDate.get(date);
    if (!day) plan.create.push(date);
    else if (day.deleted_at !== null) plan.restore.push(day);
  }
  for (const day of days) {
    if (wanted.has(day.date) || day.deleted_at !== null) continue;
    const dayStops = sortStops(
      stops.filter((s) => s.trip_day_id === day.id && s.deleted_at === null),
    );
    if (dayStops.length === 0) plan.retire.push(day);
    else plan.blocked.push({ day, stops: dayStops });
  }
  plan.retire.sort((a, b) => a.date.localeCompare(b.date));
  plan.blocked.sort((a, b) => a.day.date.localeCompare(b.day.date));
  return plan;
}

/** A mensagem do bloqueio: lista os dias e as paradas que impedem encurtar. */
export function blockedMessage(blocked: DaysPlan['blocked']): string {
  const parts = blocked.map(({ day, stops }) => {
    const names = stops.map((s) => s.name).join(', ');
    return `${formatDayNumeric(day.date)} tem ${stops.length === 1 ? '1 parada' : `${stops.length} paradas`} (${names})`;
  });
  return `Não dá para encurtar: ${parts.join('; ')}. Mova ou exclua essas paradas antes.`;
}

/** Em ordem de `position` (collate "C"). Quem chama filtra as excluídas. */
export function sortStops<T extends Pick<Stop, 'position'>>(stops: readonly T[]): T[] {
  return [...stops].sort((a, b) => comparePosition(a.position, b.position));
}

export function activeStops(stops: readonly Stop[]): Stop[] {
  return sortStops(stops.filter((s) => s.deleted_at === null));
}

export type LocatedStop = Stop & { lat: number; lng: number };

export function isLocated(stop: Stop): stop is LocatedStop {
  return stop.lat !== null && stop.lng !== null;
}

/** Só as paradas com coordenada, na ordem: são os waypoints da rota do dia. */
export function routeWaypoints(
  stops: readonly Stop[],
): { stop: LocatedStop; lngLat: [number, number] }[] {
  return sortStops(stops)
    .filter((s) => s.deleted_at === null)
    .filter(isLocated)
    .map((stop) => ({ stop, lngLat: [stop.lng, stop.lat] }));
}

/** Minutos arredondados a 5, nunca abaixo de 5: ninguém planeja em segundos. */
export function roundTravelMinutes(seconds: number): number {
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

/**
 * Sugestão de `travel_minutes_to_next` a partir dos trechos da rota real, só para paradas sem
 * valor e cujo próximo na lista é o próximo waypoint (sem parada sem coordenada no meio). A
 * pessoa confirma; a sugestão nunca grava sozinha.
 */
export function suggestTravel(
  stops: readonly Stop[],
  route: Pick<DayRoute, 'legs'> | null | undefined,
): Map<string, number> {
  const out = new Map<string, number>();
  if (!route) return out;
  const ordered = activeStops(stops);
  const wps = routeWaypoints(ordered);
  for (let k = 0; k < wps.length - 1; k++) {
    const leg = route.legs[k];
    const a = wps[k]?.stop;
    const b = wps[k + 1]?.stop;
    if (!leg || !a || !b || a.travel_minutes_to_next !== null) continue;
    const ia = ordered.findIndex((s) => s.id === a.id);
    if (ordered[ia + 1]?.id !== b.id) continue;
    out.set(a.id, roundTravelMinutes(leg.duration_s));
  }
  return out;
}

export type DayTotals = { distance_m: number | null; travel_minutes: number };

/** Km da rota real (quando existe) e a soma dos deslocamentos informados. */
export function dayTotals(
  stops: readonly Stop[],
  route: Pick<DayRoute, 'legs'> | null | undefined,
): DayTotals {
  const travel = activeStops(stops).reduce((acc, s) => acc + (s.travel_minutes_to_next ?? 0), 0);
  const distance = route ? route.legs.reduce((acc, l) => acc + l.distance_m, 0) : null;
  return { distance_m: distance, travel_minutes: travel };
}

export function formatKm(meters: number): string {
  return `${Math.round(meters / 1000).toLocaleString('pt-BR')} km`;
}

/**
 * O trecho da rota real que sai de cada parada, quando a parada seguinte na lista é o próximo
 * waypoint (sem parada sem coordenada no meio). Para mostrar km e duração entre os nós.
 */
export function legsByStop(
  stops: readonly Stop[],
  route: Pick<DayRoute, 'legs'> | null | undefined,
): Map<string, RouteLeg> {
  const out = new Map<string, RouteLeg>();
  if (!route) return out;
  const ordered = activeStops(stops);
  const wps = routeWaypoints(ordered);
  for (let k = 0; k < wps.length - 1; k++) {
    const leg = route.legs[k];
    const a = wps[k]?.stop;
    const b = wps[k + 1]?.stop;
    if (!leg || !a || !b) continue;
    const ia = ordered.findIndex((s) => s.id === a.id);
    if (ordered[ia + 1]?.id === b.id) out.set(a.id, leg);
  }
  return out;
}

/** Subida acumulada do perfil de altitude, em metros. */
export function totalAscent(elevation: readonly (readonly [number, number])[]): number {
  let up = 0;
  for (let i = 1; i < elevation.length; i++) {
    const d = (elevation[i]?.[1] ?? 0) - (elevation[i - 1]?.[1] ?? 0);
    if (d > 0) up += d;
  }
  return Math.round(up);
}
