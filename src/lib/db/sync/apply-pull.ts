import { z } from 'zod';
import {
  childrenOf,
  rankOf,
  scopeOf,
  SYNC_TABLE_NAMES,
  TRIP_SCOPED_TABLES,
  type SyncTable,
} from '../registry.ts';
import {
  syncKeys,
  type Profile,
  type RowOf,
  type Trip,
  type TripMember,
  type ViajeiDb,
} from '../schema.ts';

/** O envelope do pull é validado; as linhas em si vêm do nosso banco, com os tipos gerados. */
const rowSchema = z.looseObject({ id: z.string(), deleted_at: z.string().nullable().optional() });
const envelopeSchema = z.looseObject({ server_time: z.string(), revoked: z.boolean().optional() });

export type PullRow = z.infer<typeof rowSchema>;
export type TripPull = {
  server_time: string;
  revoked: boolean;
  tables: Partial<Record<SyncTable, PullRow[]>>;
  profiles: PullRow[];
};
export type UserPull = {
  server_time: string;
  memberships: PullRow[];
  tables: Partial<Record<SyncTable, PullRow[]>>;
};

export function parseTripPull(json: unknown): TripPull {
  const env = envelopeSchema.parse(json);
  const tables: Partial<Record<SyncTable, PullRow[]>> = {};
  for (const t of SYNC_TABLE_NAMES) {
    if (t in env) tables[t] = z.array(rowSchema).parse(env[t]);
  }
  return {
    server_time: env.server_time,
    revoked: env.revoked === true,
    tables,
    profiles: 'profiles' in env ? z.array(rowSchema).parse(env.profiles) : [],
  };
}

export function parseUserPull(json: unknown): UserPull {
  const env = envelopeSchema.parse(json);
  const tables: Partial<Record<SyncTable, PullRow[]>> = {};
  for (const t of SYNC_TABLE_NAMES) {
    if (scopeOf(t) === 'user' && t in env) tables[t] = z.array(rowSchema).parse(env[t]);
  }
  return {
    server_time: env.server_time,
    memberships: z.array(rowSchema).parse(env.memberships ?? []),
    tables,
  };
}

/** Apaga uma linha e, em cascata, os filhos locais registrados em `childrenOf`. */
export async function removeWithChildren(
  db: ViajeiDb,
  table: SyncTable,
  id: string,
): Promise<number> {
  let n = 0;
  for (const child of childrenOf(table)) {
    const ids = await db.syncTable(child.table).where(child.fk).equals(id).primaryKeys();
    for (const childId of ids) n += await removeWithChildren(db, child.table, childId);
  }
  await db.syncTable(table).delete(id);
  // o arquivo em cache vai junto com a linha; o trabalho de apagar o objeto no Storage fica (ele
  // espera justamente esta lápide ser aceita)
  if (table === 'attachments') {
    await db.blobs.delete(id);
    const job = await db.uploads.get(id);
    if (job?.op === 'upload') await db.uploads.delete(id);
  }
  return n + 1;
}

/**
 * Grava uma linha vinda do servidor. Se há operações pendentes dela na outbox, os valores
 * pendentes ficam por cima (sem piscar): o que o aparelho editou e ainda não enviou prevalece
 * localmente até o push decidir. Lápide (deleted_at) remove a linha e os filhos.
 */
async function applyRow(
  db: ViajeiDb,
  table: SyncTable,
  row: PullRow,
): Promise<'upserted' | 'removed'> {
  if (row.deleted_at != null) {
    await removeWithChildren(db, table, row.id);
    return 'removed';
  }
  const pending = await db.outbox.where('[table+row_id]').equals([table, row.id]).sortBy('seq');
  const overlay = pending.reduce<Record<string, unknown>>(
    (acc, p) => ({ ...acc, ...p.values }),
    {},
  );
  await db.syncTable(table).put({ ...row, ...overlay } as unknown as RowOf<typeof table>);
  return 'upserted';
}

export type ApplyStats = { upserted: number; removed: number; revoked: boolean };

/**
 * Apaga tudo de uma viagem neste aparelho: linhas de todas as tabelas, os arquivos em cache, cursor
 * e as operações e envios que já não têm destino.
 */
