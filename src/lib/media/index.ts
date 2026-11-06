import { connectivity } from '@/lib/db/connectivity.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db } from '@/lib/db/schema.ts';
import { syncEngine } from '@/lib/db/sync/engine.ts';
import { isStandalone, persistStorage } from '@/lib/pwa/install.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { MediaCache } from './cache.ts';
import { MediaQueue } from './queue.ts';
import { supabaseStorage } from './storage.ts';
import { MEDIA_SYNC_TAG } from './types.ts';

/**
 * As instâncias do app: a fila de envio e o cache de arquivos, sobre o Storage com o JWT da pessoa
 * (a policy de leitura vale; nenhuma URL assinada fica guardada). A fila acorda nos mesmos momentos
 * em que o motor sincroniza (escrita, rede de volta, foco, abrir o app, 60 s visível), com um Web
 * Lock próprio: um Chegamos! nunca espera uma foto subir, nem a foto espera o sync. Sem rede, pede
 * ao service worker um Background Sync (Android): a foto sobe quando o sinal volta, mesmo com o app
 * fechado. No iPhone não existe; sobe na próxima abertura.
 */
const storage = supabaseStorage(supabase);

let persistAsked = false;
/** A primeira vez que um arquivo fica guardado: pede ao navegador para não descartar (instalado). */
function askPersistOnce(): void {
  if (persistAsked) return;
  persistAsked = true;
  if (isStandalone()) void persistStorage();
}

async function quota(): Promise<number | null> {
  try {
    const est = await navigator.storage.estimate();
    return est.quota ?? null;
  } catch {
    return null;
  }
}

export const mediaQueue = new MediaQueue({
  db,
  storage,
  now: () => Date.now(),
  insertRow: (row) => mutate.insert('attachments', row),
  onStored: askPersistOnce,
});

export const mediaCache = new MediaCache({
  db,
  storage,
  now: () => Date.now(),
  quota,
  onStored: askPersistOnce,
});

type SyncRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/** Android: o service worker envia a fila quando a rede voltar, mesmo com o app fechado. */
async function registerBackgroundSync(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = (await navigator.serviceWorker.getRegistration()) as SyncRegistration | undefined;
    if (!reg?.sync) return;
    const waiting = await db.uploads.where('state').equals('waiting').count();
    if (waiting > 0) await reg.sync.register(MEDIA_SYNC_TAG);
  } catch {
    // sem permissão ou sem suporte: a fila sobe na próxima abertura
  }
}

/**
 * Uma rodada por vez entre as abas (Web Lock `viajei:media`), sem perder pedido: quem pede durante
 * uma rodada entra na fila do lock e roda logo depois dela (o trabalho que chegou no meio não fica
 * parado esperando o próximo gatilho). Na mesma aba, pedidos seguidos viram um só.
 */
let kickQueued = false;
async function withMediaLock(run: () => Promise<void>): Promise<void> {
  if (kickQueued) return;
  kickQueued = true;
  const once = async () => {
    kickQueued = false;
    await run();
  };
  if ('locks' in navigator) {
    await navigator.locks.request('viajei:media', once);
    return;
  }
  await once();
}

let uid: string | null = null;
let cleanups: (() => void)[] = [];

/** Processa a fila agora, se der: com sessão, com rede, uma aba por vez. */
export function kickMedia(): void {
  if (!uid) return;
  if (!connectivity.isOnline()) {
    void registerBackgroundSync();
    return;
  }
  void withMediaLock(async () => {
    const result = await mediaQueue.drain();
    if (result.offline) {
      connectivity.markOffline();
      void registerBackgroundSync();
    }
  });
}

export function startMedia(userId: string): void {
  if (uid === userId) return;
  stopMedia();
  uid = userId;
  let phase = syncEngine.getState().phase;
  cleanups = [
    // no começo de cada ciclo (a rede voltou) e no fim (o pull confirmou uma viagem criada aqui,
    // e só então o Storage aceita os arquivos dela)
    syncEngine.subscribe(() => {
      const next = syncEngine.getState().phase;
      if (next !== phase) kickMedia();
      phase = next;
    }),
    connectivity.subscribe(() => {
      if (connectivity.isOnline()) kickMedia();
    }),
  ];
  kickMedia();
  // o despejo roda uma vez por abertura, sem pressa
  const idle = setTimeout(() => void mediaCache.evict().catch(() => undefined), 5_000);
  cleanups.push(() => clearTimeout(idle));
}

export function stopMedia(): void {
  for (const c of cleanups) c();
  cleanups = [];
  uid = null;
}

export { MediaQueue } from './queue.ts';
export { MediaError, prepareFile, type Prepared, type Purpose } from './prepare.ts';
