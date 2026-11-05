import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { AUTH_STORAGE_KEY, idbStorage } from './idb-storage.ts';

/**
 * O client do service worker: a mesma sessão do app (IndexedDB `viajei-auth`, D13), sem detectar
 * sessão na URL (não há URL), sem renovação automática (o SW vive pouco; `getSession` renova se o
 * token venceu) e sem o motor de sync. Só o que o botão da notificação precisa: `sync_push` e
 * `push_subscriptions`. Criado sob demanda, uma vez por vida do worker.
 */
let client: SupabaseClient<Database> | null = null;

export function swSupabase(): SupabaseClient<Database> {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error('service worker sem VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY');
  client = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: idbStorage,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
  return client;
}
