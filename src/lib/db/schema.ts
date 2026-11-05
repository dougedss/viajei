import Dexie, { type EntityTable } from 'dexie';
import type { Database } from '@/lib/supabase/database.types.ts';
import type { SyncTable } from './registry.ts';

type Tables = Database['public']['Tables'];

/**
 * Linha local: a do servidor sem `field_versions` (as versões por coluna vivem na outbox, até o
 * servidor aceitar) e com `synced_at` nulo enquanto o servidor não a carimbou.
 */
export type LocalRow<T extends { field_versions: unknown; synced_at: string }> = Omit<
  T,
  'field_versions' | 'synced_at'
> & { synced_at: string | null };

export type Trip = LocalRow<Tables['trips']['Row']>;
export type TripMember = LocalRow<Tables['trip_members']['Row']>;
export type Profile = LocalRow<Tables['profiles']['Row']>;
export type TripDay = LocalRow<Tables['trip_days']['Row']>;
export type Stop = LocalRow<Tables['stops']['Row']>;
export type TripTrack = LocalRow<Tables['trip_tracks']['Row']>;

export type RowOf<T extends SyncTable> = {
  trips: Trip;
  trip_members: TripMember;
  trip_days: TripDay;
  stops: Stop;
  trip_tracks: TripTrack;
}[T];

export type OutboxState = 'pending' | 'failed';
export type OutboxOp = {
  seq: number;
  trip_id: string | null;
  table: SyncTable;
  row_id: string;
  op: 'upsert' | 'patch';
  /** só as colunas tocadas (patch) ou todas (upsert); nunca synced_at nem created_at */
  values: Record<string, unknown>;
  /** hora da edição de cada coluna tocada, do client */
  versions: Record<string, string>;
  updated_at: string;
  state: OutboxState;
  attempts: number;
  /** epoch ms a partir do qual pode tentar de novo (backoff); 0 = já */
  next_at: number;
  last_error: string | null;
  created_at: number;
};
export type OutboxInsert = Omit<OutboxOp, 'seq'>;

export type SyncStateEntry = { key: string; value: string };

/** [lng, lat], a ordem do GeoJSON. */
export type LngLat = [number, number];

export type RouteLeg = { distance_m: number; duration_s: number };

/**
 * Rota real de um dia, como veio da Edge Function `route-day`. Cache recalculável, só neste
 * aparelho, nunca sincronizado. `hash` é o das coordenadas que a geraram: só se refaz quando mudam.
 */
export type DayRoute = {
  trip_day_id: string;
  trip_id: string;
  hash: string;
  provider: string;
  fetched_at: string;
  geometry: LngLat[];
  legs: RouteLeg[];
  /** [distância percorrida em m, altitude em m], a cada 2 km */
  elevation: [number, number][];
};

export type GeocodeResult = { name: string; address: string; lat: number; lng: number };
/** Cache das buscas de endereço (Nominatim), por consulta normalizada. */
export type GeocodeEntry = { query: string; results: GeocodeResult[]; fetched_at: string };

/**
 * Dexie é a fonte de verdade da UI. Versão 1 com todas as stores do prompt (seção 5.6, mais
 * `notification_prefs` pela correção C11 e `travel_state` do replay). Versão 2 (fase 3): índice
 * simples `trip_day_id` em `stops`, para a lápide de um dia remover as paradas, e a store
 * `geocode`. Caches recalculáveis (`routes`, `geocode`, `travel_state`, `blobs`, `weather`) nunca
 * sincronizam. A `outbox` nunca é apagada sem ter sido enviada.
 */
export class ViajeiDb extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  trip_members!: EntityTable<TripMember, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  trip_days!: EntityTable<TripDay, 'id'>;
  stops!: EntityTable<Stop, 'id'>;
  trip_tracks!: EntityTable<TripTrack, 'id'>;
  routes!: EntityTable<DayRoute, 'trip_day_id'>;
  geocode!: EntityTable<GeocodeEntry, 'query'>;
  outbox!: EntityTable<OutboxOp, 'seq', OutboxInsert>;
  sync_state!: EntityTable<SyncStateEntry, 'key'>;

  constructor(name = 'viajei') {
    super(name);
    this.version(1).stores({
      trips: 'id',
      trip_members: 'id, trip_id, user_id',
      profiles: 'id',
      trip_days: 'id, trip_id, [trip_id+date]',
      stops: 'id, trip_id, [trip_day_id+position]',
      stop_memories: 'id, trip_id, stop_id',
      reservations: 'id, trip_id, stop_id, trip_day_id',
      attachments: 'id, trip_id, stop_id, reservation_id',
      checklist_items: 'id, trip_id, [trip_id+kind+position], stop_id',
      contacts: 'id, trip_id',
      expenses: 'id, trip_id, stop_id',
      achievements: 'id, user_id',
      xp_events: 'id, user_id, trip_id',
      trip_tracks: 'id, trip_id, trip_day_id',
      notification_prefs: 'id, trip_id',
      routes: 'trip_day_id',
      travel_state: 'trip_day_id',
      blobs: 'attachment_id, last_used_at',
      weather: 'trip_day_id',
      outbox: '++seq, trip_id, [table+row_id], state',
      sync_state: 'key',
    });
    this.version(2).stores({
      stops: 'id, trip_id, trip_day_id, [trip_day_id+position]',
      geocode: 'query',
    });
  }

  /** A tabela de uma linha sincronizada, pelo nome (tipada por `RowOf`). */
  syncTable<T extends SyncTable>(table: T): EntityTable<RowOf<T>, 'id'> {
    return this.table(table);
  }
}

export const db = new ViajeiDb();

/** Chaves de `sync_state`. */
export const syncKeys = {
  /** usuário dono dos dados locais; outro usuário ao entrar zera o banco */
  uid: 'uid',
  userCursor: 'cursor:user',
  tripCursor: (tripId: string) => `cursor:trip:${tripId}`,
} as const;
