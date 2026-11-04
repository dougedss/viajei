import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncExternalStore } from 'react';
import { useOnline } from '../connectivity.ts';
import { db } from '../schema.ts';
import { syncEngine, type SyncState } from './engine.ts';

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getState, syncEngine.getState);
}

export type OutboxCounts = { pending: number; failed: number };

/** Quantas alterações ainda não chegaram ao servidor, e quantas o servidor recusou. */
export function useOutboxCounts(): OutboxCounts {
  return useLiveQuery(
    async () => ({
      pending: await db.outbox.where('state').equals('pending').count(),
      failed: await db.outbox.where('state').equals('failed').count(),
    }),
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
