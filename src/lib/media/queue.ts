import { backoffMs } from '@/lib/db/outbox.ts';
import type {
  Attachment,
  AttachmentDraft,
  MediaJob,
  RemoveJob,
  UploadJob,
  ViajeiDb,
} from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import type { Prepared } from './types.ts';
import type { MediaStorage } from './storage.ts';

/**
 * A fila de envio de fotos e documentos, que existe porque a cascata não tem sinal e a foto é
 * tirada lá. A foto entra na hora (o Blob comprimido e a linha pronta, em `uploads`) e aparece pelo
 * Blob local; com rede, sobe ao Storage e só depois a linha nasce em `attachments` pela `mutate`.
 * O servidor nunca tem linha sem arquivo.
 *
 * Estados guardados: `waiting` (na vez, ou esperando sinal) e `failed` (recusado por regra, em
 * Pendentes). Em memória: o trabalho em andamento. Um envio repetido é idempotente: o caminho é
 * `{viagem}/{anexo}.{ext}` e "já existe" conta como enviado.
 *
 * A remoção também passa por aqui: tirar uma foto enviada grava a lápide e, se quem tira enviou o
 * arquivo ou é dono da viagem, um trabalho `remove` espera a lápide sair da outbox para apagar o
 * objeto (o Storage só deixa apagar sem linha viva).
 */
export const MAX_ATTEMPTS = 5;

export type QueueDeps = {
  db: ViajeiDb;
  storage: MediaStorage;
  now: () => number;
  /** grava a linha do anexo (a `mutate.insert`), dentro da transação do registro */
  insertRow: (row: AttachmentDraft) => Promise<void>;
  /** um arquivo acabou de ficar guardado neste aparelho (para pedir `persist()` uma vez) */
  onStored?: () => void;
};

export type DrainResult = {
  sent: number;
  removed: number;
  failed: number;
  /** destino (parada ou reserva) sumiu antes do envio */
  dropped: number;
  offline: boolean;
};

export type UploadTarget = {
  tripId: string;
  stopId: string | null;
  reservationId: string | null;
};

export class MediaQueue {
  #deps: QueueDeps;
  #running: Promise<DrainResult> | null = null;

  constructor(deps: QueueDeps) {
    this.#deps = deps;
  }

  /** Põe na fila o que `prepareFile` devolveu; devolve o id do anexo, que já é o definitivo. */
  async enqueueUpload(prepared: Prepared, target: UploadTarget, uid: string): Promise<string> {
    const { db, now } = this.#deps;
    const id = uuidV4();
    const at = new Date(now()).toISOString();
    const path = `${target.tripId}/${id}.${prepared.ext}`;
    const row: AttachmentDraft = {
      id,
      trip_id: target.tripId,
      reservation_id: target.reservationId,
      stop_id: target.stopId,
      kind: prepared.kind,
      storage_path: path,
      filename: prepared.filename,
      mime: prepared.mime,
      size_bytes: prepared.size,
      width: prepared.width,
      height: prepared.height,
      placeholder: prepared.placeholder,
      created_by: uid,
      created_at: at,
      updated_at: at,
      deleted_at: null,
    };
    const job: UploadJob = {
      op: 'upload',
      attachment_id: id,
      trip_id: target.tripId,
      storage_path: path,
      state: 'waiting',
      attempts: 0,
      next_at: 0,
      last_error: null,
      created_at: now(),
      blob: prepared.blob,
      row,
    };
    await db.uploads.put(job);
    return id;
  }

  /** O objeto de um anexo já enviado, a apagar quando a lápide for aceita. */
  async enqueueRemove(att: Pick<Attachment, 'id' | 'trip_id' | 'storage_path'>): Promise<void> {
    const job: RemoveJob = {
      op: 'remove',
      attachment_id: att.id,
      trip_id: att.trip_id,
      storage_path: att.storage_path,
      state: 'waiting',
      attempts: 0,
      next_at: 0,
      last_error: null,
      created_at: this.#deps.now(),
    };
    await this.#deps.db.uploads.put(job);
  }

  /** Tira da fila um envio que ainda não subiu. Devolve se havia o que tirar. */
  async cancel(id: string): Promise<boolean> {
    const job = await this.#deps.db.uploads.get(id);
    if (job?.op !== 'upload') return false;
    await this.#deps.db.uploads.delete(id);
    return true;
  }

