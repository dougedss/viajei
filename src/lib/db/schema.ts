import Dexie, { type EntityTable } from 'dexie';
import type { Place } from '@shared/places-schema.ts';
import type { Merchant } from '@/lib/nfce/cnpj.ts';
import type { DayWeather, HourWeather } from '@shared/weather.ts';
import type { Database, Json } from '@/lib/supabase/database.types.ts';
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

/**
 * A viagem no aparelho. As colunas `car_*` ainda existem no banco (um PWA antigo em cache pode
 * gravá-las; uma migration depois as tira), mas o carro é da pessoa desde a fase 16: o client novo
 * não as lê nem as escreve, e o tipo não as tem.
 */
export type Trip = LocalRow<
  Omit<Tables['trips']['Row'], 'car_model' | 'car_color' | 'car_accessories'>
>;
export type TripMember = LocalRow<Tables['trip_members']['Row']>;
export type Profile = LocalRow<Tables['profiles']['Row']>;
export type TripDay = LocalRow<Tables['trip_days']['Row']>;
export type Stop = LocalRow<Tables['stops']['Row']>;
export type TripTrack = LocalRow<Tables['trip_tracks']['Row']>;
export type NotificationPref = LocalRow<Tables['notification_prefs']['Row']>;
export type InboxAddress = LocalRow<Tables['inbox_addresses']['Row']>;
export type ReceivedReservation = LocalRow<Tables['received_reservations']['Row']>;
export type Reservation = LocalRow<Tables['reservations']['Row']>;
export type StopMemory = LocalRow<Tables['stop_memories']['Row']>;
export type Attachment = LocalRow<Tables['attachments']['Row']>;
export type ChecklistItem = LocalRow<Tables['checklist_items']['Row']>;
export type Contact = LocalRow<Tables['contacts']['Row']>;
export type Expense = LocalRow<Tables['expenses']['Row']>;

/**
 * Linha somente-anexar (conquistas e XP): não tem `field_versions` nem `updated_at` no banco, porque
 * nunca é editada; o id determinístico é o que faz duas escritas do mesmo fato caírem na mesma linha.
 */
export type AppendRow<T extends { synced_at: string }> = Omit<T, 'synced_at'> & {
  synced_at: string | null;
};
export type Achievement = AppendRow<Tables['achievements']['Row']>;
export type XpEvent = AppendRow<Tables['xp_events']['Row']>;

