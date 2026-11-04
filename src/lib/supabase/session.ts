import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { supabase } from './client.ts';

export type SessionState =
  | { status: 'loading'; session: null }
  | { status: 'signed-out'; session: null }
  | { status: 'signed-in'; session: Session };

/**
 * Sessão como store externo (useSyncExternalStore): um único getSession() no boot, lido do storage
 * sem rede, e depois só os eventos do supabase-js. Nunca getUser() para decidir se há sessão: ele
 * bate na rede e, sem sinal, deslogaria quem está offline.
 */
let state: SessionState = { status: 'loading', session: null };
const listeners = new Set<() => void>();
let started = false;

function set(session: Session | null) {
  state = session ? { status: 'signed-in', session } : { status: 'signed-out', session: null };
  for (const l of listeners) l();
}

function start() {
  if (started) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    if (state.status === 'loading') set(data.session);
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    set(session);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const get = () => state;

export function useSession(): SessionState {
  start();
  return useSyncExternalStore(subscribe, get, get);
}

/** Para código fora do React (ex.: fila de sync, na fase 2). */
export function currentSession(): Session | null {
  return state.session;
}
