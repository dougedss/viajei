import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  coalesce,
  describeError,
  orderByRank,
  resolveResults,
  toBatches,
  type PushOp,
} from './outbox.ts';
import type { OutboxOp } from './schema.ts';

function op(over: Partial<OutboxOp> & { seq: number }): OutboxOp {
  return {
    trip_id: 't1',
    table: 'trips',
    row_id: 't1',
    op: 'patch',
    values: {},
    versions: {},
    updated_at: '2026-11-01T10:00:00.000Z',
    state: 'pending',
    attempts: 0,
    next_at: 0,
    last_error: null,
    created_at: 0,
    ...over,
  };
}

describe('coalesce', () => {
  it('funde upsert seguido de patches num upsert com os valores mais novos', () => {
    const ops = [
      op({
        seq: 1,
        op: 'upsert',
        values: { name: 'A', notes: 'x' },
        versions: { name: 'v1', notes: 'v1' },
      }),
      op({
        seq: 2,
        values: { name: 'B' },
        versions: { name: 'v2' },
        updated_at: '2026-11-01T11:00:00.000Z',
      }),
      op({
        seq: 3,
        values: { notes: 'y' },
        versions: { notes: 'v3' },
        updated_at: '2026-11-01T12:00:00.000Z',
      }),
    ];
    const [merged] = coalesce(ops);
    expect(merged).toMatchObject({
      seq: 1,
      op: 'upsert',
      values: { name: 'B', notes: 'y' },
      versions: { name: 'v2', notes: 'v3' },
      updated_at: '2026-11-01T12:00:00.000Z',
      sources: [1, 2, 3],
    });
  });

  it('patch com patch vira patch; a versão mais nova por coluna vence mesmo fora de ordem', () => {
    const ops = [
      op({ seq: 2, values: { notes: 'nova' }, versions: { notes: '2026-11-02' } }),
      op({ seq: 1, values: { notes: 'velha' }, versions: { notes: '2026-11-01' } }),
    ];
    const [merged] = coalesce(ops);
    expect(merged?.op).toBe('patch');
    expect(merged?.values).toEqual({ notes: 'nova' });
    expect(merged?.sources).toEqual([1, 2]);
  });

  it('linhas diferentes não se misturam', () => {
    const ops = [op({ seq: 1, row_id: 'a' }), op({ seq: 2, row_id: 'b' })];
    expect(coalesce(ops)).toHaveLength(2);
  });
});

describe('orderByRank', () => {
  it('pais antes de filhos, mesmo que o filho tenha seq menor', () => {
    const ops: PushOp[] = [
      {
        seq: 1,
        table: 'trip_members',
        id: 'm',
        op: 'upsert',
        values: {},
        versions: {},
        updated_at: '',
        sources: [1],
      },
      {
        seq: 2,
        table: 'trips',
        id: 't',
        op: 'upsert',
        values: {},
        versions: {},
        updated_at: '',
        sources: [2],
      },
    ];
    expect(orderByRank(ops).map((o) => o.table)).toEqual(['trips', 'trip_members']);
  });
});

describe('toBatches', () => {
  it('quebra em lotes de 200 depois de fundir', () => {
    const ops = Array.from({ length: 401 }, (_, i) => op({ seq: i + 1, row_id: `r${i}` }));
    const batches = toBatches(ops);
    expect(batches.map((b) => b.length)).toEqual([200, 200, 1]);
  });
});

describe('backoffMs', () => {
  it('1 s, 2 s, 4 s… até 60 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 10].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000,
    ]);
  });
});

describe('resolveResults', () => {
  const batch: PushOp[] = [
    {
      seq: 1,
      table: 'trips',
      id: 'a',
      op: 'patch',
      values: {},
      versions: { notes: 'v' },
      updated_at: '',
      sources: [1, 4],
    },
    {
      seq: 2,
      table: 'trips',
      id: 'b',
      op: 'patch',
      values: {},
      versions: { name: 'v' },
      updated_at: '',
      sources: [2],
    },
    {
      seq: 3,
      table: 'trips',
      id: 'c',
      op: 'patch',
      values: {},
      versions: {},
      updated_at: '',
      sources: [3],
    },
    {
      seq: 5,
      table: 'trips',
      id: 'd',
      op: 'patch',
      values: {},
      versions: {},
      updated_at: '',
      sources: [5],
    },
  ];

  it('applied e ignored saem da fila; stale sai com aviso; error vai para Pendentes com mensagem; sem resposta também', () => {
    const r = resolveResults(batch, [
      { seq: 1, status: 'applied', superseded: ['notes'] },
      { seq: 2, status: 'stale' },
      { seq: 3, status: 'error', code: '42501', message: 'x' },
    ]);
    expect(r.done).toEqual([1, 4, 2]);
    expect(r.failed).toEqual([
      { seq: 3, error: 'Sem permissão para esta alteração.' },
      { seq: 5, error: 'sem resposta do servidor' },
    ]);
    expect(r.notices).toEqual([
      { table: 'trips', id: 'a', columns: ['notes'] },
      { table: 'trips', id: 'b', columns: ['name'] },
    ]);
  });

  it('describeError traduz códigos conhecidos e repassa a mensagem dos outros', () => {
    expect(describeError('P0002', undefined)).toMatch(/não existe mais/);
    expect(describeError('XX000', 'boom')).toBe('boom');
    expect(describeError(undefined, undefined)).toMatch(/recusou/);
  });
});