export async function wipeTrip(db: ViajeiDb, tripId: string): Promise<void> {
  const stores = [
    ...TRIP_SCOPED_TABLES,
    'achievements',
    'xp_events',
    'outbox',
    'sync_state',
    'blobs',
    'uploads',
  ];
  await db.transaction('rw', stores, async () => {
    for (const t of TRIP_SCOPED_TABLES) {
      if (t === 'trips') await db.trips.delete(tripId);
      else await db.syncTable(t).where('trip_id').equals(tripId).delete();
    }
    // a progressão dos outros membros nesta viagem sai junto; a da pessoa continua dela
    const me = (await db.sync_state.get(syncKeys.uid))?.value;
    for (const t of ['achievements', 'xp_events'] as const) {
      await db
        .syncTable(t)
        .where('trip_id')
        .equals(tripId)
        .filter((row) => row.user_id !== me)
        .delete();
    }
    await db.outbox.where('trip_id').equals(tripId).delete();
    await db.blobs.where('trip_id').equals(tripId).delete();
    await db.uploads.where('trip_id').equals(tripId).delete();
    await db.sync_state.delete(syncKeys.tripCursor(tripId));
  });
}

/** Aplica o pull de uma viagem numa transação Dexie: tabelas em ordem de rank, perfis, cursor. */
export async function applyTripPull(
  db: ViajeiDb,
  tripId: string,
  pull: TripPull,
): Promise<ApplyStats> {
  if (pull.revoked) {
    await wipeTrip(db, tripId);
    return { upserted: 0, removed: 0, revoked: true };
  }
  const stats: ApplyStats = { upserted: 0, removed: 0, revoked: false };
  const tables = [...db.tables.map((t) => t.name)];
  await db.transaction('rw', tables, async () => {
    const order = SYNC_TABLE_NAMES.filter((t) => pull.tables[t]).sort(
      (a, b) => rankOf(a) - rankOf(b),
    );
    for (const t of order) {
      for (const row of pull.tables[t] ?? []) {
        const r = await applyRow(db, t, row);
        if (r === 'removed') stats.removed++;
        else stats.upserted++;
      }
    }
    for (const p of pull.profiles) await db.profiles.put(p as unknown as Profile);
    await db.sync_state.put({ key: syncKeys.tripCursor(tripId), value: pull.server_time });
  });
  return stats;
}

export type MembershipChange = { left: string[] };

/**
 * As viagens que vale puxar, todas a partir do que está no aparelho: as viagens que o servidor já
 * carimbou (`synced_at`) e as participações aceitas da pessoa que vieram do servidor. A participação
 * fica gravada assim que o pull do usuário a traz, antes do pull da viagem; por isso uma viagem cujo
 * primeiro pull foi interrompido (rede, recarga, aba fechada) volta no ciclo seguinte, mesmo com o
 * cursor do usuário já adiante. Ficam de fora a viagem apagada aqui e a criada aqui e ainda não
 * enviada (a participação do dono é só projeção, sem `synced_at`): o servidor responderia "não é
 * membro" e o aparelho a apagaria como `revoked` antes do push (D49).
 */
export function tripsKnownToServer(
  trips: readonly Pick<Trip, 'id' | 'deleted_at' | 'synced_at'>[],
  memberships: readonly Pick<
    TripMember,
    'trip_id' | 'user_id' | 'status' | 'deleted_at' | 'synced_at'
  >[],
  uid: string,
): string[] {
  const deletedHere = new Set(trips.filter((t) => t.deleted_at !== null).map((t) => t.id));
  const stamped = trips
    .filter((t) => t.deleted_at === null && t.synced_at !== null)
    .map((t) => t.id);
  const joined = memberships
    .filter(
      (m) =>
        m.user_id === uid &&
        m.status === 'accepted' &&
        m.deleted_at === null &&
        m.synced_at !== null &&
        !deletedHere.has(m.trip_id),
    )
    .map((m) => m.trip_id);
  return [...new Set([...stamped, ...joined])];
}

/**
 * Aplica o pull do usuário: as próprias participações (é por elas que um aparelho novo descobre as
 * viagens; as aceitas ficam gravadas e daí entram em `tripsKnownToServer`) e as tabelas de escopo
 * `user`. Devolve as viagens que a pessoa deixou (lápide ou convite recusado: para apagar localmente).
 */
export async function applyUserPull(db: ViajeiDb, pull: UserPull): Promise<MembershipChange> {
  const change: MembershipChange = { left: [] };
  const tables = [...db.tables.map((t) => t.name)];
  await db.transaction('rw', tables, async () => {
    for (const m of pull.memberships) {
      const tripId = typeof m.trip_id === 'string' ? m.trip_id : null;
      const accepted = m.status === 'accepted' && m.deleted_at == null;
      if (tripId && m.deleted_at != null) change.left.push(tripId);
      if (m.deleted_at != null) await db.trip_members.delete(m.id);
      else if (accepted) await applyRow(db, 'trip_members', m);
      // convite pendente não entra no Dexie: a tela inicial o lê pela RPC my_pending_invites
    }
    for (const t of SYNC_TABLE_NAMES) {
      for (const row of pull.tables[t] ?? []) await applyRow(db, t, row);
    }
    await db.sync_state.put({ key: syncKeys.userCursor, value: pull.server_time });
  });
  return change;
}
