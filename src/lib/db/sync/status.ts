import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { useOnline } from '../connectivity.ts';
import { db } from '../schema.ts';
import { syncEngine, type SyncState } from './engine.ts';

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, syncEngine.getState);
}

export type OutboxCounts = { pending: number; failed: number };

/**
 * Quantas alterações ainda não chegaram ao servidor, e quantas o servidor recusou. As fotos e os
 * documentos na fila de envio contam junto: para a pessoa, "2 pendentes" inclui a foto da cascata.
 */
export function useOutboxCounts(): OutboxCounts {
  return useLiveQuery(
    async () => {
      const jobs = (await db.uploads.toArray()).filter((j) => j.op === 'upload');
      return {
        pending:
          (await db.outbox.where('state').equals('pending').count()) +
          jobs.filter((j) => j.state === 'waiting').length,
        failed:
          (await db.outbox.where('state').equals('failed').count()) +
          jobs.filter((j) => j.state === 'failed').length,
      };
    },
    [],
    { pending: 0, failed: 0 },
  );
}

export type SyncSummary = OutboxCounts & { online: boolean; syncing: boolean };

export function useSyncSummary(): SyncSummary {
  const online = useOnline();
  const { phase } = useSyncState();
  const counts = useOutboxCounts();
  return { ...counts, online, syncing: phase === 'syncing' };
}
