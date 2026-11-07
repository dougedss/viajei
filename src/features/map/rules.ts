import { isDepartureKind } from '@shared/constants.ts';
import { waypointsHashOf } from '@/features/itinerary/route-hash.ts';
import { activeStops, isLocated, type LocatedStop } from '@/features/itinerary/rules.ts';
import { parseTrackPoints } from '@/features/travel-mode/track.ts';
import { dayState, statusOf, type StopStatus } from '@/features/travel-mode/rules.ts';
import type { DayRoute, LngLat, Stop, Trip, TripDay, TripTrack } from '@/lib/db/schema.ts';
import { splitAtStops } from '@/lib/geo/split.ts';

/**
 * O mapa, puro: o que cada dia desenha (marcadores numerados com o estado da lista do dia, a rota real
 * cortada nas paradas ou um traço reto quando não há rota, o trecho rodado), o enquadramento, o último
 * ponto da trilha e o dia que abre. O Leaflet só desenha o que sai daqui. Não é GPS: nada aqui lê a
 * posição de quem olha.
 */

export type MapPin = {
  stop: LocatedStop;
  /** a ordem na lista do dia (as sem lugar também contam, para o número bater com a lista) */
  number: number;
  status: StopStatus;
};

export type MapLine = {
  /** `route`: a estrada de verdade (rota real); `straight`: um traço reto, sem rota, nunca o caminho */
  kind: 'route' | 'straight';
  /** entre duas paradas concluídas: o trecho já rodado */
  driven: boolean;
  points: LngLat[];
  from_id: string;
  to_id: string;
};

export type MapDay = {
  day_id: string;
  date: string;
  /** 0, 1, 2…: "Dia 1" é o índice 0 */
  index: number;
  pins: MapPin[];
  /** as paradas sem coordenada: uma linha abaixo do mapa, com caminho para editar */
  unlocated: Stop[];
  lines: MapLine[];
  /** a rota guardada vale para as paradas de agora */
  routed: boolean;
};

/** O estado de cada parada como na lista do dia; "próxima" só existe no dia de hoje. */
function statuses(day: Pick<TripDay, 'date'>, stops: readonly Stop[], now: Date, today: string) {
  const state = dayState(day, stops, now);
  return (stop: Stop): StopStatus => {
    const s = statusOf(stop, state);
    return s === 'next' && day.date !== today ? 'pending' : s;
  };
}

/** Uma rota guardada só vale se foi feita para as coordenadas de agora (o hash) e tem um trecho por par. */
export function routeFits(
  route: DayRoute | null,
  located: readonly LocatedStop[],
): route is DayRoute {
  return (
    route !== null &&
    located.length >= 2 &&
    route.hash === waypointsHashOf(located) &&
    route.legs.length === located.length - 1 &&
    route.geometry.length >= 2
  );
}

export function mapDay(input: {
  day: Pick<TripDay, 'id' | 'date'>;
  index: number;
  stops: readonly Stop[];
  route: DayRoute | null;
  now: Date;
  today: string;
}): MapDay {
  const active = activeStops(input.stops);
  const statusOfStop = statuses(input.day, active, input.now, input.today);
  const pins = active.flatMap((stop, i): MapPin[] =>
    isLocated(stop) ? [{ stop, number: i + 1, status: statusOfStop(stop) }] : [],
  );
  const located = pins.map((p) => p.stop);
  const routed = routeFits(input.route, located);
  const pieces = routed
    ? splitAtStops(
        input.route?.geometry ?? [],
        located.map((s): LngLat => [s.lng, s.lat]),
      )
    : [];
  const lines: MapLine[] = [];
  for (let k = 0; k < located.length - 1; k++) {
    const from = located[k];
    const to = located[k + 1];
    if (!from || !to) continue;
    const piece = pieces[k];
    lines.push({
      kind: piece && piece.length >= 2 ? 'route' : 'straight',
      driven: from.done_at !== null && to.done_at !== null,
      points:
        piece && piece.length >= 2
          ? piece
          : [
              [from.lng, from.lat],
              [to.lng, to.lat],
            ],
      from_id: from.id,
      to_id: to.id,
    });
  }
  return {
    day_id: input.day.id,
    date: input.day.date,
    index: input.index,
    pins,
    unlocated: active.filter((s) => !isLocated(s)),
    lines,
    routed,
  };
}

export type Bounds = { south: number; west: number; north: number; east: number };

/** Os limites do que está visível: paradas, linhas e a trilha. Nada visível, nada para enquadrar. */
export function boundsOf(points: readonly LngLat[]): Bounds | null {
  let b: Bounds | null = null;
  for (const [lng, lat] of points) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    b = b
      ? {
          south: Math.min(b.south, lat),
          west: Math.min(b.west, lng),
          north: Math.max(b.north, lat),
          east: Math.max(b.east, lng),
        }
      : { south: lat, west: lng, north: lat, east: lng };
  }
  return b;
}

export function visiblePoints(days: readonly MapDay[], track: readonly LngLat[] = []): LngLat[] {
  return [
    ...days.flatMap((d) => [
      ...d.pins.map((p): LngLat => [p.stop.lng, p.stop.lat]),
      ...d.lines.flatMap((l) => l.points),
    ]),
    ...track,
  ];
}

export type LastSeen = { lng: number; lat: number; at: number; user_id: string };

/**
 * Para quem ficou em casa: o último ponto das trilhas de hoje (de quem compartilha a posição). Não é
 * posição ao vivo: muda quando a trilha sincroniza. A hora é a do ponto ("Visto às 14:02").
 */
export function lastSeen(
  tracks: readonly Pick<TripTrack, 'points' | 'user_id'>[],
): LastSeen | null {
  let best: LastSeen | null = null;
  for (const t of tracks) {
    for (const [lng, lat, at] of parseTrackPoints(t.points)) {
      if (!best || at > best.at) best = { lng, lat, at, user_id: t.user_id };
    }
  }
  return best;
}

/** Os pontos de cada trilha, como linha. */
export function trackLines(tracks: readonly Pick<TripTrack, 'points' | 'user_id'>[]) {
  return tracks
    .map((t) => ({
      user_id: t.user_id,
      points: parseTrackPoints(t.points)
        .sort((a, b) => a[2] - b[2])
        .map(([lng, lat]): LngLat => [lng, lat]),
    }))
    .filter((t) => t.points.length >= 2);
}

export type Selection = { kind: 'trip' } | { kind: 'day'; dayId: string };

/**
 * O que o mapa abre: o dia pedido (`?dia=`); senão, durante a viagem, o dia de hoje; antes dela, o
 * primeiro dia; depois dela, a viagem inteira.
 */
export function initialSelection(
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  days: readonly Pick<TripDay, 'id' | 'date'>[],
  today: string,
  asked: string | null,
): Selection {
  if (asked === 'viagem') return { kind: 'trip' };
  if (asked && days.some((d) => d.id === asked)) return { kind: 'day', dayId: asked };
  if (today > trip.end_date || days.length === 0) return { kind: 'trip' };
  const pick = days.find((d) => d.date === today) ?? days[0];
  return pick ? { kind: 'day', dayId: pick.id } : { kind: 'trip' };
}

/** O rótulo da parada na folha: "3ª parada" ou "saída", como a lista diria. */
export function pinRole(pin: Pick<MapPin, 'number' | 'stop'>): string {
  return isDepartureKind(pin.stop.kind) ? 'saída' : `${String(pin.number)}ª parada`;
}
