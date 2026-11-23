import { haversineM, type LngLat } from '@shared/geo.ts';
import { activeStops, isAutoStop, isLocated, routeWaypoints } from '@/features/itinerary/rules.ts';
import type { DayRoute, RouteLeg, Stop } from '@/lib/db/schema.ts';
import { indexRoute, waypointAlongs } from '@/lib/geo/project.ts';
import { cutLine, cutProfile } from '@/lib/geo/slice.ts';
import { isArrivalNode } from './rules.ts';

/**
 * O dia em trechos (fase 28, as decisões 9 a 13 do Douglas de 21/11/2026), puro: o mapa da viagem
 * mostra um trecho por vez, até o objetivo, e a volta só aparece ao chegar. "O objetivo é o destino que
 * a pessoa disse" (`stops.objective`, marcado pela conversa); o que fica antes dele é parada do trecho;
 * a volta para casa é sempre o último trecho; um dia pode ter mais de um objetivo. Sem objetivo marcado
 * (a viagem de antes, a importada, a conversa que não disse destino), a regra de reserva: num dia que
 * sai de casa e volta para ela, dois trechos, divididos na parada mais longe de casa; num dia que não
 * volta, um trecho só. "Cachoeira e depois café" é um objetivo só (a cachoeira, mais longe; o café
 * fica na volta). Mora ao lado do `dayState` porque lê o mesmo dia e o mesmo nó de chegada (D233).
 */
export type Leg = {
  index: number;
  /** de onde o trecho sai: a saída do dia, ou o objetivo do trecho anterior */
  from: Stop;
  /** o objetivo do trecho; no último trecho de um dia que volta, a chegada em casa */
  to: Stop;
  /**
   * os nós do trecho, em ordem, do `from` ao `to` (os dois inclusive), com as paradas automáticas que
   * caem entre eles; no último trecho, também as que vieram depois da chegada
   */
  stops: Stop[];
  /** o trecho termina na chegada em casa */
  home: boolean;
};

/** As duas pontas de uma ida e volta a mais do que isto uma da outra não são a mesma casa. */
export const SAME_HOME_M = 20_000;

const at = (s: Stop & { lat: number; lng: number }): LngLat => [s.lng, s.lat];

/**
 * Um dia que sai de casa e volta para ela: começa numa saída (uma origem) e termina na chegada em casa
 * (D233); com as duas coordenadas, as duas a até 20 km uma da outra. O último dia de uma viagem de
 * vários dias também termina na chegada em casa, mas começa num lugar do caminho: não é ida e volta.
 */
function isRoundTrip(planned: readonly Stop[], ordered: readonly Stop[]): boolean {
  const first = planned[0];
  const last = planned.at(-1);
  if (!first || !last || first.kind !== 'origin' || !isArrivalNode(last, ordered)) return false;
  if (isLocated(first) && isLocated(last)) return haversineM(at(first), at(last)) <= SAME_HOME_M;
  return true;
}

/**
 * A regra de reserva de uma ida e volta: a parada do roteiro mais longe de casa, pela coordenada (as
 * sem coordenada não concorrem; num empate, a primeira). Sem casa com coordenada ou sem nenhuma
 * parada com coordenada, nenhuma: o dia fica num trecho só.
 */
function farthestFromHome(planned: readonly Stop[]): Stop | null {
  const first = planned[0];
  const last = planned.at(-1);
  const home = last && isLocated(last) ? at(last) : first && isLocated(first) ? at(first) : null;
  if (!home) return null;
  let best: { stop: Stop; d: number } | null = null;
  for (const stop of planned.slice(1, -1)) {
    if (!isLocated(stop)) continue;
    const d = haversineM(home, at(stop));
    if (!best || d > best.d) best = { stop, d };
  }
  return best?.stop ?? null;
}