export type RowOf<T extends SyncTable> = {
  profiles: Profile;
  trips: Trip;
  trip_members: TripMember;
  trip_days: TripDay;
  stops: Stop;
  trip_tracks: TripTrack;
  notification_prefs: NotificationPref;
  inbox_addresses: InboxAddress;
  received_reservations: ReceivedReservation;
  reservations: Reservation;
  stop_memories: StopMemory;
  attachments: Attachment;
  checklist_items: ChecklistItem;
  contacts: Contact;
  expenses: Expense;
  achievements: Achievement;
  xp_events: XpEvent;
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
  /**
   * A escrita nasceu sem sinal (a conectividade do app dizia offline no momento da `mutate`). Quando
   * uma operação assim é aceita pelo servidor, o aparelho guarda o fato da conquista `offline_hero`
   * ("algo marcado sem sinal chegou ao time"). Operações antigas, de antes da fase 9, não têm o campo.
   */
  offline?: boolean;
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

/**
 * Onde este aparelho viu a maquete pela última vez, por dia: base do catch-up ("Desde a última vez")
 * e do replay da fase 5. Só neste aparelho, nunca sincronizado.
 */
export type TravelState = {
  trip_day_id: string;
  trip_id: string;
  /** fração percorrida da rota do dia (0 a 1); null sem rota ou sem posição */
  fraction: number | null;
  /** id da última parada concluída: onde o carro estava */
  at: string | null;
  done_stop_ids: string[];
  skipped_stop_ids: string[];
  /** ids de TravelEvent já mostrados (ou animados) neste aparelho */
  seen_event_ids: string[];
  updated_at: string;
};

/**
 * O arquivo de um anexo guardado neste aparelho, por id do anexo (o arquivo é imutável). Cache: sai
 * pela regra de despejo (`lib/media/eviction.ts`) e volta pelo `storage.download` quando há rede.
 */
export type BlobEntry = {
  attachment_id: string;
  trip_id: string;
  kind: 'photo' | 'document';
  size: number;
  blob: Blob;
  stored_at: string;
  last_used_at: string;
};

/** A linha de `attachments` que nasce quando o arquivo chega ao Storage. */
export type AttachmentDraft = Omit<Attachment, 'synced_at'>;

/**
 * Um trabalho da fila de mídia (`lib/media/queue.ts`), por id do anexo. `upload`: a foto ou o
 * documento esperando sinal, com o Blob já comprimido e a linha pronta para gravar depois do envio.
 * `remove`: o objeto do Storage a apagar depois que a lápide da linha for aceita. `waiting` espera a
 * vez (ou a rede); `failed` foi recusado por regra e está em Pendentes.
 */
export type MediaJobState = 'waiting' | 'failed';
type MediaJobBase = {
  attachment_id: string;
  trip_id: string;
  storage_path: string;
  state: MediaJobState;
  attempts: number;
  /** epoch ms a partir do qual pode tentar de novo; 0 = já */
  next_at: number;
  last_error: string | null;
  created_at: number;
};
export type UploadJob = MediaJobBase & { op: 'upload'; blob: Blob; row: AttachmentDraft };
export type RemoveJob = MediaJobBase & { op: 'remove' };
export type MediaJob = UploadJob | RemoveJob;

/**
 * A previsão do tempo de um dia (Open-Meteo), como o aparelho a guardou: cache recalculável, só neste
 * aparelho, nunca sincronizado. `hash` é o dos lugares e da data (muda quando uma parada muda de lugar
 * ou de horário). `places` traz onde o dia começa e, a 50 km ou mais, onde termina; `stops`, a
 * previsão na hora cheia de cada parada com horário escrito. Sem previsão, a lista vem vazia: nada
 * aparece na tela, mas o dia não fica pedindo de novo.
 */
export type WeatherEntry = {
  trip_day_id: string;
  trip_id: string;
  date: string;
  hash: string;
  fetched_at: string;
  places: { role: 'start' | 'end'; lat: number; lng: number; day: DayWeather }[];
  stops: Record<string, HourWeather & { hour: string }>;
};

export type GeocodeResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** a classe do OSM (`tourism`, `amenity`…) e o valor (`viewpoint`, `restaurant`…), quando vêm */
  category?: string;
  type?: string;
};
/** Cache das buscas de endereço (Nominatim), por consulta normalizada. */
export type GeocodeEntry = { query: string; results: GeocodeResult[]; fetched_at: string };

/**
 * Cache das buscas de lugares por tipo (a `find-places`, fase 24), pela busca arredondada: a mesma
 * conversa reaberta, ou a mesma busca de novo, não gasta crédito da Geoapify. Vale uns dias.
 */
export type PlacesEntry = { key: string; places: Place[]; fetched_at: string };

/**
 * O que chegou pelo Compartilhar do Android (fase 18): o service worker guarda o POST do `share_target`
 * aqui e a tela "Ler a confirmação" o lê. Só neste aparelho; some quando a leitura o consome.
 */
export type SharedEntry = {
  id: string;
  title: string | null;
  text: string | null;
  url: string | null;
  files: { name: string; type: string; blob: Blob }[];
  created_at: string;
};

/** Cache do estabelecimento por CNPJ (a BrasilAPI, fase 18): uma consulta por emitente, nunca duas. */
export type CnpjEntry = Merchant;

/**
 * O catálogo dos cartões-postais neste aparelho (fase 23): por lugar do app (`place_key`), o que o
 * servidor disse quando o roteiro ficou pronto. `published` traz a receita (a peça do lugar, montada
 * sem rede); `check` é a receita gerada que este aparelho desenha e manda conferir; `pending` espera o
 * servidor; `none` é lugar sem referência (a miniatura do tipo, para sempre). Recalculável: nunca
 * sincroniza, e a próxima leitura do catálogo a refaz.
 */
export type LandmarkEntry = {
  place_key: string;
  kind: 'stop' | 'city';
  landmark_id: string | null;
  name: string | null;
  version: number;
  status: 'published' | 'check' | 'pending' | 'none' | 'capped';
  recipe: Json | null;
  /** quem planejou pode refazer (uma vez por lugar), e o pedido em andamento, se houver */
  can_remake: boolean;
  remake: { id: string; status: string; options: (Json | null)[] } | null;
  fetched_at: string;
};

