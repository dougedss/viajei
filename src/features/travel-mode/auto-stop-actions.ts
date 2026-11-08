import { connectivity } from '@/lib/db/connectivity.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Stop } from '@/lib/db/schema.ts';
import { reverseGeocode } from '@/lib/geocode/nominatim.ts';
import { placeFromReverse, provisionalName, type AutoPlace } from './auto-place.ts';
import {
  autoStopId,
  autoStopPosition,
  duplicatesToRemove,
  knownAutoStops,
  sameAutoStop,
} from './auto-stop.ts';
import {
  SAME_PLACE_MS,
  type DetectorEvent,
  type KnownAutoStop,
  type Place,
} from './stop-detector.ts';

/**
 * As escritas da parada que se registra sozinha (fase 15), todas pela `mutate` (offline primeiro):
 * registrar com o lugar do OSM ou o nome pela hora, fechar com a saída medida, dar o nome quando a
 * rede voltar, desfazer, e tirar a duplicada da corrida rara entre dois celulares.
 */
export type AutoStopStart = Extract<DetectorEvent, { kind: 'start' }>;

/** Quanto se espera o OSM na hora de registrar; depois disso, o nome pela hora e a fila. */
export const LOOKUP_TIMEOUT_MS = 6_000;

/** As chaves em `sync_state`: o nome que falta e os lugares desfeitos no dia (por aparelho). */
export const autoKeys = {
  naming: (stopId: string) => `auto:name:${stopId}`,
  namingPrefix: 'auto:name:',
  undone: (dayId: string) => `auto:undone:${dayId}`,
} as const;

/** O que a fila do nome guarda: o lugar e o nome provisório que a parada tinha ao nascer. */
export type PendingName = { lat: number; lng: number; name: string };

export type Lookup = (center: Place) => Promise<{ place: AutoPlace | null; answered: boolean }>;

/**
 * O lugar pelo OSM, com prazo. `answered` diz se o OSM respondeu (mesmo sem nada ali): sem rede, com
 * erro ou devagar demais, a parada nasce com o nome pela hora e entra na fila do nome.
 */
export const lookupPlace: Lookup = async (center) => {
  if (!connectivity.isOnline()) return { place: null, answered: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const row = await reverseGeocode(center.lat, center.lng, controller.signal);
    return { place: placeFromReverse(row, center), answered: true };
  } catch {
    return { place: null, answered: false };
  } finally {
    clearTimeout(timer);
  }
};

async function dayStops(dayId: string): Promise<Stop[]> {
  return db.stops
    .where('trip_day_id')
    .equals(dayId)
    .filter((s) => s.deleted_at === null)
    .toArray();
}

/** A parada do time que já é esta (pelo sync, ou a mesma linha que outro celular já gravou aqui). */
async function existing(dayId: string, start: AutoStopStart, id: string): Promise<Stop | null> {
  const stops = await dayStops(dayId);
  const candidate: KnownAutoStop = { ...start.center, from: start.arrivedAt, to: null };
  const same = knownAutoStops(stops).find((k) => sameAutoStop(k, candidate));
  return same?.stop ?? stops.find((s) => s.id === id) ?? null;
}

export type Registered =
  /** nasceu aqui: o toast com Desfazer */
  | { kind: 'created'; stop: Stop; undo: () => Promise<void> }
  /** já existia (outro celular do carro): nada na tela, mas a saída medida aqui também vale */
  | { kind: 'existing'; stop: Stop };

