import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useOnline } from '@/lib/db/connectivity.ts';
import { db, type Attachment, type AttachmentDraft, type MediaJob } from '@/lib/db/schema.ts';
import { mediaCache } from './index.ts';
import { placeholderUrl } from './placeholder.ts';
import { blobUrl } from './urls.ts';

/**
 * Um anexo como a tela o vê: a linha (sincronizada, ou a que vai nascer quando o envio terminar),
 * e se ainda está na fila. O id é o mesmo nas duas fases: a foto não troca de chave nem pisca.
 */
export type MediaItem = {
  row: Attachment | AttachmentDraft;
  /** na fila de envio: "aguardando sinal" */
  pending: boolean;
  /** recusado por regra (em Pendentes) */
  failed: boolean;
  error: string | null;
};

export type MediaImage = {
  /** URL do arquivo local (Blob), quando há */
  src: string | null;
  /** o borrão do thumbhash, enquanto o arquivo não chega */
  placeholder: string | null;
};

/** O arquivo de um anexo neste aparelho: o do cache ou o da fila. `undefined` enquanto lê. */
export function useMediaBlob(item: MediaItem | null): Blob | null | undefined {
  const id = item?.row.id ?? null;
  return useLiveQuery(
    async () => {
      if (!id) return null;
      const cached = await db.blobs.get(id);
      if (cached) return cached.blob;
      const job = await db.uploads.get(id);
      return job?.op === 'upload' ? job.blob : null;
    },
    [id],
    undefined,
  );
}

/** A URL do arquivo local de um anexo, pelo id (o "Rever o dia" só mostra o que já está aqui). */
export function useBlobUrl(attachmentId: string): string | null {
  const blob = useLiveQuery(
    async () => {
      const cached = await db.blobs.get(attachmentId);
      if (cached) return cached.blob;
      const job = await db.uploads.get(attachmentId);
      return job?.op === 'upload' ? job.blob : null;
    },
    [attachmentId],
    null,
  );
  return blob ? blobUrl(attachmentId, blob) : null;
}

/**
 * A imagem de um anexo: o Blob do cache ou da fila; sem ele e com rede, baixa sob demanda. Ao
 * aparecer, conta como uso para a regra de despejo.
 */
export function useMediaImage(item: MediaItem | null): MediaImage {
  const blob = useMediaBlob(item);
  const online = useOnline();
  const id = item?.row.id ?? null;
  const pending = item?.pending ?? false;
  const row = item?.row ?? null;
  const known = blob !== undefined;
  const has = blob !== null && blob !== undefined;

  useEffect(() => {
    if (!row || !known) return;
    if (has) {
      if (!pending) void mediaCache.touch(row.id);
      return;
    }
    if (online && !pending) void mediaCache.ensure(row);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage ao id, à chegada do arquivo e à rede
  }, [row?.id, known, has, online, pending]);

  return {
    src: id && has ? blobUrl(id, blob) : null,
    placeholder: placeholderUrl(row?.placeholder ?? null),
  };
}

/** Linhas vivas mais os envios na fila, num formato só, para uma consulta de anexos. */
export function mergeMedia(
  rows: readonly Attachment[],
  jobs: readonly MediaJob[],
  keep: (row: Attachment | AttachmentDraft) => boolean,
): MediaItem[] {
  const out = new Map<string, MediaItem>();
  for (const row of rows) {
    if (row.deleted_at !== null || !keep(row)) continue;
    out.set(row.id, { row, pending: false, failed: false, error: null });
  }
  for (const job of jobs) {
    if (job.op !== 'upload' || !keep(job.row) || out.has(job.attachment_id)) continue;
    out.set(job.attachment_id, {
      row: job.row,
      pending: true,
      failed: job.state === 'failed',
      error: job.last_error,
    });
  }
  return [...out.values()].sort((a, b) => a.row.created_at.localeCompare(b.row.created_at));
}

/** Os anexos de uma viagem (linhas e fila), filtrados por quem chama. */
export function useTripMedia(
  tripId: string,
  keep: (row: Attachment | AttachmentDraft) => boolean = () => true,
): MediaItem[] {
  const data = useLiveQuery(
    async () => ({
      rows: await db.attachments.where('trip_id').equals(tripId).toArray(),
      jobs: await db.uploads.where('trip_id').equals(tripId).toArray(),
    }),
    [tripId],
  );
  return data ? mergeMedia(data.rows, data.jobs, keep) : [];
}

/** Ao abrir uma viagem com rede: baixa o que falta (só viagens em andamento ou futuras). */
export function useTripMediaPrefetch(tripId: string): void {
  const online = useOnline();
  const missing = useLiveQuery(
    async () => {
      const [rows, have] = await Promise.all([
        db.attachments.where('trip_id').equals(tripId).toArray(),
        db.blobs.where('trip_id').equals(tripId).primaryKeys(),
      ]);
      const cached = new Set(have);
      return rows.filter((a) => a.deleted_at === null && !cached.has(a.id)).length;
    },
    [tripId],
    0,
  );
  useEffect(() => {
    if (online && missing > 0) void mediaCache.prefetch(tripId);
  }, [tripId, online, missing]);
}