/**
 * Dexie é a fonte de verdade da UI. Versão 1 com todas as stores do prompt (seção 5.6, mais
 * `notification_prefs` pela correção C11 e `travel_state` do replay). Versão 2 (fase 3): índice
 * simples `trip_day_id` em `stops`, para a lápide de um dia remover as paradas, e a store
 * `geocode`. Versão 3 (fase 7): `blobs` ganha o índice `trip_id` (a viagem que sai leva os
 * arquivos dela) e nasce `uploads`, a fila de envio de fotos e documentos sem sinal. A fase 8 não
 * sobe a versão: `checklist_items`, `contacts` e `expenses` já tinham os índices de que precisa (o
 * gasto de uma reserva se acha pelo id determinístico, sem índice). Versão 4 (fase 9): `achievements`
 * ganha o índice `trip_id` (as conquistas da viagem, no filme). A fase 11 não sobe a versão: a store
 * `weather` existe desde a v1, com a chave `trip_day_id`, e só ganhou o tipo (`WeatherEntry`). Versão
 * 5 (fase 24): a store `places`, o cache das buscas de lugares por tipo. Versão 6 (fase 18): as
 * tabelas por pessoa `inbox_addresses` e `received_reservations`, a store `shares` (o que chegou pelo
 * Compartilhar do Android) e o cache `cnpj` (o estabelecimento da nota). Versão 7 (fase 23): o catálogo
 * dos cartões-postais neste aparelho (`landmarks`). Caches recalculáveis
 * (`routes`, `geocode`, `places`, `cnpj`, `landmarks`, `travel_state`, `blobs`, `weather`) nunca sincronizam. A
 * `outbox` nunca é apagada sem ter sido enviada; a `uploads` também não, pelo mesmo motivo.
 */
export class ViajeiDb extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  trip_members!: EntityTable<TripMember, 'id'>;
  profiles!: EntityTable<Profile, 'id'>;
  trip_days!: EntityTable<TripDay, 'id'>;
  stops!: EntityTable<Stop, 'id'>;
  trip_tracks!: EntityTable<TripTrack, 'id'>;
  notification_prefs!: EntityTable<NotificationPref, 'id'>;
  inbox_addresses!: EntityTable<InboxAddress, 'id'>;
  received_reservations!: EntityTable<ReceivedReservation, 'id'>;
  reservations!: EntityTable<Reservation, 'id'>;
  stop_memories!: EntityTable<StopMemory, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  checklist_items!: EntityTable<ChecklistItem, 'id'>;
  contacts!: EntityTable<Contact, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  blobs!: EntityTable<BlobEntry, 'attachment_id'>;
  uploads!: EntityTable<MediaJob, 'attachment_id'>;
  routes!: EntityTable<DayRoute, 'trip_day_id'>;
  travel_state!: EntityTable<TravelState, 'trip_day_id'>;
  weather!: EntityTable<WeatherEntry, 'trip_day_id'>;
  geocode!: EntityTable<GeocodeEntry, 'query'>;
  places!: EntityTable<PlacesEntry, 'key'>;
  shares!: EntityTable<SharedEntry, 'id'>;
  cnpj!: EntityTable<CnpjEntry, 'cnpj'>;
  landmarks!: EntityTable<LandmarkEntry, 'place_key'>;
  achievements!: EntityTable<Achievement, 'id'>;
  xp_events!: EntityTable<XpEvent, 'id'>;
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
    this.version(3).stores({
      blobs: 'attachment_id, trip_id, last_used_at',
      uploads: 'attachment_id, trip_id, state',
    });
    this.version(4).stores({
      achievements: 'id, user_id, trip_id',
    });
    this.version(5).stores({
      places: 'key, fetched_at',
    });
    this.version(6).stores({
      attachments: 'id, trip_id, stop_id, reservation_id, expense_id',
      inbox_addresses: 'id, user_id',
      received_reservations: 'id, user_id, status',
      shares: 'id, created_at',
      cnpj: 'cnpj',
    });
    this.version(7).stores({
      landmarks: 'place_key, landmark_id, fetched_at',
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
  /** a primeira escrita feita sem sinal que o servidor aceitou: { at, trip_id } (offline_hero) */
  offlineSynced: 'progress:offline-synced',
} as const;
