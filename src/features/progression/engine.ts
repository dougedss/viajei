import { readyKey } from '@/features/checklists/rules.ts';
import { connectivity } from '@/lib/db/connectivity.ts';
import { mutate, onMutate } from '@/lib/db/mutate.ts';
import type { SyncTable } from '@/lib/db/registry.ts';
import { db, syncKeys } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { missingRows, progressRows } from './ids.ts';
import { mergeQueue, planCelebrations, type Celebration, type Summary } from './moments.ts';
import { deriveProgress, totalXp, type ProgressSnapshot } from './rules.ts';
import { isAchievementKey } from './team.ts';

/**
 * O motor de progressão: lê o retrato do aparelho, deriva tudo a que a pessoa tem direito (as regras
 * puras de `rules.ts`), compara com o que já está gravado e grava só o que falta pela `mutate`, na
 * outbox, offline (rank 90: sobe depois de tudo). Roda ao abrir o app, no fim de cada ciclo do sync
 * e depois de escritas nas tabelas que alimentam as regras.
 *
 * - Um Web Lock próprio (`viajei:progress`): os ids determinísticos já tornam duas abas inofensivas
 *   para o banco, mas a comemoração tem de sair uma vez só.
 * - A janela do Desfazer (D117): nada é derivado enquanto uma linha das regras foi tocada há menos de
 *   12 s (o "Desfazer" dura 10 s). Um Partiu! tocado por engano e desfeito não vira Madrugador para
 *   sempre, porque conquista não se apaga. Vale para o que veio de outro aparelho também.
 * - A primeira derivação de um aparelho espera o primeiro ciclo completo do sync (o pull traz o que
 *   outros aparelhos já gravaram) e vai para um resumo calmo, nunca para uma cascata de cartões.
 */
export const UNDO_WINDOW_MS = 12_000;

/** As tabelas que alimentam as regras: escrever nelas pede uma derivação. */
const FEEDS: ReadonlySet<SyncTable> = new Set<SyncTable>([
  'trips',
  'trip_members',
  'trip_days',
  'stops',
  'stop_memories',
  'attachments',
  'checklist_items',
  'expenses',
  'reservations',
  'trip_tracks',
]);

export const progressKeys = {
  /** a primeira derivação deste aparelho já aconteceu */
  baseline: 'progress:baseline',
  /** a fila de cartões por aparelho: JSON de Celebration[] */
  queue: 'progress:queue',
  /** o resumo da primeira derivação, até a pessoa ver: JSON de Summary */
  summary: 'progress:summary',
} as const;

