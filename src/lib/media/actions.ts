import { mutate } from '@/lib/db/mutate.ts';
import { db, type Attachment } from '@/lib/db/schema.ts';
import type { MediaItem } from './hooks.ts';
import { kickMedia, mediaQueue } from './index.ts';
import { MediaError, prepareFile, type Purpose } from './prepare.ts';
import type { UploadTarget } from './queue.ts';
import { dropUrl } from './urls.ts';

/**
 * As escritas de mídia que a tela faz. Adicionar: comprime e põe na fila (a foto aparece na hora,
 * com ou sem sinal). Tirar: um envio que ainda não subiu só sai da fila; um anexo enviado recebe a
 * lápide pela `mutate` e, se quem tira enviou o arquivo ou é dono da viagem, o objeto do Storage é
 * apagado quando a lápide for aceita (D79).
 */
export type AddResult = { added: string[]; errors: string[] };

export async function addMediaFiles(
  files: readonly File[],
  purpose: Purpose,
  target: UploadTarget,
  uid: string,
): Promise<AddResult> {
  const result: AddResult = { added: [], errors: [] };
  for (const file of files) {
    try {
      const prepared = await prepareFile(file, purpose);
      result.added.push(await mediaQueue.enqueueUpload(prepared, target, uid));
    } catch (err) {
      result.errors.push(
        err instanceof MediaError ? err.message : 'Não deu para preparar este arquivo.',
      );
    }
  }
  if (result.added.length > 0) kickMedia();
  return result;
}

export async function removeMedia(item: MediaItem, uid: string, isOwner: boolean): Promise<void> {
  if (item.pending) {
    await mediaQueue.cancel(item.row.id);
    dropUrl(item.row.id);
    return;
  }
  const row = item.row as Attachment;
  await mutate.remove('attachments', row.id);
  await db.blobs.delete(row.id);
  dropUrl(row.id);
  if (row.created_by === uid || isOwner) {
    await mediaQueue.enqueueRemove(row);
    kickMedia();
  }
}

/** Tira de uma vez os anexos de uma reserva ou de uma parada que está saindo. */
export async function removeAllMedia(
  items: readonly MediaItem[],
  uid: string,
  isOwner: boolean,
): Promise<void> {
  for (const item of items) await removeMedia(item, uid, isOwner);
}
