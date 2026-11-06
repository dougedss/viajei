import { Blob as NodeBlob } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { makeStop, makeTrip, TRIP_ID, UID } from '@/test/factories.ts';
import type { Prepared } from './prepare.ts';
import { MAX_ATTEMPTS, MediaQueue } from './queue.ts';
import type { MediaStorage, RemoveOutcome, UploadOutcome } from './storage.ts';

const STOP = makeStop({ name: 'Park Salto Ventoso' });

/** O Blob do happy-dom não sobrevive ao clone do fake-indexeddb; o do Node, sim (como no navegador). */
function blobOf(size: number): Blob {
  return new NodeBlob([new Uint8Array(size)], { type: 'image/jpeg' });
}

function photo(): Prepared {
  return {
    blob: blobOf(1234),
    mime: 'image/jpeg',
    ext: 'jpg',
    kind: 'photo',
    width: 1600,
    height: 1200,
    placeholder: 'HBkSHYSIeHiPiHh8eJd4eTN0EEQG',
    filename: 'IMG_0001.jpg',
    size: 1234,
  };
}

/** Um Storage de mentira que responde o que o teste mandar e registra o que viu. */
class FakeStorage implements MediaStorage {
  uploads: { path: string; rowExisted: boolean }[] = [];
  removes: string[] = [];
  next: UploadOutcome[] = [];
  removeNext: RemoveOutcome = { kind: 'ok' };
  async upload(path: string): Promise<UploadOutcome> {
    const id = path.split('/')[1]?.split('.')[0] ?? '';
    this.uploads.push({ path, rowExisted: (await db.attachments.get(id)) !== undefined });
    return this.next.shift() ?? { kind: 'ok' };
  }
  remove(path: string): Promise<RemoveOutcome> {
    this.removes.push(path);
    return Promise.resolve(this.removeNext);
  }
  download(): Promise<never> {
    return Promise.reject(new Error('não usado'));
  }
}

let clock = Date.parse('2026-12-11T13:42:00Z');
let storage: FakeStorage;
let queue: MediaQueue;
const target = { tripId: TRIP_ID, stopId: STOP.id, reservationId: null };

beforeEach(async () => {
  await db.delete();
  await db.open();
  clock = Date.parse('2026-12-11T13:42:00Z');
  storage = new FakeStorage();
  queue = new MediaQueue({
    db,
    storage,
    now: () => clock,
    insertRow: (row) => mutate.insert('attachments', row),
  });
  // a viagem já existe no servidor; a parada também
  await db.trips.put(makeTrip({ synced_at: '2026-11-01T10:00:01.000Z' }));
  await db.stops.put(STOP);
});