let uid: string | null = null;
let cleanups: (() => void)[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
/** um ciclo completo do sync terminou nesta sessão (o pull do usuário já trouxe o que existia) */
let synced = false;

function parse<T>(raw: string | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readSnapshot(me: string, now: number): Promise<ProgressSnapshot> {
  const [trips, members, days, stops, memories, attachments, items, expenses, reservations] =
    await Promise.all([
      db.trips.toArray(),
      db.trip_members.toArray(),
      db.trip_days.toArray(),
      db.stops.toArray(),
      db.stop_memories.toArray(),
      db.attachments.toArray(),
      db.checklist_items.toArray(),
      db.expenses.toArray(),
      db.reservations.toArray(),
    ]);
  const [tracks, routes, offline] = await Promise.all([
    db.trip_tracks.toArray(),
    db.routes.toArray(),
    db.sync_state.get(syncKeys.offlineSynced),
  ]);
  // a distância até a costa só carrega quando há trilha (o chunk da lib/geo tem os dados embutidos)
  const coastDistance =
    tracks.length > 0 ? (await import('@/lib/geo/index.ts')).distanceToCoast : null;
  return {
    uid: me,
    now,
    trips,
    members,
    days,
    stops,
    memories,
    attachments,
    items,
    expenses,
    reservations,
    tracks,
    routes,
    offlineSynced: parse<{ at: string; trip_id: string } | null>(offline?.value, null),
    imports: [],
    coastDistance,
  };
}

/** A última vez que uma linha das regras foi tocada (aqui ou noutro aparelho). A trilha não conta. */
function lastTouch(s: ProgressSnapshot): number {
  let last = 0;
  const see = (rows: readonly { updated_at: string }[]) => {
    for (const r of rows) {
      const t = Date.parse(r.updated_at);
      if (t > last) last = t;
    }
  };
  see(s.stops);
  see(s.items);
  see(s.expenses);
  see(s.memories);
  see(s.reservations);
  return last;
}

async function run(me: string): Promise<void> {
  const now = Date.now();
  const baseline = await db.sync_state.get(progressKeys.baseline);
  // aparelho novo: espera o primeiro ciclo do sync, a não ser que não haja rede para isso
  if (!baseline && !synced && connectivity.canTry()) return;
  const snapshot = await readSnapshot(me, now);
  const settle = lastTouch(snapshot) + UNDO_WINDOW_MS;
  if (settle > now) {
    schedule(settle - now + 50);
    return;
  }
  const progress = deriveProgress(snapshot);
  const rows = await progressRows(me, progress, new Date(now).toISOString());
  const [mineXp, mineAch] = await Promise.all([
    db.xp_events.where('user_id').equals(me).toArray(),
    db.achievements.where('user_id').equals(me).toArray(),
  ]);
  const xp = missingRows(rows.xp, new Set(mineXp.map((r) => r.id)));
  const achievements = missingRows(rows.achievements, new Set(mineAch.map((r) => r.id)));
  if (uid !== me) return; // saiu da conta no meio
  if (xp.length > 0) await mutate.insertMany('xp_events', xp);
  if (achievements.length > 0) await mutate.insertMany('achievements', achievements);

  const beforeXp = totalXp(mineXp);
  const plan = planCelebrations({
    firstRun: !baseline,
    beforeXp,
    afterXp: beforeXp + totalXp(xp),
    allKeys: [...mineAch.map((a) => a.key), ...achievements.map((a) => a.key)].filter(
      isAchievementKey,
    ),
    added: progress.achievements.filter((a) => achievements.some((r) => r.key === a.key)),
    now: new Date(now).toISOString(),
  });
  await db.transaction('rw', db.sync_state, async () => {
    if (!baseline) {
      await db.sync_state.put({ key: progressKeys.baseline, value: new Date(now).toISOString() });
    }
    if (plan.summary) {
      await db.sync_state.put({ key: progressKeys.summary, value: JSON.stringify(plan.summary) });
    }
    // "Pronto para partir" já tem o cartão da lista (D103), no momento em que ela fecha: não repete
    const queue: Celebration[] = [];
    for (const c of plan.queue) {
      const shown =
        c.kind === 'achievement' && c.key === 'ready_to_go' && c.trip_id
          ? await db.sync_state.get(readyKey(c.trip_id))
          : undefined;
      if (!shown) queue.push({ ...c, queued_at: new Date(now).toISOString() });
    }
    if (queue.length > 0) {
      const current = parse<Celebration[]>(
        (await db.sync_state.get(progressKeys.queue))?.value,
        [],
      );
      await db.sync_state.put({
        key: progressKeys.queue,
        value: JSON.stringify(mergeQueue(current, queue)),
      });
    }
  });
}

async function locked(me: string): Promise<void> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    await navigator.locks.request('viajei:progress', () => run(me));
    return;
  }
  await run(me);
}

/** Pede uma derivação (com debounce curto). */
export function schedule(delayMs = 300): void {
  const me = uid;
  if (!me) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void locked(me).catch((err: unknown) => {
      console.warn('viajei: progressão', err);
    });
  }, delayMs);
}

export function startProgress(userId: string): void {
  if (uid === userId) return;
  stopProgress();
  uid = userId;
  synced = false;
  let phase = syncEngine.getState().phase;
  let lastSyncAt = syncEngine.getState().lastSyncAt;
  cleanups = [
    // no fim de cada ciclo do sync: o que outro aparelho marcou já está aqui
    syncEngine.subscribe(() => {
      const state = syncEngine.getState();
      if (phase === 'syncing' && state.phase === 'idle' && state.lastSyncAt !== lastSyncAt) {
        synced = true;
        lastSyncAt = state.lastSyncAt;
        schedule(0);
      }
      phase = state.phase;
    }),
    // depois de uma escrita local nas tabelas das regras (a janela do Desfazer segura a gravação)
    onMutate((table) => {
      if (FEEDS.has(table)) schedule(UNDO_WINDOW_MS + 100);
    }),
  ];
  // ao abrir o app (o aparelho novo espera o primeiro ciclo do sync)
  schedule(0);
}

export function stopProgress(): void {
  for (const c of cleanups) c();
  cleanups = [];
  if (timer) clearTimeout(timer);
  timer = null;
  uid = null;
}

/** A fila e o resumo, para quem mostra os cartões. */
export function parseQueue(raw: string | undefined): Celebration[] {
  return parse<Celebration[]>(raw, []);
}

export function parseSummary(raw: string | undefined): Summary | null {
  return parse<Summary | null>(raw, null);
}
