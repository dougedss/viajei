import { beforeEach, describe, expect, it, vi } from 'vitest';
import { insertable, makeMember, makeTrip, TRIP_ID } from '@/test/factories.ts';
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