describe('fila de envio', () => {
  it('a foto entra na hora, sobe ao Storage e só depois a linha nasce (com o Blob no cache)', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    const job = await db.uploads.get(id);
    expect(job).toMatchObject({
      op: 'upload',
      state: 'waiting',
      storage_path: `${TRIP_ID}/${id}.jpg`,
    });
    expect(await db.attachments.get(id)).toBeUndefined();

    const r = await queue.drain();
    expect(r).toMatchObject({ sent: 1, offline: false });
    expect(storage.uploads).toEqual([{ path: `${TRIP_ID}/${id}.jpg`, rowExisted: false }]);
    const row = await db.attachments.get(id);
    expect(row).toMatchObject({
      kind: 'photo',
      stop_id: STOP.id,
      created_by: UID,
      size_bytes: 1234,
    });
    const ops = await db.outbox.where('[table+row_id]').equals(['attachments', id]).toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]?.op).toBe('upsert');
    expect((await db.blobs.get(id))?.size).toBe(1234);
    expect(await db.uploads.get(id)).toBeUndefined();
  });

  it('repetir é idempotente: "já existe" conta como enviado', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    storage.next = [{ kind: 'exists' }];
    expect((await queue.drain()).sent).toBe(1);
    expect(await db.attachments.get(id)).toBeDefined();
  });

  it('sem rede: fica esperando sinal, sem contar tentativa, e a rodada para', async () => {
    const a = await queue.enqueueUpload(photo(), target, UID);
    clock += 1;
    await queue.enqueueUpload(photo(), target, UID);
    storage.next = [{ kind: 'network' }];
    const r = await queue.drain();
    expect(r.offline).toBe(true);
    expect(storage.uploads).toHaveLength(1);
    expect(await db.uploads.get(a)).toMatchObject({ state: 'waiting', attempts: 0, next_at: 0 });
    expect(await db.attachments.count()).toBe(0);
  });

  it('erro do servidor espera (1 s, 2 s, …) e, na quinta, vai para Pendentes', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      storage.next = [{ kind: 'retry', message: 'HTTP 503' }];
      await queue.drain();
      const job = await db.uploads.get(id);
      expect(job).toMatchObject({ state: 'waiting', attempts: i });
      expect(job?.next_at).toBe(clock + 1000 * 2 ** (i - 1));
      // antes da hora, não tenta
      await queue.drain();
      expect(storage.uploads).toHaveLength(i);
      clock = job?.next_at ?? clock;
    }
    storage.next = [{ kind: 'retry', message: 'HTTP 503' }];
    await queue.drain();
    expect(await db.uploads.get(id)).toMatchObject({ state: 'failed', attempts: MAX_ATTEMPTS });
  });

  it('erro de regra vai direto para Pendentes e não insiste; "tentar de novo" volta para a fila', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    storage.next = [{ kind: 'rule', message: 'Sem permissão para enviar nesta viagem.' }];
    expect((await queue.drain()).failed).toBe(1);
    expect(await db.uploads.get(id)).toMatchObject({
      state: 'failed',
      last_error: 'Sem permissão para enviar nesta viagem.',
    });
    await queue.drain();
    expect(storage.uploads).toHaveLength(1);
    await queue.retry(id);
    expect((await queue.drain()).sent).toBe(1);
  });

  it('viagem criada sem sinal espera chegar ao servidor antes de subir o arquivo', async () => {
    await db.trips.update(TRIP_ID, { synced_at: null });
    await queue.enqueueUpload(photo(), target, UID);
    await queue.drain();
    expect(storage.uploads).toHaveLength(0);
  });

  it('a parada sumiu antes do envio: o envio é descartado', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    await db.stops.delete(STOP.id);
    expect((await queue.drain()).dropped).toBe(1);
    expect(await db.uploads.get(id)).toBeUndefined();
    expect(storage.uploads).toHaveLength(0);
  });

  it('tirar a foto enquanto ela sobe: nenhuma linha, e o objeto que sobrou vira trabalho de apagar', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    storage.upload = async (path) => {
      await queue.cancel(id); // a pessoa tocou no ✕ no meio do envio
      storage.uploads.push({ path, rowExisted: false });
      return { kind: 'ok' };
    };
    await queue.drain();
    expect(await db.attachments.get(id)).toBeUndefined();
    expect(await db.uploads.get(id)).toMatchObject({ op: 'remove', state: 'waiting' });
    expect((await queue.drain()).removed).toBe(1);
    expect(storage.removes).toEqual([`${TRIP_ID}/${id}.jpg`]);
  });

  it('apagar o objeto espera a lápide sair da outbox', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    await queue.drain();
    await db.outbox.clear(); // o insert foi aceito
    await mutate.remove('attachments', id); // lápide na outbox
    const row = await db.attachments.get(id);
    if (!row) throw new Error('sem linha');
    await queue.enqueueRemove(row);
    await queue.drain();
    expect(storage.removes).toHaveLength(0);
    await db.outbox.clear(); // a lápide foi aceita
    await queue.drain();
    expect(storage.removes).toEqual([row.storage_path]);
    expect(await db.uploads.get(id)).toBeUndefined();
  });

  it('remoção negada (a linha voltou a viver) sai da fila: o expurgo cuida', async () => {
    const id = await queue.enqueueUpload(photo(), target, UID);
    await queue.drain();
    await db.outbox.clear();
    const row = await db.attachments.get(id);
    if (!row) throw new Error('sem linha');
    await queue.enqueueRemove(row);
    storage.removeNext = { kind: 'denied' };
    expect((await queue.drain()).removed).toBe(1);
    expect(await db.uploads.get(id)).toBeUndefined();
  });
});
