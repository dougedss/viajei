import { supabase } from '@/lib/supabase/client.ts';
import { connectivity, isNetworkError } from '../connectivity.ts';
import { onMutate } from '../mutate.ts';
import type { PushOp, PushResult } from '../outbox.ts';
import type { SyncTable } from '../registry.ts';
import { db, syncKeys } from '../schema.ts';
import { tripsKnownToServer, wipeTrip } from './apply-pull.ts';
import { pullTrip, pullUser } from './pull.ts';
import { pushOutbox } from './push.ts';
import { pushRpcFor } from './rpc.ts';
import { watchTrips } from './realtime.ts';

export type SyncPhase = 'idle' | 'syncing';
export type SyncState = {
  phase: SyncPhase;
  lastSyncAt: number | null;
  lastError: string | null;
};
export type SyncNotice =
  | { kind: 'superseded'; table: SyncTable; id: string; columns: string[] }
  | { kind: 'revoked'; tripId: string; tripName: string | null }
  | { kind: 'failed'; count: number };

type Listener = () => void;
type NoticeListener = (notice: SyncNotice) => void;

let state: SyncState = { phase: 'idle', lastSyncAt: null, lastError: null };
const listeners = new Set<Listener>();
const noticeListeners = new Set<NoticeListener>();
/** usuário para quem o motor está ligado; null = parado */
let uid: string | null = null;
let generation = 0;
let cleanups: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let queued = false;
let running = false;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function emit(notice: SyncNotice) {
  for (const l of noticeListeners) l(notice);
}

// RPCs como o usuário (RLS vale). Erro de rede sobe como está, para o motor marcar offline.
const basePush = pushRpcFor(supabase);
async function rpcPush(ops: PushOp[]): Promise<PushResult[]> {
  const results = await basePush(ops);
  connectivity.markOnline();
  return results;
}
async function rpcPullTrip(tripId: string, since: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('sync_pull', { p_trip_id: tripId, p_since: since });
  if (error) throw error;
  connectivity.markOnline();
  return data;
}
async function rpcPullUser(since: string): Promise<unknown> {
  const { data, error } = await supabase.rpc('sync_pull_user', { p_since: since });
  if (error) throw error;
  connectivity.markOnline();
  return data;
}

/** Uma aba por vez: Web Locks quando existe; senão, um mutex do processo. */
async function withLock(run: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    await navigator.locks.request('viajei:sync', { ifAvailable: true }, async (lock) => {
      if (lock) await run();
    });
    return;
  }
  if (running) return;
  running = true;
  try {
    await run();
  } finally {
    running = false;
  }
}

async function tripIdsToPull(extra: string[]): Promise<string[]> {
  return tripsKnownToServer(await db.trips.toArray(), extra);
}

async function pullOne(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  const stats = await pullTrip(db, tripId, rpcPullTrip);
  if (stats.revoked && trip) emit({ kind: 'revoked', tripId, tripName: trip.name });
}

/** Um ciclo completo: push, pull do usuário, pull de cada viagem. */
async function cycle(): Promise<void> {
  if (!uid) return;
  setState({ phase: 'syncing' });
  try {
    const push = await pushOutbox(db, rpcPush);
    for (const n of push.notices) emit({ kind: 'superseded', ...n });
    if (push.failed > 0) emit({ kind: 'failed', count: push.failed });
    if (push.offline) {
      connectivity.markOffline();
      return;
    }
    const memberships = await pullUser(db, rpcPullUser);
    for (const tripId of memberships.left) {
      const trip = await db.trips.get(tripId);
      if (trip) {
        await wipeTrip(db, tripId);
        emit({ kind: 'revoked', tripId, tripName: trip.name });
      }
    }
    for (const tripId of await tripIdsToPull(memberships.accepted)) await pullOne(tripId);
    watchTrips(await tripIdsToPull([]), (id) => schedulePull(id));
    setState({ lastSyncAt: Date.now(), lastError: null });
  } catch (err) {
    if (isNetworkError(err)) connectivity.markOffline();
    else setState({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    setState({ phase: 'idle' });
  }
}

/** Um pedido que chegou durante o ciclo (escrita no meio do push) roda outro ciclo em seguida. */
function takeQueued(): boolean {
  const again = queued;
  queued = false;
  return again;
}

async function run(): Promise<void> {
  if (!uid || !connectivity.isOnline()) {
    queued = false;
    return;
  }
  do {
    queued = false;
    await withLock(cycle);
  } while (takeQueued());
}

/** Agenda um ciclo (com debounce curto): escrita, online, foco, abrir o app, 60 s visível. */
export function schedule(delayMs = 150): void {
  if (!uid) return;
  queued = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void run();
  }, delayMs);
}

const pullTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Aviso do Realtime: puxa só aquela viagem, 800 ms depois (agrupa rajadas). */
export function schedulePull(tripId: string, delayMs = 800): void {
  const prev = pullTimers.get(tripId);
  if (prev) clearTimeout(prev);
  pullTimers.set(
    tripId,
    setTimeout(() => {
      pullTimers.delete(tripId);
      if (!uid || !connectivity.isOnline()) return;
      void withLock(() =>
        pullOne(tripId).catch((err: unknown) => {
          if (isNetworkError(err)) connectivity.markOffline();
        }),
      );
    }, delayMs),
  );
}

/**
 * Liga o motor para um usuário. Se o banco local pertence a outra pessoa, zera antes: dados de
 * uma pessoa nunca aparecem para outra no mesmo aparelho.
 */
export async function start(userId: string): Promise<void> {
  if (uid === userId) return;
  stop();
  const gen = ++generation;
  const owner = await db.sync_state.get(syncKeys.uid);
  if (owner && owner.value !== userId) {
    await db.delete();
    await db.open();
  }
  await db.sync_state.put({ key: syncKeys.uid, value: userId });
  await supabase.realtime.setAuth();
  if (gen !== generation) return; // parado enquanto preparava

  uid = userId;
  const onVisible = () => {
    if (document.visibilityState === 'visible') schedule();
  };
  const onWake = () => schedule();
  window.addEventListener('focus', onWake);
  window.addEventListener('online', onWake);
  document.addEventListener('visibilitychange', onVisible);
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') schedule();
  }, 60_000);
  cleanups = [
    onMutate(() => schedule()),
    connectivity.subscribe(() => {
      if (connectivity.isOnline()) schedule();
    }),
    () => window.removeEventListener('focus', onWake),
    () => window.removeEventListener('online', onWake),
    () => document.removeEventListener('visibilitychange', onVisible),
    () => clearInterval(interval),
  ];
  schedule(0);
}

export function stop(): void {
  generation++;
  for (const c of cleanups) c();
  cleanups = [];
  if (timer) clearTimeout(timer);
  timer = null;
  for (const t of pullTimers.values()) clearTimeout(t);
  pullTimers.clear();
  watchTrips([], () => undefined);
  uid = null;
  queued = false;
  setState({ phase: 'idle' });
}

/** Push e pull agora, esperando terminar (sair da conta, "tentar agora"). */
export async function syncNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  queued = false;
  await withLock(cycle);
}

export const syncEngine = {
  subscribe: (listener: Listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState: () => state,
  onNotice: (listener: NoticeListener) => {
    noticeListeners.add(listener);
    return () => {
      noticeListeners.delete(listener);
    };
  },
  start,
  stop,
  schedule,
  schedulePull,
  syncNow,
};
