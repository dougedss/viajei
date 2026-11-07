/**
 * Registro das tabelas sincronizadas, espelho de `private.sync_tables` no banco: escopo, ordem
 * de envio (rank: pais antes de filhos) e como os filhos se ligam ao pai, para a lápide de uma
 * linha remover os filhos locais. Cada fase acrescenta as suas tabelas aqui e no banco.
 */
export type SyncScope = 'trip' | 'user';

export type SyncTableInfo = {
  scope: SyncScope;
  rank: number;
  /** filhos locais: ao apagar uma linha desta tabela, apaga em `table` as linhas com `fk` igual ao id */
  children: readonly { table: SyncTable; fk: string }[];
};

export const SYNC_TABLES = {
  trips: {
    scope: 'trip',
    rank: 10,
    children: [
      { table: 'trip_members', fk: 'trip_id' },
      { table: 'trip_days', fk: 'trip_id' },
      { table: 'reservations', fk: 'trip_id' },
      { table: 'contacts', fk: 'trip_id' },
      { table: 'checklist_items', fk: 'trip_id' },
      { table: 'expenses', fk: 'trip_id' },
    ],
  },
  trip_members: { scope: 'trip', rank: 20, children: [] },
  trip_days: {
    scope: 'trip',
    rank: 30,
    children: [
      { table: 'stops', fk: 'trip_day_id' },
      { table: 'trip_tracks', fk: 'trip_day_id' },
    ],
  },
  /**
   * As reservas não são filhas da parada nem do dia: excluir a parada passa a reserva para o dia
   * dela (`features/itinerary/actions.ts`), e o dia só sai vazio. Se a lápide da parada levasse a
   * reserva, os documentos dela sumiriam do aparelho (a reserva volta no mesmo pull; os anexos, que
   * não mudaram, não).
   */
  stops: {
    scope: 'trip',
    rank: 40,
    children: [
      { table: 'stop_memories', fk: 'stop_id' },
      { table: 'attachments', fk: 'stop_id' },
    ],
  },
  trip_tracks: { scope: 'trip', rank: 50, children: [] },
  reservations: {
    scope: 'trip',
    rank: 50,
    children: [{ table: 'attachments', fk: 'reservation_id' }],
  },
  stop_memories: { scope: 'trip', rank: 50, children: [] },
  attachments: { scope: 'trip', rank: 60, children: [] },
  contacts: { scope: 'trip', rank: 30, children: [] },
  /**
   * Itens das listas e gastos não são filhos da parada (nem o gasto é filho da reserva): excluir uma
   * parada leva só a missão de sistema dela e solta o resto (`features/itinerary/actions.ts`). Se a
   * lápide da parada levasse tudo, a missão de alguém e o dinheiro gasto sumiriam do aparelho.
   */
  checklist_items: { scope: 'trip', rank: 50, children: [] },
  /** 55: depois das reservas (50), porque o gasto de uma reserva tem FK para ela e podem subir juntos. */
  expenses: { scope: 'trip', rank: 55, children: [] },
  /** preferências de aviso: da pessoa (escopo user), uma linha por viagem; chega pelo pull do usuário */
  notification_prefs: { scope: 'user', rank: 25, children: [] },
  /**
   * Conquistas e XP: somente-anexar, da pessoa (escopo user), por último no push (90). As próprias
   * chegam pelo pull do usuário; as do time, pelo pull da viagem (C6, só as que têm o trip_id dela).
   */
  achievements: { scope: 'user', rank: 90, children: [] },
  xp_events: { scope: 'user', rank: 90, children: [] },
} as const satisfies Record<
  string,
  { scope: SyncScope; rank: number; children: readonly unknown[] }
>;

export type SyncTable = keyof typeof SYNC_TABLES;
export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTable[];

export function isSyncTable(name: string): name is SyncTable {
  return Object.hasOwn(SYNC_TABLES, name);
}

export function rankOf(table: SyncTable): number {
  return (SYNC_TABLES as Record<SyncTable, SyncTableInfo>)[table].rank;
}

export function scopeOf(table: SyncTable): SyncScope {
  return (SYNC_TABLES as Record<SyncTable, SyncTableInfo>)[table].scope;
}

export function childrenOf(table: SyncTable): readonly { table: SyncTable; fk: string }[] {
  return (SYNC_TABLES as Record<SyncTable, SyncTableInfo>)[table].children;
}

/** Tabelas de escopo `trip`, cujas linhas têm `trip_id` e somem junto com a viagem. */
export const TRIP_SCOPED_TABLES = SYNC_TABLE_NAMES.filter(
  (t) => (SYNC_TABLES as Record<SyncTable, SyncTableInfo>)[t].scope === 'trip',
);