  /** "Tentar de novo" em Pendentes: zera o contador. */
  async retry(id: string): Promise<void> {
    await this.#deps.db.uploads.update(id, {
      state: 'waiting',
      attempts: 0,
      next_at: 0,
      last_error: null,
    });
  }

  /** "Descartar" em Pendentes: o arquivo nunca subiu (ou a remoção fica para o expurgo). */
  async discard(id: string): Promise<void> {
    await this.#deps.db.uploads.delete(id);
  }

  /** Processa a fila, um trabalho por vez. Chamadas no meio do caminho esperam a mesma rodada. */
  drain(): Promise<DrainResult> {
    this.#running ??= this.#drain().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  async #drain(): Promise<DrainResult> {
    const { db, now } = this.#deps;
    const result: DrainResult = { sent: 0, removed: 0, failed: 0, dropped: 0, offline: false };
    const due = (await db.uploads.where('state').equals('waiting').toArray())
      .filter((j) => j.next_at <= now())
      .sort((a, b) => a.created_at - b.created_at);
    for (const job of due) {
      const step = job.op === 'upload' ? await this.#upload(job) : await this.#remove(job);
      if (step === 'offline') {
        result.offline = true;
        break;
      }
      if (step === 'sent') result.sent += 1;
      else if (step === 'removed') result.removed += 1;
      else if (step === 'failed') result.failed += 1;
      else if (step === 'dropped') result.dropped += 1;
    }
    return result;
  }

  async #upload(
    job: UploadJob,
  ): Promise<'sent' | 'offline' | 'failed' | 'dropped' | 'later' | 'skip'> {
    const { db, storage } = this.#deps;
    // a viagem criada sem sinal ainda não existe no servidor: a policy do Storage recusaria
    const trip = await db.trips.get(job.trip_id);
    if (trip?.deleted_at !== null) {
      await db.uploads.delete(job.attachment_id);
      return 'dropped';
    }
    if (trip.synced_at === null) return 'skip';
    if (!(await this.#targetAlive(job))) {
      await db.uploads.delete(job.attachment_id);
      return 'dropped';
    }
    const out = await storage.upload(job.storage_path, job.blob, job.row.mime);
    switch (out.kind) {
      case 'ok':
      case 'exists':
        await this.#record(job);
        return 'sent';
      case 'network':
        return 'offline';
      case 'rule':
        await db.uploads.update(job.attachment_id, { state: 'failed', last_error: out.message });
        return 'failed';
      case 'retry':
        return this.#later(job, out.message);
    }
  }

  async #targetAlive(job: UploadJob): Promise<boolean> {
    const { db } = this.#deps;
    if (job.row.stop_id) {
      const stop = await db.stops.get(job.row.stop_id);
      return stop?.deleted_at === null;
    }
    if (job.row.reservation_id) {
      const r = await db.reservations.get(job.row.reservation_id);
      return r?.deleted_at === null;
    }
    return false;
  }

  /** O arquivo subiu: a linha, o Blob no cache e o fim do trabalho, numa transação. */
  async #record(job: UploadJob): Promise<void> {
    const { db, insertRow, now, onStored } = this.#deps;
    const at = new Date(now()).toISOString();
    await db.transaction('rw', ['attachments', 'outbox', 'blobs', 'uploads'], async () => {
      const still = await db.uploads.get(job.attachment_id);
      if (!still) {
        // tiraram a foto enquanto subia: o objeto sobrou sem linha, e quem enviou pode apagar
        await db.uploads.put({
          op: 'remove',
          attachment_id: job.attachment_id,
          trip_id: job.trip_id,
          storage_path: job.storage_path,
          state: 'waiting',
          attempts: 0,
          next_at: 0,
          last_error: null,
          created_at: now(),
        });
        return;
      }
      await insertRow(job.row);
      await db.blobs.put({
        attachment_id: job.attachment_id,
        trip_id: job.trip_id,
        kind: job.row.kind === 'photo' ? 'photo' : 'document',
        size: job.blob.size,
        blob: job.blob,
        stored_at: at,
        last_used_at: at,
      });
      await db.uploads.delete(job.attachment_id);
    });
    onStored?.();
  }

  async #remove(job: RemoveJob): Promise<'removed' | 'offline' | 'later' | 'failed' | 'skip'> {
    const { db, storage } = this.#deps;
    // a lápide ainda está na outbox: o Storage recusaria (linha viva) e a gente perderia a vez
    const pending = await db.outbox
      .where('[table+row_id]')
      .equals(['attachments', job.attachment_id])
      .count();
    if (pending > 0) return 'skip';
    const out = await storage.remove(job.storage_path);
    switch (out.kind) {
      case 'ok':
      case 'denied':
        // negado: alguém descartou a lápide (a linha voltou a viver) ou o objeto já não existia
        await db.uploads.delete(job.attachment_id);
        return 'removed';
      case 'network':
        return 'offline';
      case 'retry':
        return this.#later(job, out.message);
    }
  }

  async #later(job: MediaJob, message: string): Promise<'failed' | 'later'> {
    const { db, now } = this.#deps;
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      if (job.op === 'remove') {
        // apagar não é urgente: o expurgo da fase 12 leva o que sobrar
        await db.uploads.delete(job.attachment_id);
        return 'later';
      }
      await db.uploads.update(job.attachment_id, {
        state: 'failed',
        attempts,
        last_error: message,
      });
      return 'failed';
    }
    await db.uploads.update(job.attachment_id, {
      attempts,
      next_at: now() + backoffMs(attempts),
      last_error: message,
    });
    return 'later';
  }
}
