import {
  isDepartureKind,
  isValidXp,
  XP_POINTS,
  type AchievementKey,
  type XpKind,
} from '@shared/constants.ts';
import { activeStops, isLocated } from '@/features/itinerary/rules.ts';
import { toCents } from '@/features/expenses/rules.ts';
import { parseTrackPoints } from '@/features/travel-mode/track.ts';
import type {
  Attachment,
  ChecklistItem,
  DayRoute,
  Expense,
  Reservation,
  Stop,
  StopMemory,
  Trip,
  TripDay,
  TripMember,
  TripTrack,
} from '@/lib/db/schema.ts';
import { ARRIVAL_RADIUS_M, DEPARTURE_RADIUS_M, isWithin } from '@/lib/geo/geofence.ts';
import { isoToWall, wallToInstant } from '@/lib/time/zone.ts';

/**
 * As regras de XP e conquistas, puras. Recebem o retrato do que o aparelho sabe e a pessoa, e
 * devolvem o conjunto inteiro a que ela tem direito, sempre o mesmo para os mesmos dados. O motor
 * (`engine.ts`) compara com o que já está gravado e grava só o que falta, com id determinístico:
 * por isso desmarcar não tira XP e remarcar não dá de novo, sem código especial (somente-anexar).
 *
 * "O time" são os membros aceitos da viagem: cada aparelho deriva o fato do estado compartilhado e
 * grava o da própria pessoa, porque a policy só deixa cada um gravar o seu. Quem entrou depois leva
 * o que já tinha acontecido (D115): a equipe conquista junto e não há ranking.
 *
 * `unlocked_at` é a hora do fato (o `done_at` da parada, a hora do envio, a hora da saída), nunca a
 * da derivação: o filme e o perfil contam quando aconteceu.
 */

/** O que o aparelho sabe, lido do Dexie (o motor monta; os testes, à mão). */
export type ProgressSnapshot = {
  uid: string;
  /** agora, em ms: decide "a viagem já terminou" e "o dia já passou" (no fuso de São Paulo) */
  now: number;
  trips: readonly Trip[];
  members: readonly TripMember[];
  days: readonly TripDay[];
  stops: readonly Stop[];
  memories: readonly StopMemory[];
  attachments: readonly Attachment[];
  items: readonly ChecklistItem[];
  expenses: readonly Expense[];
  reservations: readonly Reservation[];
  tracks: readonly TripTrack[];
  routes: readonly DayRoute[];
  /** a primeira escrita feita sem sinal que o servidor aceitou (a marca da outbox) */
  offlineSynced: { at: string; trip_id: string } | null;
  /** os roteiros importados com a IA, um por viagem, pela hora da importação (`importsOf`) */
  imports: readonly { trip_id: string; at: string }[];
  /** distância até a costa em metros (lib/geo, carregada sob demanda); sem ela, `coast` espera */
  coastDistance: ((lng: number, lat: number) => number) | null;
};

export type XpGrant = { kind: XpKind; ref_id: string; points: number; trip_id: string };
export type AchievementGrant = {
  key: AchievementKey;
  trip_id: string | null;
  unlocked_at: string;
};
export type Progress = { xp: XpGrant[]; achievements: AchievementGrant[] };

/**
 * Os roteiros importados com a IA (fase 10): a parada com `source = 'ai'` mais antiga de cada
 * viagem marca a hora da importação. O fato sincroniza com as próprias paradas e se lê sem sinal; a
 * equipe conquista junto (D115), como a primeira parada concluída: quem importou e quem viaja junto.
 * Uma parada importada que depois saiu do roteiro continua contando enquanto o aparelho a conhece.
 */
export function importsOf(
  stops: readonly Pick<Stop, 'trip_id' | 'source' | 'created_at'>[],
): { trip_id: string; at: string }[] {
  const first = new Map<string, string>();
  for (const s of stops) {
    if (s.source !== 'ai') continue;
    const seen = first.get(s.trip_id);
    if (seen === undefined || s.created_at < seen) first.set(s.trip_id, s.created_at);
  }
  return [...first]
    .map(([trip_id, at]) => ({ trip_id, at }))
    .sort((a, b) => byTime(a.at, b.at) || byTime(a.trip_id, b.trip_id));
}

