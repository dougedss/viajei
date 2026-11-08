import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  insertable,
  makeAttachment,
  makeContact,
  makeDay,
  makeMember,
  makeStop,
  makeTrip,
  OTHER_UID,
  TRIP_ID,
  UID,
} from '@/test/factories.ts';
import { mutate } from '../mutate.ts';
import { db, syncKeys, type UploadJob } from '../schema.ts';
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
      resync: false,
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
    expect(stats).toEqual({ upserted: 2, removed: 0, dropped: 0, revoked: false });
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
      resync: false,
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
      resync: false,
      tables: { trips: [serverRow(makeTrip())] },
      profiles: [],
    });
    await mutate.patch('trips', TRIP_ID, { notes: 'edição local ainda não enviada' });
    await applyTripPull(db, TRIP_ID, {
      server_time: SERVER_TIME,
      revoked: false,
      resync: false,
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
      resync: false,
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

describe('resync: o cursor é anterior ao horizonte do expurgo', () => {
  /** O Blob do happy-dom não sobrevive ao clone do fake-indexeddb; o do Node, sim. */
  const blob = (): Blob => new NodeBlob([new Uint8Array(8)], { type: 'image/jpeg' });
  const OTHER_TRIP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('tira o que o servidor não tem mais e guarda tudo o que está pendente', async () => {
    const kept = serverRow(makeStop({ name: 'Cascata do Caracol' }));
    const ghost = serverRow(makeStop({ name: 'Parada expurgada' }));
    const edited = serverRow(makeStop({ name: 'Casa Valduga' }));
    const otherTrip = serverRow(makeStop({ trip_id: OTHER_TRIP, name: 'De outra viagem' }));
    const photo = makeAttachment({ stop_id: kept.id });
    await db.trips.put(serverRow(makeTrip()));
    await db.trip_members.put(serverRow(makeMember()));
    await db.trip_days.put(serverRow(makeDay()));
    await db.stops.bulkPut([kept, ghost, edited, otherTrip]);
    await db.attachments.put(photo);
    await db.blobs.put({
      attachment_id: photo.id,
      trip_id: TRIP_ID,
      kind: 'photo',
      size: 8,
      blob: blob(),
      stored_at: SERVER_TIME,
      last_used_at: SERVER_TIME,
    });
    const waiting = makeAttachment({ stop_id: kept.id });
    const job: UploadJob = {
      op: 'upload',
      attachment_id: waiting.id,
      trip_id: TRIP_ID,
      storage_path: waiting.storage_path,
      state: 'waiting',
      attempts: 0,
      next_at: 0,
      last_error: null,
      created_at: 0,
      blob: blob(),
      row: insertable(waiting),
    };
    await db.uploads.put(job);
    // criada sem sinal (nunca carimbada) e editada sem sinal (operação na outbox)
    const fresh = makeStop({ name: 'Nova, sem sinal' });
    await mutate.insert('stops', insertable(fresh));
    await mutate.patch('stops', edited.id, { notes: 'anotada sem sinal' });

    const stats = await applyTripPull(
      db,
      TRIP_ID,
      parseTripPull({
        server_time: SERVER_TIME,
        resync: true,
        trips: [serverRow(makeTrip())],
        trip_members: [serverRow(makeMember())],
        trip_days: [serverRow(makeDay())],
        stops: [kept, { ...edited, notes: null }],
        attachments: [],
        profiles: [],
      }),
    );

    expect(stats.dropped).toBe(2);
    const names = (await db.stops.toArray()).map((s) => s.name).sort();
    expect(names).toEqual([
      'Casa Valduga',
      'Cascata do Caracol',
      'De outra viagem',
      'Nova, sem sinal',
    ]);
    expect((await db.stops.get(edited.id))?.notes).toBe('anotada sem sinal');
    expect(await db.attachments.get(photo.id)).toBeUndefined();
    // o cache e a fila de fotos não são do servidor: ficam
    expect(await db.blobs.get(photo.id)).toBeDefined();
    expect(await db.uploads.get(waiting.id)).toBeDefined();
    expect(await db.outbox.count()).toBe(2);
    expect((await db.sync_state.get(syncKeys.tripCursor(TRIP_ID)))?.value).toBe(SERVER_TIME);
  });

  it('uma tabela que a resposta não trouxe fica como está', async () => {
    const contact = serverRow(makeContact());
    await db.contacts.put(contact);
    await applyTripPull(
      db,
      TRIP_ID,
      parseTripPull({ server_time: SERVER_TIME, resync: true, trips: [serverRow(makeTrip())] }),
    );
    expect(await db.contacts.get(contact.id)).toBeDefined();
  });

  it('sem resync, a linha que o pull não trouxe continua (o pull é só o que mudou)', async () => {
    const stop = serverRow(makeStop());
    await db.stops.put(stop);
    const stats = await applyTripPull(
      db,
      TRIP_ID,
      parseTripPull({ server_time: SERVER_TIME, stops: [] }),
    );
    expect(stats.dropped).toBe(0);
    expect(await db.stops.get(stop.id)).toBeDefined();
  });

  it('no pull do usuário, a participação que sumiu vira viagem deixada', async () => {
    await db.sync_state.put({ key: syncKeys.uid, value: UID });
    const mine = serverRow(makeMember());
    const gone = serverRow(makeMember({ id: 'm-sumiu', trip_id: OTHER_TRIP }));
    const someoneElse = serverRow(
      makeMember({ id: 'm-outro', trip_id: OTHER_TRIP, user_id: OTHER_UID }),
    );
    await db.trip_members.bulkPut([mine, gone, someoneElse]);
    const change = await applyUserPull(
      db,
      parseUserPull({ server_time: SERVER_TIME, resync: true, memberships: [mine] }),
    );
    expect(change.left).toEqual([OTHER_TRIP]);
    expect((await db.trip_members.toArray()).map((m) => m.id).sort()).toEqual(
      [mine.id, someoneElse.id].sort(),
    );
  });
});

describe('applyUserPull', () => {
  it('participação aceita entra no Dexie (é por ela que a viagem é puxada); lápide vai para "saiu"', async () => {
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
    expect(change).toEqual({ left: ['outra'] });
    expect((await db.trip_members.toArray()).map((m) => m.trip_id)).toEqual([TRIP_ID]);
    expect((await db.sync_state.get(syncKeys.userCursor))?.value).toBe(SERVER_TIME);
  });
});
