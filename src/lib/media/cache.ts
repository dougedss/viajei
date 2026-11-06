import { format } from 'date-fns';
import type { Attachment, ViajeiDb } from '@/lib/db/schema.ts';
import { budgetFor, isProtectedTrip, needsTouch, planEviction } from './eviction.ts';
import type { MediaStorage } from './storage.ts';
import { dropUrl } from './urls.ts';

/**
 * O cache de arquivos no aparelho (`blobs`), por id do anexo. Ao abrir uma viagem em andamento ou
 * futura com rede, baixa cada anexo ainda sem arquivo, documentos primeiro (são o que se abre no
 * balcão). De viagem passada, baixa sob demanda, quando a foto aparece. Nunca usa o cache do service
 * worker: o bucket é privado e o arquivo é por id (seção 5.3 do prompt).
 */
export type CacheDeps = {
  db: ViajeiDb;
  storage: MediaStorage;
  now: () => number;
  /** a cota que o navegador dá ao app (`navigator.storage.estimate`) */
  quota: () => Promise<number | null>;
  onStored?: () => void;
};

export type PrefetchResult = { downloaded: number; offline: boolean };

/** O que o cache precisa saber de um anexo para baixar o arquivo. */
export type AttachmentRef = Pick<Attachment, 'id' | 'trip_id' | 'storage_path' | 'kind'>;

export class MediaCache {
  #deps: CacheDeps;
  /** anexos sem arquivo no servidor nesta sessão: não insiste */
  #missing = new Set<string>();
  #inflight = new Map<string, Promise<boolean>>();
  #prefetching = new Map<string, Promise<PrefetchResult>>();

  constructor(deps: CacheDeps) {
    this.#deps = deps;
  }

  #today(): string {
    return format(new Date(this.#deps.now()), 'yyyy-MM-dd');
  }

  /** Baixa o que falta de uma viagem em andamento ou futura e depois confere o orçamento. */
  prefetch(tripId: string): Promise<PrefetchResult> {
    let run = this.#prefetching.get(tripId);
    if (!run) {
      run = this.#prefetch(tripId).finally(() => this.#prefetching.delete(tripId));
      this.#prefetching.set(tripId, run);
    }
    return run;
  }

  async #prefetch(tripId: string): Promise<PrefetchResult> {
    const { db } = this.#deps;
    const trip = await db.trips.get(tripId);
    if (!trip || !isProtectedTrip(trip, this.#today())) return { downloaded: 0, offline: false };
    const [rows, have] = await Promise.all([
      db.attachments.where('trip_id').equals(tripId).toArray(),
      db.blobs.where('trip_id').equals(tripId).primaryKeys(),
    ]);
    const cached = new Set(have);
    const todo = rows
      .filter((a) => a.deleted_at === null && !cached.has(a.id) && !this.#missing.has(a.id))
      .sort(
        (a, b) =>
          (a.kind === 'document' ? 0 : 1) - (b.kind === 'document' ? 0 : 1) ||
          b.created_at.localeCompare(a.created_at),
      );
    let downloaded = 0;
    for (const att of todo) {
      const out = await this.#fetch(att);
      if (out === 'offline') return { downloaded, offline: true };
      if (out === 'ok') downloaded += 1;
    }
    if (downloaded > 0) await this.evict();
    return { downloaded, offline: false };
  }

  /** Um anexo, sob demanda (a foto de uma viagem passada apareceu na tela). */
  ensure(att: AttachmentRef): Promise<boolean> {
    let run = this.#inflight.get(att.id);
    if (!run) {
      run = this.#fetch(att)
        .then((r) => r === 'ok')
        .finally(() => this.#inflight.delete(att.id));
      this.#inflight.set(att.id, run);
    }
    return run;
  }

  async #fetch(att: AttachmentRef): Promise<'ok' | 'offline' | 'missing' | 'later'> {
    const { db, storage, now, onStored } = this.#deps;
    if (await db.blobs.get(att.id)) return 'ok';
    const out = await storage.download(att.storage_path);
    if (out.kind === 'network') return 'offline';
    if (out.kind === 'missing') {
      this.#missing.add(att.id);
      return 'missing';
    }
    if (out.kind === 'retry') return 'later';
    const at = new Date(now()).toISOString();
    await db.transaction('rw', ['blobs', 'attachments'], async () => {
      // a linha pode ter recebido a lápide enquanto baixava
      const row = await db.attachments.get(att.id);
      if (row?.deleted_at !== null) return;
      await db.blobs.put({
        attachment_id: att.id,
        trip_id: att.trip_id,
        kind: att.kind === 'photo' ? 'photo' : 'document',
        size: out.blob.size,
        blob: out.blob,
        stored_at: at,
        last_used_at: at,
      });
    });
    onStored?.();
    return 'ok';
  }

  /** A foto apareceu: conta como uso, no máximo uma vez por dia. */
  async touch(id: string): Promise<void> {
    const { db, now } = this.#deps;
    const entry = await db.blobs.get(id);
    if (!entry || !needsTouch(entry.last_used_at, now())) return;
    await db.blobs.update(id, { last_used_at: new Date(now()).toISOString() });
  }

  /** Despeja o que passou do orçamento, pela regra pura. */
  async evict(): Promise<string[]> {
    const { db } = this.#deps;
    const [metas, trips, quota] = await Promise.all([
      db.blobs.toArray(),
      db.trips.toArray(),
      this.#deps.quota(),
    ]);
    const today = this.#today();
    const protectedTrips = new Set(trips.filter((t) => isProtectedTrip(t, today)).map((t) => t.id));
    const ids = planEviction(metas, protectedTrips, budgetFor(quota));
    if (ids.length > 0) {
      await db.blobs.bulkDelete(ids);
      for (const id of ids) dropUrl(id);
    }
    return ids;
  }
}
