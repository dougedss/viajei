import type { AttachmentMime } from '@shared/constants.ts';

/**
 * Os tipos da mídia sem nada de DOM: a fila de envio roda também no service worker, que só tem as
 * libs de worker.
 */

/** O que `prepareFile` devolve e a fila guarda: o arquivo já comprimido e os metadados dele. */
export type Prepared = {
  blob: Blob;
  mime: AttachmentMime;
  ext: 'jpg' | 'pdf';
  kind: 'photo' | 'document';
  width: number | null;
  height: number | null;
  placeholder: string | null;
  filename: string;
  size: number;
};

/** A etiqueta do Background Sync: o service worker envia a fila quando a rede volta (Android). */
export const MEDIA_SYNC_TAG = 'viajei-media';
