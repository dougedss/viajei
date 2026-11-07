import type { EntityTable } from 'dexie';
import { scopeOf, type SyncTable } from './registry.ts';
import { db, type OutboxInsert, type RowOf } from './schema.ts';

/** Colunas que o servidor carimba; nunca vão no `values` de uma operação. */
const SERVER_COLUMNS = new Set(['synced_at', 'created_at']);

/** Por dentro, as tabelas são vistas pela forma comum a todas: id e colunas. A tipagem fina fica na API. */
type AnyRow = { id: string } & Record<string, unknown>;
function tableOf(table: SyncTable): EntityTable<AnyRow, 'id'> {
  return db.table(table);
}

/**
 * Diz se o app está sem sinal no momento da escrita (a marca `offline` da outbox). O app troca pela
 * conectividade real (`connectivity.isOnline`, que sabe da requisição que falhou); o service worker,
 * que não carrega o React, fica com o `navigator.onLine`.
 */
let offlineProbe: () => boolean = () => typeof navigator !== 'undefined' && !navigator.onLine;

export function setOfflineProbe(probe: () => boolean): void {
  offlineProbe = probe;
}

type Listener = (table: SyncTable) => void;
const listeners = new Set<Listener>();

/** O motor de sync se inscreve aqui para enfileirar um push a cada escrita. */
export function onMutate(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(table: SyncTable) {
  for (const l of listeners) l(table);
}

function tripIdOf(table: SyncTable, row: Record<string, unknown>): string | null {
  if (scopeOf(table) !== 'trip') return null;
  const id = table === 'trips' ? row.id : row.trip_id;
  return typeof id === 'string' ? id : null;
}

function versionsFor(values: Record<string, unknown>, at: string): Record<string, string> {
  return Object.fromEntries(Object.keys(values).map((col) => [col, at]));
}

function newOp(
  table: SyncTable,
  row: Record<string, unknown>,
  op: 'upsert' | 'patch',
  values: Record<string, unknown>,
  now: string,
): OutboxInsert {
  return {
    trip_id: tripIdOf(table, row),
    table,
    row_id: String(row.id),
    op,
    values,
    versions: versionsFor(values, now),
    updated_at: now,
    offline: offlineProbe(),
    state: 'pending',
    attempts: 0,
    next_at: 0,
    last_error: null,
    created_at: Date.now(),
  };
}

/**
 * A única porta de escrita nas tabelas sincronizadas. Atualiza a linha local e enfileira na
 * outbox na mesma transação Dexie, online ou offline: UI e fila nunca divergem. Perfil não passa
 * por aqui (é editado online, pelo TanStack Query).
 */
export const mutate = {
  /** Linha nova, com id gerado no client. Vai como `upsert` com todas as colunas. */
  async insert<T extends SyncTable>(table: T, row: Omit<RowOf<T>, 'synced_at'>): Promise<void> {
    const now = new Date().toISOString();
    const values = Object.fromEntries(
      Object.entries(row).filter(([col]) => !SERVER_COLUMNS.has(col) && col !== 'updated_at'),
    );
    const op = newOp(table, row, 'upsert', values, now);
    await db.transaction('rw', [table, 'outbox'], async () => {
      await tableOf(table).put({ ...row, synced_at: null, updated_at: now });
      await db.outbox.add(op);
    });
    notify(table);
  },

  /**
   * Várias linhas novas da mesma tabela numa transação e com um aviso só: a progressão grava de uma
   * vez tudo o que a derivação achou (na primeira, dezenas de eventos de XP).
   */
  async insertMany<T extends SyncTable>(
    table: T,
    rows: readonly Omit<RowOf<T>, 'synced_at'>[],
  ): Promise<void> {
    if (rows.length === 0) return;
    const now = new Date().toISOString();
    await db.transaction('rw', [table, 'outbox'], async () => {
      for (const row of rows) {
        const values = Object.fromEntries(
          Object.entries(row).filter(([col]) => !SERVER_COLUMNS.has(col) && col !== 'updated_at'),
        );
        await tableOf(table).put({ ...row, synced_at: null, updated_at: now });
        await db.outbox.add(newOp(table, row, 'upsert', values, now));
      }
    });
    notify(table);
  },

  /** Só as colunas tocadas, cada uma com a hora desta edição. */
  async patch<T extends SyncTable>(
    table: T,
    id: string,
    changes: Partial<Omit<RowOf<T>, 'id' | 'synced_at' | 'created_at' | 'updated_at'>>,
  ): Promise<void> {
    const now = new Date().toISOString();
    const values = Object.fromEntries(
      Object.entries(changes).filter(([col]) => !SERVER_COLUMNS.has(col) && col !== 'id'),
    );
    if (Object.keys(values).length === 0) return;
    await db.transaction('rw', [table, 'outbox'], async () => {
      const current = await tableOf(table).get(id);
      if (!current) throw new Error(`${table}/${id} não existe localmente`);
      await tableOf(table).put({ ...current, ...values, updated_at: now });
      await db.outbox.add(newOp(table, current, 'patch', values, now));
    });
    notify(table);
  },

  /** Exclusão é soft: um patch em `deleted_at`. A lápide volta pelo pull e aí a linha some do aparelho. */
  async remove(table: SyncTable, id: string): Promise<void> {
    await mutate.patch(table, id, { deleted_at: new Date().toISOString() });
  },

  /**
   * Desfazer uma exclusão: a linha volta inteira, pelo mesmo id, como `upsert`. Um patch não serviria:
   * com rede, o pull traz a lápide em um segundo e a linha já não existe no aparelho para receber o
   * patch. A versão nova de cada coluna vence a lápide no servidor.
   */
  async restore<T extends SyncTable>(table: T, row: RowOf<T>): Promise<void> {
    const values: Record<string, unknown> = { ...row, deleted_at: null };
    delete values.synced_at;
    await mutate.insert(table, values as Omit<RowOf<T>, 'synced_at'>);
  },

  /**
   * Projeção local de uma linha que o servidor deriva sozinho (ex.: a participação do dono, criada
   * por trigger). Entra no Dexie para a UI, sem outbox; o pull a substitui pela versão do servidor.
   */
  async project<T extends SyncTable>(table: T, row: Omit<RowOf<T>, 'synced_at'>): Promise<void> {
    await tableOf(table).put({ ...row, synced_at: null });
  },
};
