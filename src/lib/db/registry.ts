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
    children: [{ table: 'trip_members', fk: 'trip_id' }],
  },
  trip_members: { scope: 'trip', rank: 20, children: [] },
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
