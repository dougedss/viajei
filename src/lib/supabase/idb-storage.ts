import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Sessão do supabase-js em IndexedDB em vez de localStorage. O motivo é o service worker: na
 * fase 4, Partiu! e Chegamos! vêm do botão da notificação com o app fechado, e o SW precisa da
 * sessão para enviar a fila. Service workers não enxergam localStorage; IndexedDB é compartilhado.
 * Sem Dexie de propósito: o SW importa este módulo sozinho, sem carregar o banco do app.
 */
/** Chave da sessão no IndexedDB; a mesma que o service worker lê. */
export const AUTH_STORAGE_KEY = 'viajei-auth';
const DB_NAME = 'viajei-auth';
const STORE = 'kv';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const database = req.result;
      database.onclose = () => {
        opening = null;
      };
      database.onversionchange = () => {
        database.close();
        opening = null;
      };
      resolve(database);
    };
    req.onerror = () => {
      opening = null;
      reject(req.error ?? new Error('não abriu o IndexedDB da sessão'));
    };
  });
  return opening;
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const tx = database.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error ?? new Error('transação da sessão falhou'));
        tx.onabort = () => reject(tx.error ?? new Error('transação da sessão abortada'));
      }),
  );
}

// parâmetros anotados: o projeto do service worker (lib WebWorker) não infere a partir de SupportedStorage
export const idbStorage: SupportedStorage = {
  async getItem(key: string) {
    const value = await request<unknown>('readonly', (s) => s.get(key));
    return typeof value === 'string' ? value : null;
  },
  async setItem(key: string, value: string) {
    await request('readwrite', (s) => s.put(value, key));
  },
  async removeItem(key: string) {
    await request('readwrite', (s) => s.delete(key));
  },
};
