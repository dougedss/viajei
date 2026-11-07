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
import { CycleRunner } from './runner.ts';

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
/** o ciclo em andamento, quando não há Web Locks */
let running: Promise<void> | null = null;

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

const hasLocks = () => typeof navigator !== 'undefined' && 'locks' in navigator;

/**
 * Uma aba por vez: Web Locks quando existe; senão, um mutex do processo. Devolve se rodou: com o
 * lock ocupado (outro ciclo, um pull do Realtime, outra aba ou o service worker), não roda.
 */
async function withLock(run: () => Promise<void>): Promise<boolean> {
  if (hasLocks()) {
    return navigator.locks.request('viajei:sync', { ifAvailable: true }, async (lock) => {
      if (!lock) return false;
      await run();
      return true;
    });
  }
  if (running) return false;
  running = run().finally(() => {
    running = null;
  });
  await running;
  return true;
}

/** Espera quem está com o lock terminar, sem rodar nada. */
async function lockReleased(): Promise<void> {
  if (hasLocks()) {
    await navigator.locks.request('viajei:sync', () => Promise.resolve());
    return;
  }
  await running?.catch(() => undefined);
}

async function tripIdsToPull(userId: string): Promise<string[]> {
  const [trips, memberships] = await Promise.all([db.trips.toArray(), db.trip_members.toArray()]);
  return tripsKnownToServer(trips, memberships, userId);
}

async function pullOne(tripId: string): Promise<void> {
  const trip = await db.trips.get(tripId);
  const stats = await pullTrip(db, tripId, rpcPullTrip);
  if (stats.revoked && trip) emit({ kind: 'revoked', tripId, tripName: trip.name });
}

/** Um ciclo completo: push, pull do usuário, pull de cada viagem. */
async function cycle(): Promise<void> {
  const me = uid;
  if (!me) return;
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
    // cada viagem por si: a que falha não segura as seguintes; sem rede, o resto fica para o
    // próximo ciclo, que a encontra de novo pela participação gravada
    const errors: string[] = [];
    for (const tripId of await tripIdsToPull(me)) {
      try {
        await pullOne(tripId);
      } catch (err) {
        if (isNetworkError(err)) throw err;
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
    watchTrips(await tripIdsToPull(me), (id) => schedulePull(id));
    setState({ lastSyncAt: Date.now(), lastError: errors[0] ?? null });
  } catch (err) {
    if (isNetworkError(err)) connectivity.markOffline();
    else setState({ lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    setState({ phase: 'idle' });
  }
}

/** Um laço de ciclos por aba (D86): pedido no meio vira mais um ciclo; lock ocupado espera soltar. */
const runner = new CycleRunner({
  canRun: () => uid !== null && connectivity.isOnline(),
  withLock,
  lockReleased,
  cycle,
});

/** Agenda um ciclo (com debounce curto): escrita, online, foco, abrir o app, 60 s visível. */
export function schedule(delayMs = 150): void {
  if (!uid) return;
  runner.request();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runner.run();
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
      ).then((ran) => {
        // lock ocupado: um ciclo completo (que também puxa esta viagem) em seguida
        if (!ran) schedule();
      });
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
  runner.clear();
  setState({ phase: 'idle' });
}

/** Push e pull agora, esperando terminar (sair da conta, "tentar agora"). */
export async function syncNow(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  // um ciclo agora (ou logo depois do que está rodando), esperando terminar
  runner.request();
  await runner.run();
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
