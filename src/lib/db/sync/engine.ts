import { supabase } from '@/lib/supabase/client.ts';
import { connectivity, isNetworkError } from '../connectivity.ts';
import { onMutate, setOfflineProbe } from '../mutate.ts';
import type { PushOp, PushResult } from '../outbox.ts';
import type { SyncTable } from '../registry.ts';
import { db, syncKeys } from '../schema.ts';
import { tripsKnownToServer, wipeTrip } from './apply-pull.ts';
import { pullTrip, pullUser } from './pull.ts';
import { pushOutbox } from './push.ts';
import { pushRpcFor } from './rpc.ts';
import { watchTrips } from './realtime.ts';
import { runCycle } from './cycle.ts';
import { withDeadline } from './deadline.ts';
import { CycleRunner } from './runner.ts';
import { SyncTrace } from './trace.ts';
import { registerDiag } from '@/lib/diag.ts';

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
/** os últimos passos do motor, para o diagnóstico (`viajeiDiag.sync()`; fase 13) */
const trace = new SyncTrace();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
function emit(notice: SyncNotice) {
  for (const l of noticeListeners) l(notice);
}

// RPCs como o usuário (RLS vale), cada uma com prazo (`deadline.ts`). Erro de rede sobe como está,
// para o motor marcar offline.
const basePush = pushRpcFor(supabase);
async function rpcPush(ops: PushOp[]): Promise<PushResult[]> {
  const results = await basePush(ops);
  connectivity.markOnline();
  return results;
}
async function rpcPullTrip(tripId: string, since: string): Promise<unknown> {
  const { data, error } = await withDeadline((signal) =>
    supabase.rpc('sync_pull', { p_trip_id: tripId, p_since: since }).abortSignal(signal),
  );
  if (error) throw error;
  connectivity.markOnline();
  return data;
}
async function rpcPullUser(since: string): Promise<unknown> {
  const { data, error } = await withDeadline((signal) =>
    supabase.rpc('sync_pull_user', { p_since: since }).abortSignal(signal),
  );
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
      if (!lock) {
        trace.add('lock ocupado');
        return false;
      }
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
  const t0 = Date.now();
  if (hasLocks()) {
    await navigator.locks.request('viajei:sync', () => Promise.resolve());
  } else {
    await running?.catch(() => undefined);
  }
  trace.add('lock solto', Date.now() - t0);
}

async function tripIdsToPull(userId: string): Promise<string[]> {
  const [trips, memberships] = await Promise.all([db.trips.toArray(), db.trip_members.toArray()]);
  return tripsKnownToServer(trips, memberships, userId);
}

async function pullOne(tripId: string): Promise<void> {
  const t0 = Date.now();
  const trip = await db.trips.get(tripId);
  const stats = await pullTrip(db, tripId, rpcPullTrip);
  trace.add(`pull ${tripId.slice(0, 8)}`, Date.now() - t0);
  if (stats.revoked && trip) emit({ kind: 'revoked', tripId, tripName: trip.name });
}

/**
 * Um ciclo completo: push, pull do usuário, pull de cada viagem (`cycle.ts`, puro). Uma escrita que
 * chega no meio dos pulls sobe antes do pull seguinte (fase 13): o pedido dela está no laço.
 */
async function cycle(): Promise<void> {
  const me = uid;
  if (!me) return;
  const t0 = Date.now();
  trace.add('ciclo');
  setState({ phase: 'syncing' });
  try {
    const result = await runCycle({
      push: () => pushOutbox(db, rpcPush),
      pullUser: () => pullUser(db, rpcPullUser),
      leaveTrip: async (tripId) => {
        const trip = await db.trips.get(tripId);
        if (trip) {
          await wipeTrip(db, tripId);
          emit({ kind: 'revoked', tripId, tripName: trip.name });
        }
      },
      tripsToPull: () => tripIdsToPull(me),
      pullTrip: pullOne,
      hasPendingRequest: () => runner.pending,
      isNetworkError,
      onPushed: (push) => {
        for (const n of push.notices) emit({ kind: 'superseded', ...n });
        if (push.failed > 0) emit({ kind: 'failed', count: push.failed });
      },
      trace: (e, ms) => trace.add(e, ms),
    });
    if (result.offline) {
      connectivity.markOffline();
      return;
    }
    watchTrips(await tripIdsToPull(me), (id) => schedulePull(id));
    setState({ lastSyncAt: Date.now(), lastError: result.errors[0] ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isNetworkError(err)) {
      trace.add(`sem rede: ${message.slice(0, 80)}`);
      connectivity.markOffline();
    } else {
      trace.add(`erro: ${message.slice(0, 80)}`);
      setState({ lastError: message });
    }
  } finally {
    trace.add('ciclo fim', Date.now() - t0);
    setState({ phase: 'idle' });
  }
}

/** Um laço de ciclos por aba (D86): pedido no meio vira mais um ciclo; lock ocupado espera soltar. */
const runner = new CycleRunner({
  // depois de uma falha de rede o motor segue tentando (é ele quem descobre que a rede voltou);
  // só o "sem rede" do navegador o segura (D111)
  canRun: () => uid !== null && connectivity.canTry(),
  withLock,
  lockReleased,
  cycle,
});

/** Agenda um ciclo (com debounce curto): escrita, online, foco, abrir o app, 60 s visível. */
export function schedule(delayMs = 150): void {
  if (!uid) {
    trace.add('pedido com o motor desligado');
    return;
  }
  trace.add('pedido');
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
      if (!uid || !connectivity.canTry()) return;
      trace.add(`realtime ${tripId.slice(0, 8)}`);
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
  const t0 = Date.now();
  trace.add('ligando');
  const owner = await db.sync_state.get(syncKeys.uid);
  if (owner && owner.value !== userId) {
    await db.delete();
    await db.open();
  }
  await db.sync_state.put({ key: syncKeys.uid, value: userId });
  // a marca "sem sinal" da outbox segue a conectividade real (requisição que falhou), não só o navegador
  setOfflineProbe(() => !connectivity.isOnline());
  await supabase.realtime.setAuth();
  if (gen !== generation) return; // parado enquanto preparava

  uid = userId;
  trace.add('motor ligado', Date.now() - t0);
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
    connectivity.onRetry(() => schedule(0)),
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

// o diagnóstico pelo console e pelo laboratório: o estado, se há pedido na fila e o rastro
registerDiag('sync', () => ({
  ...state,
  ligado: uid !== null,
  pedido: runner.pending,
  rastro: trace.list(),
}));

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