// ------------------------------------------------------------------ limiares
/** Partiu! até 5 min depois do "sair às" é pontual; antes da hora também (nada premia velocidade). */
export const ON_TIME_GRACE_MS = 5 * 60_000;
/** Madrugador: saída antes das 7h, na hora de parede de São Paulo. */
export const EARLY_BEFORE = '07:00';
export const ON_TIME_STREAK = 3;
export const NATURE_COUNT = 3;
export const WINERY_SAME_DAY = 2;
export const PHOTO_STOPS = 5;
/**
 * Pé na areia: a costa embutida erra de 1 a 2 km, então o app só afirma o mar a 3 km (o mesmo
 * `SEA_NEAR_M` das curiosidades). "A menos de 1 km" não se afirma com esse dado (D116).
 */
export const COAST_NEAR_M = 3_000;
export const DOWNHILL_M = 500;
/** A saída vista pela trilha só vale perto do toque: até 60 min antes ou depois. */
export const TRACK_EXIT_WINDOW_MS = 60 * 60_000;

// ------------------------------------------------------------------ o que vale
function byTime(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Hoje, no fuso de São Paulo, como 'yyyy-MM-dd'. */
export function todayInTripZone(now: number): string {
  return isoToWall(iso(now)).date;
}

function nextDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Viagem concluída: o último dia já passou, no fuso de São Paulo, e ela tem pelo menos uma parada
 * concluída. É o mesmo momento do aviso `retro_ready`, e o gasto lançado ao chegar em casa ainda
 * conta. Viagem que não aconteceu não conclui.
 */
export function isTripConcluded(
  trip: Pick<Trip, 'end_date'>,
  stops: readonly Pick<Stop, 'done_at' | 'deleted_at'>[],
  now: number,
): boolean {
  return (
    todayInTripZone(now) > trip.end_date && stops.some((s) => s.deleted_at === null && s.done_at)
  );
}

/** O instante em que a viagem conta como concluída: 0h do dia seguinte ao fim, em São Paulo. */
export function concludedAt(trip: Pick<Trip, 'end_date'>): string {
  return iso(wallToInstant(nextDate(trip.end_date), '00:00'));
}

type TripData = {
  trip: Trip;
  days: { day: TripDay; stops: Stop[] }[];
  stops: Stop[];
};

/** As viagens vivas em que a pessoa é membro aceito, com os dias em ordem e as paradas ativas. */
function memberTrips(s: ProgressSnapshot): TripData[] {
  const mine = new Set(
    s.members
      .filter((m) => m.user_id === s.uid && m.status === 'accepted' && m.deleted_at === null)
      .map((m) => m.trip_id),
  );
  const stopsByDay = new Map<string, Stop[]>();
  for (const st of s.stops) {
    if (st.deleted_at !== null) continue;
    const list = stopsByDay.get(st.trip_day_id) ?? [];
    list.push(st);
    stopsByDay.set(st.trip_day_id, list);
  }
  return s.trips
    .filter((t) => t.deleted_at === null && mine.has(t.id))
    .map((trip) => {
      const days = s.days
        .filter((d) => d.trip_id === trip.id && d.deleted_at === null)
        .sort((a, b) => byTime(a.date, b.date))
        .map((day) => ({ day, stops: activeStops(stopsByDay.get(day.id) ?? []) }));
      return { trip, days, stops: days.flatMap((d) => d.stops) };
    });
}

// ------------------------------------------------------------------ as saídas
export type Departure = {
  stop: Stop;
  trip_id: string;
  day: TripDay;
  /** a hora efetiva da saída, em ms: a da trilha quando ela viu o carro sair, senão o toque */
  at: number;
  /** o "sair às" da saída, em ms; null quando não há horário para comparar (saída neutra) */
  target: number | null;
};

type TrackPoint = [number, number, number];

/** As trilhas que a pessoa pode ver: a própria e as de quem compartilha a posição (D23). */
function visibleTracks(s: ProgressSnapshot): TripTrack[] {
  const hidden = new Set(
    s.members
      .filter((m) => m.user_id && m.user_id !== s.uid && !m.share_position)
      .map((m) => `${m.trip_id}:${m.user_id ?? ''}`),
  );
  return s.tracks.filter((t) => !hidden.has(`${t.trip_id}:${t.user_id}`));
}

/**
 * O instante em que a trilha mostra o carro saindo da parada: uma leitura a até 150 m dela e, depois,
 * a primeira a mais de 300 m (o critério do modo painel, D47). Entre as saídas achadas, a mais perto
 * do toque, até 60 min de distância. `null` sem trilha ou sem coordenada.
 */
export function trackExit(
  stop: Stop,
  tracks: readonly { points: unknown }[],
  near: number,
): number | null {
  if (!isLocated(stop)) return null;
  let best: number | null = null;
  for (const track of tracks) {
    const points: TrackPoint[] = [...parseTrackPoints(track.points)].sort((a, b) => a[2] - b[2]);
    let inside = false;
    for (const [lng, lat, t] of points) {
      const p = { lng, lat };
      if (isWithin(p, stop, ARRIVAL_RADIUS_M)) inside = true;
      else if (inside && !isWithin(p, stop, DEPARTURE_RADIUS_M)) {
        inside = false;
        const ms = t * 1000;
        if (Math.abs(ms - near) > TRACK_EXIT_WINDOW_MS) continue;
        if (best === null || Math.abs(ms - near) < Math.abs(best - near)) best = ms;
      }
    }
  }
  return best;
}

/**
 * As saídas de uma viagem, na ordem do tempo. Uma saída é uma parada com `departed_at`. O nó de
 * saída (origem, deslocamento) só conta como saída própria quando é o começo: nenhuma parada antes
 * dele no dia saiu. "Hotel → Saída para Montenegro" é uma saída só, a do hotel, gravada no mesmo
 * toque; "Chegada em Papanduva", marcada pelo Partiu! com o carro já na estrada, não é saída.
 *
 * O "sair às" é a mesma conta do "Agora" (D29): numa parada comum, o horário da próxima não pulada
 * menos o deslocamento; num nó de saída, o horário dele. Todo caminho que grava `departed_at` (o
 * botão, o Partiu! da notificação, o modo painel) grava a hora real do toque ou da leitura; o
 * catch-up nunca grava saída. Quando a trilha viu o carro sair, a hora dela vale mais que o toque.
 */
export function departures(trip: TripData, tracks: readonly TripTrack[]): Departure[] {
  const out: Departure[] = [];
  for (const { day, stops } of trip.days) {
    const dayTracks = tracks.filter((t) => t.trip_day_id === day.id);
    stops.forEach((stop, i) => {
      if (!stop.departed_at) return;
      const node = isDepartureKind(stop.kind);
      if (node && stops.slice(0, i).some((p) => p.departed_at !== null)) return;
      let target: number | null = null;
      if (node) {
        target = stop.time ? wallToInstant(day.date, stop.time.slice(0, 5)) : null;
      } else {
        const next = stops.slice(i + 1).find((n) => !n.skipped);
        if (next?.time && stop.travel_minutes_to_next !== null) {
          target =
            wallToInstant(day.date, next.time.slice(0, 5)) - stop.travel_minutes_to_next * 60_000;
        } else if (next?.time && isDepartureKind(next.kind)) {
          // sem deslocamento informado, o "Agora" mostra o horário do nó de saída como "sair às"
          target = wallToInstant(day.date, next.time.slice(0, 5));
        }
      }
      const tapped = Date.parse(stop.departed_at);
      const at = trackExit(stop, dayTracks, tapped) ?? tapped;
      out.push({ stop, trip_id: trip.trip.id, day, at, target });
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Pontual: até 5 min depois do "sair às". Sem "sair às", neutra (null): não conta nem quebra. */
export function isOnTime(d: Pick<Departure, 'at' | 'target'>): boolean | null {
  if (d.target === null) return null;
  return d.at <= d.target + ON_TIME_GRACE_MS;
}

// ------------------------------------------------------------------ helpers de contagem
function isPhoto(a: Attachment, uid: string): a is Attachment & { stop_id: string } {
  return a.kind === 'photo' && a.stop_id !== null && a.deleted_at === null && a.created_by === uid;
}

function isActiveItem(i: ChecklistItem): boolean {
  return i.status === 'active' && i.deleted_at === null;
}

/** A primeira (mais cedo) entre as candidatas; empate pela viagem, para ser determinístico. */
function earliest(
  list: readonly { at: string; trip_id: string | null }[],
): { at: string; trip_id: string | null } | null {
  let best: { at: string; trip_id: string | null } | null = null;
  for (const c of list) {
    if (!best || c.at < best.at || (c.at === best.at && (c.trip_id ?? '') < (best.trip_id ?? ''))) {
      best = c;
    }
  }
  return best;
}

/** O n-ésimo (1-based) em ordem de tempo. */
function nth<T extends { at: string }>(list: readonly T[], n: number): T | null {
  return [...list].sort((a, b) => byTime(a.at, b.at))[n - 1] ?? null;
}

/** Um dia terminado: nenhuma parada pendente (todas concluídas ou puladas), ou a data já passou. */
function dayFinished(day: TripDay, stops: readonly Stop[], today: string): boolean {
  return day.date < today || stops.every((s) => s.done_at !== null || s.skipped);
}

/**
 * A maior queda de altitude nos trechos rodados de um dia: do ponto mais alto ao mais baixo depois
 * dele, dentro de cada sequência de trechos entre paradas concluídas (com coordenada). Devolve a
 * queda em metros e a parada que fecha o trecho onde está o ponto mais baixo (a chegada lá embaixo).
 */
export function maxDescent(
  stops: readonly Stop[],
  route: Pick<DayRoute, 'legs' | 'elevation'> | null,
): { drop: number; until: Stop } | null {
  if (!route) return null;
  const wps = stops.filter(isLocated);
  if (wps.length < 2 || route.legs.length !== wps.length - 1) return null;
  const bounds: number[] = [0];
  for (const leg of route.legs) bounds.push((bounds.at(-1) ?? 0) + leg.distance_m);
  let best: { drop: number; until: Stop } | null = null;
  let k = 0;
  while (k < wps.length - 1) {
    // uma sequência de trechos rodados: as duas pontas de cada trecho concluídas
    if (!wps[k]?.done_at || !wps[k + 1]?.done_at) {
      k++;
      continue;
    }
    let end = k;
    while (end < wps.length - 1 && wps[end]?.done_at && wps[end + 1]?.done_at) end++;
    const from = bounds[k] ?? 0;
    const to = bounds[end] ?? 0;
    let peak = -Infinity;
    for (const [dist, alt] of route.elevation) {
      if (dist < from || dist > to) continue;
      peak = Math.max(peak, alt);
      const drop = peak - alt;
      if (drop > (best?.drop ?? 0)) {
        // a parada que fecha o trecho onde está este ponto
        let leg = k;
        while (leg < end - 1 && dist > (bounds[leg + 1] ?? 0)) leg++;
        const until = wps[leg + 1];
        if (until) best = { drop, until };
      }
    }
    k = end;
  }
  return best;
}

// ------------------------------------------------------------------ a derivação
export function deriveProgress(s: ProgressSnapshot): Progress {
  const trips = memberTrips(s);
  const tripIds = new Set(trips.map((t) => t.trip.id));
  const today = todayInTripZone(s.now);
  const tracks = visibleTracks(s).filter((t) => tripIds.has(t.trip_id));
  const xp: XpGrant[] = [];
  const add = (kind: XpKind, ref_id: string, trip_id: string, points?: number) => {
    const fixed = XP_POINTS[kind];
    const p = points ?? (typeof fixed === 'number' ? fixed : fixed.min);
    if (isValidXp(kind, p)) xp.push({ kind, ref_id, points: p, trip_id });
  };
  const ach = new Map<AchievementKey, { at: string; trip_id: string | null }>();
  const unlock = (key: AchievementKey, c: { at: string; trip_id: string | null } | null) => {
    if (c) ach.set(key, c);
  };

  const allDone: { stop: Stop; trip_id: string; at: string }[] = [];
  const allDepartures: (Departure & { onTime: boolean | null })[] = [];
  const onTimeStreaks: { at: string; trip_id: string }[] = [];
  const winery: { at: string; trip_id: string }[] = [];
  const ready: { at: string; trip_id: string }[] = [];
  const budget: { at: string; trip_id: string }[] = [];
  const chronicler: { at: string; trip_id: string }[] = [];
  const tripDone: { at: string; trip_id: string }[] = [];
  const team: { at: string; trip_id: string }[] = [];
  const downhill: { at: string; trip_id: string }[] = [];

  for (const t of trips) {
    const tripId = t.trip.id;
    // paradas concluídas
    for (const stop of t.stops) {
      if (!stop.done_at) continue;
      add('stop_done', stop.id, tripId);
      allDone.push({ stop, trip_id: tripId, at: stop.done_at });
    }
    // saídas pontuais e a sequência de três
    let streak = 0;
    let streakDone = false;
    for (const d of departures(t, tracks)) {
      const onTime = isOnTime(d);
      allDepartures.push({ ...d, onTime });
      if (onTime === true) add('departure_on_time', d.stop.id, tripId);
      if (onTime === null || streakDone) continue;
      streak = onTime ? streak + 1 : 0;
      if (streak >= ON_TIME_STREAK) {
        onTimeStreaks.push({ at: iso(d.at), trip_id: tripId });
        streakDone = true;
      }
    }
    // duas vinícolas no mesmo dia
    for (const { stops } of t.days) {
      const done = stops
        .filter((st) => st.kind === 'winery' && st.done_at)
        .map((st) => ({ at: st.done_at ?? '', trip_id: tripId }));
      const second = nth(done, WINERY_SAME_DAY);
      if (second) winery.push(second);
    }
    // listas
    const items = s.items.filter((i) => i.trip_id === tripId && isActiveItem(i));
    const before = items.filter((i) => i.kind === 'before');
    const pack = items.filter((i) => i.kind === 'pack');
    for (const [kind, list] of [
      ['before', before],
      ['pack', pack],
    ] as const) {
      if (list.length > 0 && list.every((i) => i.done_at)) {
        add('checklist_complete', `${tripId}:${kind}`, tripId);
      }
    }
    const start = wallToInstant(t.trip.start_date, '00:00');
    const lists = [...before, ...pack];
    if (
      before.length > 0 &&
      pack.length > 0 &&
      lists.every((i) => i.done_at && Date.parse(i.done_at) < start)
    ) {
      ready.push({
        at:
          lists
            .map((i) => i.done_at ?? '')
            .sort(byTime)
            .at(-1) ?? '',
        trip_id: tripId,
      });
    }
    for (const item of items) {
      if (!item.done_at) continue;
      if (item.kind === 'quest') add('quest_done', item.id, tripId, item.points);
      else if (item.done_by === s.uid) add('checklist_item', item.id, tripId);
    }
    // viagem concluída e orçamento
    if (isTripConcluded(t.trip, t.stops, s.now)) {
      add('trip_completed', tripId, tripId);
      const spent = s.expenses.filter((e) => e.trip_id === tripId && e.deleted_at === null);
      const cents = spent.reduce((acc, e) => acc + toCents(e.amount), 0);
      if (
        t.trip.budget !== null &&
        t.trip.budget > 0 &&
        spent.length > 0 &&
        cents <= toCents(t.trip.budget)
      ) {
        budget.push({ at: concludedAt(t.trip), trip_id: tripId });
      }
    }
    // todas as paradas avaliadas num dia terminado (as de saída nunca pedem nota)
    for (const { day, stops } of t.days) {
      const rated = stops.filter((st) => st.done_at && !isDepartureKind(st.kind));
      if (rated.length === 0 || !dayFinished(day, stops, today)) continue;
      const mine = rated.map((st) =>
        s.memories.find((m) => m.stop_id === st.id && m.user_id === s.uid && m.rating !== null),
      );
      if (mine.every((m) => m !== undefined)) {
        const last =
          mine
            .map((m) => m.updated_at)
            .sort(byTime)
            .at(-1) ?? '';
        chronicler.push({ at: last, trip_id: tripId });
      }
    }
    // nenhuma parada pendente (pulada não impede, D115) e pelo menos uma concluída
    const done = t.stops.filter((st) => st.done_at);
    if (done.length > 0 && t.stops.every((st) => st.done_at !== null || st.skipped)) {
      tripDone.push({
        at:
          done
            .map((st) => st.done_at ?? '')
            .sort(byTime)
            .at(-1) ?? '',
        trip_id: tripId,
      });
    }
    // equipe: outro membro aceito na mesma viagem (vale para os dois lados)
    const accepted = s.members.filter(
      (m) => m.trip_id === tripId && m.status === 'accepted' && m.deleted_at === null && m.user_id,
    );
    const me = accepted.find((m) => m.user_id === s.uid);
    const others = accepted.filter((m) => m.user_id !== s.uid).map((m) => m.updated_at);
    if (me && others.length > 0) {
      const first = others.sort(byTime)[0] ?? me.updated_at;
      team.push({ at: first > me.updated_at ? first : me.updated_at, trip_id: tripId });
    }
    // serra abaixo, pela rota guardada de cada dia (sem rota, espera)
    for (const { day, stops } of t.days) {
      const route = s.routes.find((r) => r.trip_day_id === day.id) ?? null;
      const descent = maxDescent(stops, route);
      if (descent && descent.drop >= DOWNHILL_M && descent.until.done_at) {
        downhill.push({ at: descent.until.done_at, trip_id: tripId });
      }
    }
  }

  // pessoais: memórias, fotos, gastos e reservas de quem fez
  const photoStops = new Map<string, { at: string; trip_id: string }>();
  for (const a of s.attachments) {
    if (!isPhoto(a, s.uid) || !tripIds.has(a.trip_id)) continue;
    const prev = photoStops.get(a.stop_id);
    if (!prev || a.created_at < prev.at)
      photoStops.set(a.stop_id, { at: a.created_at, trip_id: a.trip_id });
  }
  const liveStops = new Set(trips.flatMap((t) => t.stops.map((st) => st.id)));
  for (const [stopId, p] of photoStops) {
    if (liveStops.has(stopId)) add('memory_photo', stopId, p.trip_id);
  }
  for (const m of s.memories) {
    if (m.user_id === s.uid && m.rating !== null && liveStops.has(m.stop_id)) {
      add('memory_rating', m.stop_id, m.trip_id);
    }
  }
  for (const e of s.expenses) {
    if (e.deleted_at === null && e.created_by === s.uid && tripIds.has(e.trip_id)) {
      add('expense_logged', e.id, e.trip_id);
    }
  }
  for (const r of s.reservations) {
    if (r.deleted_at === null && r.created_by === s.uid && tripIds.has(r.trip_id)) {
      add('reservation_added', r.id, r.trip_id);
    }
  }

  // conquistas
  unlock('first_stop', earliest(allDone.map((d) => ({ at: d.at, trip_id: d.trip_id }))));
  unlock(
    'early_bird',
    earliest(
      allDepartures
        .filter((d) => isoToWall(iso(d.at)).time < EARLY_BEFORE)
        .map((d) => ({ at: iso(d.at), trip_id: d.trip_id })),
    ),
  );
  unlock('on_time_3', earliest(onTimeStreaks));
  unlock(
    'nature_3',
    nth(
      allDone
        .filter((d) => d.stop.kind === 'nature')
        .map((d) => ({ at: d.at, trip_id: d.trip_id })),
      NATURE_COUNT,
    ),
  );
  unlock('winery_2', earliest(winery));
  if (s.offlineSynced) {
    const { at, trip_id } = s.offlineSynced;
    unlock('offline_hero', { at, trip_id: tripIds.has(trip_id) ? trip_id : null });
  }
  unlock('ready_to_go', earliest(ready));
  unlock('on_budget', earliest(budget));
  unlock('photographer', nth([...photoStops.values()], PHOTO_STOPS));
  unlock('chronicler', earliest(chronicler));
  unlock('trip_done', earliest(tripDone));
  unlock('team', earliest(team));
  unlock(
    'planner',
    earliest(
      s.imports.map((i) => ({ at: i.at, trip_id: tripIds.has(i.trip_id) ? i.trip_id : null })),
    ),
  );
  if (s.coastDistance) {
    const near = s.coastDistance;
    const hits: { at: string; trip_id: string }[] = [];
    for (const track of tracks) {
      const first = parseTrackPoints(track.points)
        .filter(([lng, lat]) => near(lng, lat) <= COAST_NEAR_M)
        .sort((a, b) => a[2] - b[2])[0];
      if (first) hits.push({ at: iso(first[2] * 1000), trip_id: track.trip_id });
    }
    unlock('coast', earliest(hits));
  }
  unlock('downhill', earliest(downhill));

  const achievements = [...ach.entries()]
    .map(([key, c]) => ({ key, trip_id: c.trip_id, unlocked_at: c.at }))
    .sort((a, b) => byTime(a.key, b.key));
  xp.sort((a, b) => byTime(`${a.kind}:${a.ref_id}`, `${b.kind}:${b.ref_id}`));
  return { xp, achievements };
}

/** O XP total de uma lista de eventos. */
export function totalXp(events: readonly { points: number }[]): number {
  return events.reduce((acc, e) => acc + e.points, 0);
}
