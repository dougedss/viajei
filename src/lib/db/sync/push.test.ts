import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertable, makeTrip, TRIP_ID } from '@/test/factories.ts';
import { mutate } from '../mutate.ts';
import { MAX_ATTEMPTS, type PushOp, type PushResult } from '../outbox.ts';
import { db, syncKeys } from '../schema.ts';
import { discardOp, pushOutbox, retryOp } from './push.ts';

const answering = (status: PushResult['status'], extra: Partial<PushResult> = {}) =>
  vi.fn((ops: PushOp[]) =>
    Promise.resolve(ops.map((o): PushResult => ({ seq: o.seq, status, ...extra }))),
  );
const failing = (err: Error) => vi.fn((): Promise<PushResult[]> => Promise.reject(err));

beforeEach(async () => {
  await db.delete();
  await db.open();
  await mutate.insert('trips', insertable(makeTrip()));
  await mutate.patch('trips', TRIP_ID, { notes: 'x' });
});

describe('pushOutbox', () => {
  it('manda um lote fundido e tira da fila o que foi aplicado', async () => {
    const rpc = answering('applied');
    const out = await pushOutbox(db, rpc);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toHaveLength(1); // upsert + patch fundidos
    expect(out).toMatchObject({ done: 2, failed: 0, offline: false });
    expect(await db.outbox.count()).toBe(0);
  });

  it('erro de regra numa operação vai para Pendentes com o motivo, sem contar tentativa', async () => {
    const out = await pushOutbox(db, answering('error', { code: '42501', message: 'rls' }));
    expect(out.failed).toBe(2);
    const ops = await db.outbox.toArray();
    expect(
      ops.every(
        (o) => o.state === 'failed' && o.last_error === 'Sem permissão para esta alteração.',
      ),
    ).toBe(true);
  });

  it('erro de rede não conta tentativa: marca offline e deixa tudo como estava', async () => {
    const out = await pushOutbox(db, failing(new TypeError('Failed to fetch')));
    expect(out.offline).toBe(true);
    const ops = await db.outbox.toArray();
    expect(ops.every((o) => o.state === 'pending' && o.attempts === 0)).toBe(true);
  });

  it('erro do servidor no lote agenda backoff e, na quinta tentativa, vai para Pendentes', async () => {
    const rpc = failing(new Error('500'));
    let now = 1_000_000;
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await pushOutbox(db, rpc, now);
      const op = (await db.outbox.toArray())[0]!;
      expect(op.attempts).toBe(i);
      expect(op.state).toBe('pending');
      expect(op.next_at).toBeGreaterThan(now);
      // antes do next_at, nada é enviado
      const calls = rpc.mock.calls.length;
      await pushOutbox(db, rpc, now + 10);
      expect(rpc.mock.calls.length).toBe(calls);
      now = op.next_at;
    }
    await pushOutbox(db, rpc, now);
    expect((await db.outbox.toArray()).every((o) => o.state === 'failed')).toBe(true);
  });

  it('tentar de novo volta a operação para a fila', async () => {
    const seqs = (await db.outbox.toArray()).map((o) => o.seq);
    await db.outbox.update(seqs[0]!, { state: 'failed', attempts: 5, last_error: 'x' });
    await retryOp(db, seqs[0]!);
    expect(await db.outbox.get(seqs[0]!)).toMatchObject({
      state: 'pending',
      attempts: 0,
      last_error: null,
    });
  });

  it('descartar um patch zera o cursor da viagem (o próximo pull desfaz a edição local)', async () => {
    await db.sync_state.put({
      key: syncKeys.tripCursor(TRIP_ID),
      value: '2026-11-04T00:00:00.000Z',
    });
    const patch = (await db.outbox.orderBy('seq').last())!;
    await discardOp(db, patch.seq);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.trips.get(TRIP_ID)).toBeDefined();
    expect(await db.sync_state.get(syncKeys.tripCursor(TRIP_ID))).toBeUndefined();
  });

  it('descartar um insert nunca aceito apaga a linha local', async () => {
    const insert = (await db.outbox.orderBy('seq').first())!;
    await discardOp(db, insert.seq);
    expect(await db.trips.get(TRIP_ID)).toBeUndefined();
  });

  it('stale sai da fila e vira aviso de edição superada', async () => {
    const out = await pushOutbox(db, answering('stale'));
    expect(out.done).toBe(2);
    expect(out.notices).toHaveLength(1);
    expect(out.notices[0]?.id).toBe(TRIP_ID);
  });
});