export async function registerAutoStop(input: {
  tripId: string;
  dayId: string;
  uid: string;
  start: AutoStopStart;
  lookup?: Lookup;
}): Promise<Registered> {
  const { tripId, dayId, uid, start } = input;
  const id = await autoStopId(dayId, start.center, start.arrivedAt);
  const before = await existing(dayId, start, id);
  if (before) return { kind: 'existing', stop: before };
  const { place, answered } = await (input.lookup ?? lookupPlace)(start.center);
  // o OSM levou uns segundos: a do outro celular pode ter chegado nesse meio tempo
  const after = await existing(dayId, start, id);
  if (after) return { kind: 'existing', stop: after };

  const arrivedIso = new Date(start.arrivedAt).toISOString();
  const name = place?.name ?? provisionalName(start.arrivedAt);
  const now = new Date().toISOString();
  const row: Omit<Stop, 'synced_at'> = {
    id,
    trip_id: tripId,
    trip_day_id: dayId,
    position: autoStopPosition(await dayStops(dayId), start.arrivedAt),
    kind: place?.kind ?? 'other',
    name,
    time: null,
    closes_at: null,
    address: place?.address ?? null,
    lat: start.center.lat,
    lng: start.center.lng,
    travel_minutes_to_next: null,
    notes: null,
    url: null,
    departed_at: null,
    done_at: arrivedIso,
    done_by: uid,
    skipped: false,
    source: 'auto',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await mutate.insert('stops', row);
  const stop: Stop = { ...row, synced_at: null };
  if (!answered) {
    const pending: PendingName = { lat: start.center.lat, lng: start.center.lng, name };
    await db.sync_state.put({ key: autoKeys.naming(id), value: JSON.stringify(pending) });
  }
  return {
    kind: 'created',
    stop,
    undo: () => undoAutoStop(dayId, stop),
  };
}

/** Os lugares desfeitos neste aparelho nas últimas 2 h: o detector não registra de novo ali. */
export function parseUndone(value: string | undefined, now: number): KnownAutoStop[] {
  if (!value) return [];
  try {
    const list = JSON.parse(value) as KnownAutoStop[];
    return list.filter((k) => now - (k.to ?? now) < SAME_PLACE_MS);
  } catch {
    return [];
  }
}

/** Desfazer: a parada sai (uma lápide, como qualquer exclusão), e o lugar fica lembrado por 2 h. */
async function undoAutoStop(dayId: string, stop: Stop): Promise<void> {
  await mutate.remove('stops', stop.id);
  await db.sync_state.delete(autoKeys.naming(stop.id));
  const now = Date.now();
  const key = autoKeys.undone(dayId);
  const kept = parseUndone((await db.sync_state.get(key))?.value, now);
  if (stop.lat === null || stop.lng === null || !stop.done_at) return;
  const entry: KnownAutoStop = {
    lat: stop.lat,
    lng: stop.lng,
    from: Date.parse(stop.done_at),
    to: now,
  };
  await db.sync_state.put({ key, value: JSON.stringify([...kept, entry]) });
}

/** A saída medida: só se a parada ainda está aberta (um Partiu! tocado já gravou a hora do toque). */
export async function endAutoStop(stopId: string, leftAt: number): Promise<void> {
  const stop = await db.stops.get(stopId);
  if (stop?.deleted_at !== null || stop.departed_at !== null) return;
  if (stop.done_at && leftAt <= Date.parse(stop.done_at)) return;
  await mutate.patch('stops', stopId, { departed_at: new Date(leftAt).toISOString() });
}

/**
 * O nome que faltava, quando a rede voltou: uma chamada ao OSM pela fila, e um patch normal pela
 * outbox, só se a parada ainda tem o nome com que nasceu (ninguém a renomeou e o outro celular não
 * deu nome antes). O tipo só muda se ainda é Outro. Sem rede ou com erro, fica na fila.
 */
export async function nameAutoStop(stopId: string, pending: PendingName): Promise<void> {
  const stop = await db.stops.get(stopId);
  if (stop?.deleted_at !== null || stop.name !== pending.name) {
    await db.sync_state.delete(autoKeys.naming(stopId));
    return;
  }
  const row = await reverseGeocode(pending.lat, pending.lng);
  const place = placeFromReverse(row, { lat: pending.lat, lng: pending.lng });
  const fresh = await db.stops.get(stopId);
  if (place && fresh?.deleted_at === null && fresh.name === pending.name) {
    await mutate.patch('stops', stopId, {
      name: place.name,
      kind: fresh.kind === 'other' ? place.kind : fresh.kind,
      address: fresh.address ?? place.address,
    });
  }
  await db.sync_state.delete(autoKeys.naming(stopId));
}

/** A fila do nome, uma por vez, na ordem em que as paradas nasceram. */
export async function pendingNames(): Promise<[string, PendingName][]> {
  const rows = await db.sync_state.where('key').startsWith(autoKeys.namingPrefix).toArray();
  return rows.flatMap((r) => {
    try {
      return [[r.key.slice(autoKeys.namingPrefix.length), JSON.parse(r.value) as PendingName]];
    } catch {
      return [];
    }
  });
}

/** Tira as duplicadas da corrida rara (as deste aparelho, sem memória de ninguém). */
export async function removeDuplicateAutoStops(dayId: string, uid: string): Promise<void> {
  const stops = await dayStops(dayId);
  if (stops.filter((s) => s.source === 'auto').length < 2) return;
  const memories = await db.stop_memories
    .where('stop_id')
    .anyOf(stops.map((s) => s.id))
    .filter((m) => m.deleted_at === null)
    .toArray();
  const withMemory = new Set(memories.map((m) => m.stop_id));
  for (const id of duplicatesToRemove(stops, { uid, withMemory })) {
    await mutate.remove('stops', id);
    await db.sync_state.delete(autoKeys.naming(id));
  }
}