/** Os trechos do dia, das paradas ativas em ordem (as mesmas que o `dayState` recebe). */
export function legsOf(stops: readonly Stop[]): Leg[] {
  const ordered = activeStops(stops);
  const first = ordered[0];
  if (!first) return [];
  const planned = ordered.filter((s) => !isAutoStop(s));
  const lastPlanned = planned.at(-1) ?? ordered.at(-1) ?? first;
  const home = isArrivalNode(lastPlanned, ordered);
  // os objetivos: os marcados entre a primeira e a última do roteiro; sem nenhum, a regra de reserva
  const middle = planned.slice(1, -1);
  const marked = middle.filter((s) => s.objective === true);
  const fallback =
    marked.length === 0 && isRoundTrip(planned, ordered) ? farthestFromHome(planned) : null;
  const objectives = marked.length > 0 ? marked : fallback ? [fallback] : [];
  const cuts = objectives
    .map((o) => ordered.findIndex((s) => s.id === o.id))
    .filter((i) => i > 0)
    .sort((a, b) => a - b);
  const bounds = [0, ...cuts];
  return bounds.map((start, k) => {
    const next = bounds[k + 1];
    const last = next === undefined;
    const stopsOf = ordered.slice(start, last ? ordered.length : next + 1);
    return {
      index: k,
      from: ordered[start] ?? first,
      to: last ? lastPlanned : (ordered[next] ?? lastPlanned),
      stops: stopsOf,
      home: last && home,
    };
  });
}

/** O trecho da vez: o primeiro cujo objetivo ainda não foi feito nem pulado; com tudo feito, o último. */
export function currentLeg(legs: readonly Leg[]): number {
  const i = legs.findIndex((l) => l.to.done_at === null && !l.to.skipped);
  return i >= 0 ? i : Math.max(0, legs.length - 1);
}

/**
 * O trecho que a maquete mostra: o espiado (um toque no indicador), senão o trecho anterior enquanto o
 * "Como foi?" do objetivo dele está para abrir ou aberto (a decisão 12: "no Chegamos! do objetivo,
 * depois do Como foi?"), até o Partiu! dali; senão, o da vez. O "Desfazer" da chegada não precisa de
 * regra: sem o `done_at`, o trecho da vez já é o anterior.
 */
export function legToShow(input: {
  legs: readonly Leg[];
  current: number;
  /** a parada cujo "Como foi?" está para abrir ou aberto (a folha ou o cartão), ou null */
  hold: string | null;
  /** o trecho espiado, ou null */
  peek: number | null;
}): number {
  const { legs, current, hold, peek } = input;
  if (peek !== null && peek >= 0 && peek < legs.length) return peek;
  const previous = legs[current - 1];
  if (
    previous &&
    hold !== null &&
    previous.to.id === hold &&
    previous.to.done_at !== null &&
    previous.to.departed_at === null
  ) {
    return current - 1;
  }
  return Math.min(Math.max(0, current), Math.max(0, legs.length - 1));
}

/** "Chegada em Major Vieira" é a casa: o nome do lugar, sem o "Chegada em". */
export function placeName(stop: Pick<Stop, 'name'>): string {
  return stop.name.replace(/^chegada em\s+/i, '').trim() || stop.name;
}

export type LegName = {
  /** o rótulo do botão do indicador: "ida", "volta", ou o número do trecho */
  short: string;
  /** o nome acessível: "Ida, até Canoinhas", "Trecho 2 de 3, até Curitiba" */
  name: string;
  /** a linha do progresso: "do trecho até Canoinhas", "da volta" */
  progress: string;
};

/**
 * Os nomes dos trechos, para o indicador e a linha do progresso (a decisão 13): "ida · volta" numa ida e
 * volta de dois trechos; "1 de 3" (o número de cada um) nos outros.
 */
export function legNames(legs: readonly Leg[]): LegName[] {
  const [ida, volta] = legs;
  const pair =
    legs.length === 2 &&
    volta?.home === true &&
    ida !== undefined &&
    ida.from.kind === 'origin' &&
    !isAutoStop(ida.from);
  return legs.map((leg, i) => {
    const where = placeName(leg.to);
    const progress = leg.home ? 'da volta' : `do trecho até ${where}`;
    if (pair) {
      const short = i === 0 ? 'ida' : 'volta';
      return { short, name: `${i === 0 ? 'Ida' : 'Volta'}, até ${where}`, progress };
    }
    return {
      short: String(i + 1),
      name: `Trecho ${String(i + 1)} de ${String(legs.length)}, até ${where}`,
      progress,
    };
  });
}

