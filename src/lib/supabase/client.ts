import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { idbStorage } from './idb-storage.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error('Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).');
}

/** Chave da sessão no IndexedDB; a mesma que o service worker lê (fase 4). */
export const AUTH_STORAGE_KEY = 'viajei-auth';

/**
 * Um único client para o app. Só a chave publicável vai para o bundle; a RLS faz o resto.
 * PKCE para os links de e-mail (confirmação e recuperação) funcionarem no mesmo navegador.
 * A sessão fica em IndexedDB (ver idb-storage.ts), que o service worker também enxerga.
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: idbStorage,
    storageKey: AUTH_STORAGE_KEY,
  },
});
