import { describe, expect, it } from 'vitest';
import {
  handlePurge,
  PURGE_DAYS,
  PURGE_STORAGE_BATCH,
  purgeCutoffs,
  purgeReportSchema,
  type PurgeDeps,
  type PurgeMode,
} from './purge.ts';

const NOW = new Date('2026-12-20T07:00:00.000Z');

/** Um relatório como a função SQL escreve (as chaves vêm da 0012). */
function report(over: { dry_run?: boolean; paths?: string[] } = {}) {
  return {
    dry_run: over.dry_run ?? true,
    trips: { count: 1, newest: '2026-11-15T10:00:00.000Z' },
    trip_rows: { stops: 18, trip_days: 4, expenses: 3 },
    trip_kept: { xp_events: 12, achievements: 2, ai_imports: 1 },
    tombstones: { stops: { count: 2, newest: '2026-09-01T10:00:00.000Z' } },
    held: 1,
    horizons: { trips: 1, users: 0 },
    logs: { notifications_sent: { count: 40, newest: '2026-09-10T00:00:00.000Z' } },
    storage: {
      trip_objects: 2,
      orphans: { count: 1, newest: '2026-12-01T00:00:00.000Z' },
      paths: over.paths ?? [],
    },
  };
}

type Call = { fn: string; args: Record<string, unknown> };
function deps(
  mode: PurgeMode,
  data: unknown,
  error: { code?: string; message: string } | null = null,
) {
  const calls: Call[] = [];
  const removed: string[][] = [];
  const logs: Record<string, unknown>[] = [];
  const d: PurgeDeps = {
    mode,
    now: () => NOW,
    rpc: (fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ data, error });
    },
    remove: (paths) => {
      removed.push(paths);
      if (paths.includes('falha/x.jpg')) return Promise.reject(new Error('503'));
      return Promise.resolve(paths.length);
    },
    log: (line) => logs.push(line),
  };
  return { d, calls, removed, logs };
}

const post = (body: unknown) =>
  new Request('https://x.supabase.co/functions/v1/purge', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('purgeCutoffs', () => {
  it('30 dias para viagens, 90 para lápides e registros, 7 para objetos sem linha', () => {
    expect(PURGE_DAYS).toEqual({ trips: 30, tombstones: 90, logs: 90, orphans: 7 });
    expect(purgeCutoffs(NOW)).toEqual({
      p_trips_before: '2026-11-20T07:00:00.000Z',
      p_tombstones_before: '2026-09-21T07:00:00.000Z',
      p_logs_before: '2026-09-21T07:00:00.000Z',
      p_orphans_before: '2026-12-13T07:00:00.000Z',
    });
  });
});

describe('purgeReportSchema', () => {
  it('aceita o relatório do banco, com ou sem caminhos', () => {
    expect(purgeReportSchema.parse(report()).storage.paths).toEqual([]);
    const storage = Object.fromEntries(
      Object.entries(report().storage).filter(([key]) => key !== 'paths'),
    );
    expect(purgeReportSchema.parse({ ...report(), storage }).storage.paths).toEqual([]);
  });
});

describe('handlePurge', () => {
  it('sem dry_run no corpo, é dry_run: nada sai do Storage', async () => {
    const { d, calls, removed } = deps('secret', report({ paths: ['t/a.jpg'] }));
    const res = await handlePurge(post({}), d);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ fn: 'purge', args: { ...purgeCutoffs(NOW), p_dry_run: true } }]);
    expect(removed).toEqual([]);
  });

  it('de verdade, apaga os objetos em lotes pela API do Storage', async () => {
    const paths = Array.from({ length: 250 }, (_, i) => `trip/obj-${i}.jpg`);
    const { d, calls, removed } = deps('secret', report({ dry_run: false, paths }));
    const res = await handlePurge(post({ dry_run: false }), d);
    const body = (await res.json()) as { storage: { removed: number; failed: number } };
    expect(calls[0]?.args.p_dry_run).toBe(false);
    expect(removed.map((b) => b.length)).toEqual([PURGE_STORAGE_BATCH, PURGE_STORAGE_BATCH, 50]);
    expect(body.storage).toMatchObject({ removed: 250, failed: 0 });
  });

  it('um lote que falha conta como falho e os outros seguem', async () => {
    const paths = ['falha/x.jpg', ...Array.from({ length: 120 }, (_, i) => `t/${i}.jpg`)];
    const { d } = deps('secret', report({ dry_run: false, paths }));
    const body = (await (await handlePurge(post({ dry_run: false }), d)).json()) as {
      storage: { removed: number; failed: number };
    };
    expect(body.storage).toMatchObject({ removed: 21, failed: 100 });
  });

  it('a resposta e o log não levam caminho de arquivo; o log é só números', async () => {
    const paths = ['aaaaaaaa-trip/bbbbbbbb-anexo.jpg'];
    const { d, logs } = deps('secret', report({ dry_run: false, paths }));
    const text = await (await handlePurge(post({ dry_run: false }), d)).text();
    expect(text).not.toContain('bbbbbbbb');
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).not.toContain('bbbbbbbb');
    expect(logs[0]).toMatchObject({
      dry_run: false,
      by: 'secret',
      trips: 1,
      trip_rows: 25,
      trip_kept: 15,
      tombstones: 2,
      held: 1,
      logs: 40,
      storage: { trip_objects: 2, orphans: 1, removed: 1, failed: 0 },
    });
  });

  it('pelo laboratório, só o dry_run, como a pessoa', async () => {
    const { d, calls, removed } = deps('user', report({ paths: ['t/a.jpg'] }));
    const res = await handlePurge(post({ dry_run: true }), d);
    expect(res.status).toBe(200);
    expect(calls).toEqual([{ fn: 'lab_purge_preview', args: purgeCutoffs(NOW) }]);
    expect(removed).toEqual([]);
  });

  it('pelo laboratório, pedir para apagar é recusado antes de chegar ao banco', async () => {
    const { d, calls } = deps('user', report());
    expect((await handlePurge(post({ dry_run: false }), d)).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('quem não é executor do laboratório recebe 403 do banco', async () => {
    const { d } = deps('user', null, { code: '42501', message: 'só o laboratório' });
    expect((await handlePurge(post({}), d)).status).toBe(403);
  });

  it('erro do banco ou relatório fora do formato viram 500', async () => {
    expect((await handlePurge(post({}), deps('secret', null, { message: 'x' }).d)).status).toBe(
      500,
    );
    expect((await handlePurge(post({}), deps('secret', { dry_run: true }).d)).status).toBe(500);
  });

  it('só POST, e o corpo é { dry_run }', async () => {
    const get = new Request('https://x.supabase.co/functions/v1/purge');
    expect((await handlePurge(get, deps('secret', report()).d)).status).toBe(405);
    expect((await handlePurge(post({ dry_run: 'sim' }), deps('secret', report()).d)).status).toBe(
      400,
    );
  });
});
