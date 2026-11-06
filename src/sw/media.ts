/// <reference lib="webworker" />
import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { MediaQueue } from '@/lib/media/queue.ts';
import { supabaseStorage } from '@/lib/media/storage.ts';
import { swSupabase } from '@/lib/supabase/sw-client.ts';
import { pushNow } from './actions.ts';

/**
 * O Background Sync da fila de envio (Chrome do Android): a rede voltou e o app está fechado. O
 * service worker sobe as fotos e documentos com a sessão do IndexedDB, grava as linhas pela mesma
 * `mutate` e envia a outbox, sob os mesmos Web Locks do app (os dois nunca brigam). Sem rede de
 * novo, falha de propósito: o navegador agenda outra tentativa. No iPhone não existe; a fila sobe
 * na próxima abertura do app.
 */
export async function drainMediaInBackground(): Promise<void> {
  const client = swSupabase();
  const { data } = await client.auth.getSession();
  if (!data.session) return;
  const queue = new MediaQueue({
    db,
    storage: supabaseStorage(client),
    now: () => Date.now(),
    insertRow: (row) => mutate.insert('attachments', row),
  });
  const result = await navigator.locks.request('viajei:media', { ifAvailable: true }, (lock) =>
    lock ? queue.drain() : null,
  );
  await pushNow();
  if (result?.offline) throw new Error('sem rede: o navegador tenta de novo');
}
