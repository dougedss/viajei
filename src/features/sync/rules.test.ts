import { describe, expect, it } from 'vitest';
import type { OutboxOp } from '@/lib/db/schema.ts';
import { describeColumns, describeOp, stateLabel } from './rules.ts';

function op(over: Partial<OutboxOp>): OutboxOp {
  return {
    seq: 1,
    trip_id: 't',
    table: 'trips',
    row_id: 't',
    op: 'patch',
    values: {},
    versions: {},
    updated_at: '',
    state: 'pending',
    attempts: 0,
    next_at: 0,
    last_error: null,
    created_at: 0,
    ...over,
  };
}

describe('descrição das pendências', () => {
  const ctx = { tripName: 'Serra', memberName: null };

  it('viagem: nova, editada, excluída', () => {
    expect(describeOp(op({ op: 'upsert' }), ctx)).toEqual({
      title: 'Viagem nova',
      detail: 'Serra',
    });
    expect(describeOp(op({ values: { notes: 'x', budget: 1 } }), ctx)).toEqual({
      title: 'Viagem · Serra',
      detail: 'observações, orçamento',
    });
    expect(describeOp(op({ values: { deleted_at: 'now' } }), ctx).title).toBe('Exclusão da viagem');
  });

  it('membros: convite, remoção, reconvite', () => {
    const base = { table: 'trip_members' as const, row_id: 'm' };
    expect(
      describeOp(op({ ...base, op: 'upsert', values: { invited_email: 'ana@x.com' } }), ctx),
    ).toEqual({
      title: 'Convite',
      detail: 'ana@x.com · Serra',
    });
    expect(
      describeOp(op({ ...base, values: { deleted_at: 'now' } }), {
        tripName: 'Serra',
        memberName: 'Ana',
      }).title,
    ).toBe('Remoção do time');
    expect(describeOp(op({ ...base, values: { deleted_at: null } }), ctx).title).toBe('Reconvite');
  });

  it('colunas desconhecidas passam como estão; viagem removida tem rótulo', () => {
    expect(describeColumns(['name', 'xyz'])).toBe('nome, xyz');
    expect(describeOp(op({ op: 'upsert' }), { tripName: null, memberName: null }).detail).toBe(
      'viagem removida',
    );
  });

  it('estado em palavras', () => {
    expect(stateLabel({ state: 'pending', attempts: 0, last_error: null })).toBe(
      'Aguardando envio',
    );
    expect(stateLabel({ state: 'pending', attempts: 2, last_error: '500' })).toMatch(
      /2ª tentativa/,
    );
    expect(stateLabel({ state: 'failed', attempts: 0, last_error: 'Sem permissão.' })).toBe(
      'Sem permissão.',
    );
  });
});