// ------------------------------------------------------------------ a rota de cada trecho
/** Onde o trecho fica na rota do dia, em metros do traçado (a escala da projeção, D234). */
export type LegSpan = { from_m: number; to_m: number };

/** A rota do trecho: o traçado e o perfil cortados, os `legs` dele e um hash próprio (o cache do lugar). */
export type LegRoute = Pick<DayRoute, 'hash' | 'geometry' | 'elevation' | 'legs'>;

export type LegGeometry = { span: LegSpan | null; route: LegRoute | null };

type RouteIn = Pick<DayRoute, 'hash' | 'geometry' | 'elevation' | 'legs'>;

const sumM = (legs: readonly RouteLeg[]) => legs.reduce((n, l) => n + l.distance_m, 0);

/**
 * A rota de cada trecho, cortada da rota do dia pelos trechos da `route-day` (um por par de pontos de
 * passagem): o traçado entre o ponto de passagem do começo e o do fim do trecho (na escala do traçado,
 * como `waypointAlongs`), o perfil pela distância dele, e os `legs` entre os dois. **Sem `legs` que
 * batam com os pontos de passagem** (a rota guardada de antes de uma parada mudar), nenhum trecho tem
 * rota, como `kmAxis` já faz: o trecho vai com o km virtual, nunca com uma geometria errada. Um trecho
 * com menos de dois pontos de passagem também fica sem rota. Num dia de um trecho só, a rota do dia
 * como está (nada muda).
 */
export function legGeometry(
  stops: readonly Stop[],
  route: RouteIn | null,
  legs: readonly Leg[],
): LegGeometry[] {
  if (legs.length <= 1) return legs.map(() => ({ span: null, route }));
  const none = legs.map(() => ({ span: null, route: null }));
  const waypoints = routeWaypoints(stops).map((w) => w.stop.id);
  if (!route || route.geometry.length < 2 || route.legs.length !== waypoints.length - 1) {
    return none;
  }
  const index = indexRoute(route.geometry);
  const alongs = waypointAlongs(index, route.legs, waypoints);
  if (!alongs) return none;
  const total = sumM(route.legs);
  // o perfil de altitude conta a distância pelo traçado inteiro da `route-day` (antes da simplificação),
  // e os `legs` pela do provedor: a mesma estrada, e a escala entre as duas fica explícita
  const profileTotal = route.elevation.at(-1)?.[0] ?? total;
  const scaleE = total > 0 && profileTotal > 0 ? profileTotal / total : 1;
  const position = new Map(waypoints.map((id, i) => [id, i]));
  return legs.map((leg) => {
    const own = leg.stops.flatMap((s) => {
      const i = position.get(s.id);
      return i === undefined ? [] : [i];
    });
    const w0 = Math.min(...own);
    const w1 = Math.max(...own);
    if (own.length < 2 || w1 <= w0) return { span: null, route: null };
    const from_m = alongs.get(waypoints[w0] ?? '') ?? 0;
    const to_m = alongs.get(waypoints[w1] ?? '') ?? index.total_m;
    const before = sumM(route.legs.slice(0, w0));
    const own_m = sumM(route.legs.slice(w0, w1));
    return {
      span: { from_m, to_m },
      route: {
        hash: `${route.hash}#${String(w0)}-${String(w1)}`,
        geometry: cutLine(route.geometry, index.cum, from_m, to_m),
        elevation: cutProfile(route.elevation, before * scaleE, (before + own_m) * scaleE).map(
          ([d, alt]): [number, number] => [d / scaleE, alt],
        ),
        legs: route.legs.slice(w0, w1),
      },
    };
  });
}

/**
 * A fração do trecho (0 a 1) de um ponto da rota do dia, pelos metros percorridos dela (a projeção com
 * piso da D234 já os dá: a mesma estrada não aparece duas vezes). Antes do começo do trecho, 0; depois
 * do fim, 1. Sem os metros ou sem onde o trecho fica, null.
 */
export function legFraction(alongM: number | null, span: LegSpan | null): number | null {
  if (alongM === null || !span) return null;
  const length = span.to_m - span.from_m;
  if (length <= 0) return alongM >= span.to_m ? 1 : 0;
  return Math.min(1, Math.max(0, (alongM - span.from_m) / length));
}
