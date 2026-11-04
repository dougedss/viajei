import { beforeEach, describe, expect, it } from 'vitest';
import { insertable, makeMember, makeTrip, TRIP_ID, UID } from '@/test/factories.ts';
import { mutate } from '../mutate.ts';
import { db, syncKeys } from '../schema.ts';
import { applyTripPull, applyUserPull, parseTripPull, parseUserPull } from './apply-pull.ts';

const SERVER_TIME = '2026-11-04T12:00:00.000Z';

function serverRow<T extends object>(row: T) {
  return { ...row, synced_at: SERVER_TIME };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('parseTripPull', () => {
  it('valida o envelope e separa as tabelas conhecidas', () => {
    const p = parseTripPull({
      server_time: SERVER_TIME,
      trips: [serverRow(makeTrip())],
      trip_members: [],
      profiles: [{ id: UID, name: 'Douglas', color: 'sunset' }],
      alguma_tabela_futura: [{ id: 'x' }],
    });
    expect(p.revoked).toBe(false);
    expect(p.tables.trips).toHaveLength(1);
    expect(p.profiles).toHaveLength(1);
  });

  it('recusa envelope sem server_time', () => {
    expect(() => parseTripPull({ trips: [] })).toThrow();
  });
});

describe('applyTripPull', () => {
  it('grava as linhas, os perfis e o cursor', async () => {
    const stats = await applyTripPull(db, TRIP_ID, {
      server_time: SERVER_TIME,
      revoked: false,
      tables: { trips: [serverRow(makeTrip())], trip_members: [serverRow(makeMember())] },
      profiles: [
        {
          id: UID,
          name: 'Douglas',
          color: 'sunset',
          created_at: '',
          updated_at: '',
          synced_at: SERVER_TIME,
        },
      ],
    });
    expect(stats).toEqual({ upserted: 2, removed: 0, revoked: false });
    expect((await db.trips.get(TRIP_ID))?.synced_at).toBe(SERVER_TIME);
    expect(await db.profiles.count()).toBe(1);
    expect((await db.sync_state.get(syncKeys.tripCursor(TRIP_ID)))?.value).toBe(SERVER_TIME);
  });

  it('a lápide da viagem remove a viagem e os membros locais', async () => {
    await db.trips.put(makeTrip());
    await db.trip_members.put(makeMember());
    const stats = await applyTripPull(db, TRIP_ID, {
      server_time: SERVER_TIME,
      revoked: false,
      tables: { trips: [serverRow(makeTrip({ deleted_at: SERVER_TIME }))] },
      profiles: [],
    });
    expect(stats.removed).toBe(1);
    expect(await db.trips.count()).toBe(0);
    expect(await db.trip_members.count()).toBe(0);
  });

  it('o que está pendente na outbox fica por cima da linha do servidor (sem piscar)', async () => {
    await applyTripPull(db, TRIP_ID, {
      server_time: '2026-11-04T11:00:00.000Z',
      revoked: false,
      tables: { trips: [serverRow(makeTrip())] },
      profiles: [],
    });
    await mutate.patch('trips', TRIP_ID, { notes: 'edição local ainda não enviada' });
    await applyTripPull(db, TRIP_ID, {
      server_time: SERVER_TIME,
      revoked: false,
      tables: { trips: [serverRow(makeTrip({ notes: 'do servidor', origin: 'Curitiba' }))] },
      profiles: [],
    });
    const row = await db.trips.get(TRIP_ID);
    expect(row?.notes).toBe('edição local ainda não enviada');
    expect(row?.origin).toBe('Curitiba');
    expect(row?.synced_at).toBe(SERVER_TIME);
  });

  it('revoked apaga a viagem, os filhos, o cursor e as operações sem destino', async () => {
    await mutate.insert('trips', insertable(makeTrip()));
    await db.trip_members.put(makeMember());
    await db.sync_state.put({ key: syncKeys.tripCursor(TRIP_ID), value: SERVER_TIME });
    const stats = await applyTripPull(db, TRIP_ID, {
      server_time: SERVER_TIME,
      revoked: true,
      tables: {},
      profiles: [],
    });
    expect(stats.revoked).toBe(true);
    expect(await db.trips.count()).toBe(0);
    expect(await db.trip_members.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.sync_state.get(syncKeys.tripCursor(TRIP_ID))).toBeUndefined();
  });
});

describe('applyUserPull', () => {
  it('participação aceita entra no Dexie e vai para a lista de viagens a puxar; lápide vai para "saiu"', async () => {
    const change = await applyUserPull(
      db,
      parseUserPull({
        server_time: SERVER_TIME,
        memberships: [
          serverRow(makeMember()),
          serverRow(makeMember({ id: 'm2', trip_id: 'outra', deleted_at: SERVER_TIME })),
          serverRow(makeMember({ id: 'm3', trip_id: 'pendente', status: 'pending' })),
        ],
      }),
    );
    expect(change).toEqual({ accepted: [TRIP_ID], left: ['outra'] });
    expect(await db.trip_members.count()).toBe(1);
    expect((await db.sync_state.get(syncKeys.userCursor))?.value).toBe(SERVER_TIME);
  });
});
