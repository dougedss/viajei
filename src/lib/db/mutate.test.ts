import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertable, makeDay, makeMember, makeStop, makeTrip, TRIP_ID } from '@/test/factories.ts';
import { mutate, onMutate } from './mutate.ts';
import { db } from './schema.ts';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('mutate', () => {
  it('insert grava a linha e a operação upsert na mesma transação, com versão para cada coluna', async () => {
    const listener = vi.fn();
    const off = onMutate(listener);
    const trip = insertable(makeTrip());
    await mutate.insert('trips', trip);
    off();

    const row = await db.trips.get(TRIP_ID);
    expect(row?.name).toBe(trip.name);
    expect(row?.synced_at).toBeNull();
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      table: 'trips',
      row_id: TRIP_ID,
      op: 'upsert',
      trip_id: TRIP_ID,
      state: 'pending',
    });
    expect(ops[0]!.values).not.toHaveProperty('synced_at');
    expect(ops[0]!.values).not.toHaveProperty('created_at');
    expect(ops[0]!.values).not.toHaveProperty('updated_at');
    expect(Object.keys(ops[0]!.versions).sort()).toEqual(Object.keys(ops[0]!.values).sort());
    expect(listener).toHaveBeenCalledWith('trips');
  });

  it('patch grava só as colunas tocadas e atualiza a linha local', async () => {
    await mutate.insert('trips', insertable(makeTrip()));
    await mutate.patch('trips', TRIP_ID, { notes: 'levar mate' });
    const row = await db.trips.get(TRIP_ID);
    expect(row?.notes).toBe('levar mate');
    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({ op: 'patch', values: { notes: 'levar mate' } });
    expect(Object.keys(ops[1]!.versions)).toEqual(['notes']);
  });

  it('patch de linha que não existe localmente falha e não enfileira nada', async () => {
    await expect(mutate.patch('trips', 'nope', { notes: 'x' })).rejects.toThrow('não existe');
    expect(await db.outbox.count()).toBe(0);
  });

  it('remove é um patch em deleted_at: a linha fica, marcada', async () => {
    await mutate.insert('trips', insertable(makeTrip()));
    await mutate.remove('trips', TRIP_ID);
    expect((await db.trips.get(TRIP_ID))?.deleted_at).not.toBeNull();
    expect((await db.outbox.orderBy('seq').last())?.values).toHaveProperty('deleted_at');
  });

  it('project grava a projeção local sem enfileirar (linha que o servidor deriva)', async () => {
    await mutate.project('trip_members', insertable(makeMember()));
    expect(await db.trip_members.count()).toBe(1);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a operação de um membro carrega o trip_id da viagem', async () => {
    const member = insertable(
      makeMember({
        role: 'member',
        status: 'pending',
        user_id: null,
        invited_email: 'ana@x.com',
        id: 'm1',
      }),
    );
    await mutate.insert('trip_members', member);
    expect((await db.outbox.toArray())[0]?.trip_id).toBe(TRIP_ID);
  });
});

describe('mutate.batch', () => {
  it('várias tabelas numa transação, na ordem dada, com um aviso por tabela', async () => {
    await mutate.insert('trips', insertable(makeTrip()));
    const listener = vi.fn<(table: string) => void>();
    const off = onMutate(listener);
    await mutate.batch([
      { kind: 'patch', table: 'trips', id: TRIP_ID, changes: { end_date: '2026-12-15' } },
      { kind: 'insert', table: 'trip_days', row: insertable(makeDay({ id: 'd1' })) },
      {
        kind: 'insert',
        table: 'stops',
        row: insertable(makeStop({ id: 's1', trip_day_id: 'd1' })),
      },
      {
        kind: 'insert',
        table: 'stops',
        row: insertable(makeStop({ id: 's2', trip_day_id: 'd1' })),
      },
      { kind: 'patch', table: 'trip_days', id: 'd1', changes: { title: 'Ida' } },
    ]);
    off();
    expect((await db.trips.get(TRIP_ID))?.end_date).toBe('2026-12-15');
    expect((await db.trip_days.get('d1'))?.title).toBe('Ida');
    expect(await db.stops.count()).toBe(2);
    const ops = (await db.outbox.orderBy('seq').toArray()).slice(1);
    expect(ops.map((o) => `${o.table}:${o.op}:${o.row_id}`)).toEqual([
      `trips:patch:${TRIP_ID}`,
      'trip_days:upsert:d1',
      'stops:upsert:s1',
      'stops:upsert:s2',
      'trip_days:patch:d1',
    ]);
    // todas com a mesma hora: uma escrita só, vista pelo time de uma vez
    expect(new Set(ops.map((o) => o.updated_at)).size).toBe(1);
    expect(listener.mock.calls.map(([t]) => t).sort()).toEqual(['stops', 'trip_days', 'trips']);
  });

  it('tudo ou nada: uma escrita que falha desfaz o lote inteiro, no aparelho e na outbox', async () => {
    await expect(
      mutate.batch([
        { kind: 'insert', table: 'trip_days', row: insertable(makeDay({ id: 'd1' })) },
        { kind: 'patch', table: 'stops', id: 'nao-existe', changes: { name: 'x' } },
      ]),
    ).rejects.toThrow('não existe');
    expect(await db.trip_days.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('lote vazio não escreve nem avisa', async () => {
    const listener = vi.fn();
    const off = onMutate(listener);
    await mutate.batch([]);
    off();
    expect(listener).not.toHaveBeenCalled();
    expect(await db.outbox.count()).toBe(0);
  });
});
