import { useSyncExternalStore } from 'react';
import { fromBase64Url } from '@shared/vapid.ts';
import { db } from '@/lib/db/schema.ts';
import { isIOS, isStandalone } from '@/lib/pwa/install.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { askKeys, type PushStatus } from './ask.ts';
import { subscriptionRow } from './subscription-row.ts';

/**
 * A assinatura push deste aparelho, como store externo. `push_subscriptions` não sincroniza: é
 * escrita direta pelo PostgREST, online, como o perfil. A permissão só pode ser pedida num toque
 * (`subscribePush`); `refresh` relê o estado; `touchSubscription` atualiza `last_seen_at` uma vez
 * por dia, para o servidor saber que a assinatura continua viva.
 */
export type PushSnapshot = { status: PushStatus; endpoint: string | null; checked: boolean };

let snapshot: PushSnapshot = { status: 'unsupported', endpoint: null, checked: false };
const listeners = new Set<() => void>();
let refreshing: Promise<PushSnapshot> | null = null;

function set(next: PushSnapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  // em desenvolvimento o service worker fica desligado (D22): sem registro, sem push
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

async function detect(): Promise<PushSnapshot> {
  if (!pushSupported()) return { status: 'unsupported', endpoint: null, checked: true };
  if (isIOS() && !isStandalone()) return { status: 'not-installed', endpoint: null, checked: true };
  const reg = await registration();
  if (!reg) return { status: 'unsupported', endpoint: null, checked: true };
  const permission = Notification.permission;
  if (permission === 'denied') return { status: 'denied', endpoint: null, checked: true };
  const sub = await reg.pushManager.getSubscription();
  if (permission === 'granted' && sub) {
    return { status: 'subscribed', endpoint: sub.endpoint, checked: true };
  }
  return {
    status: permission === 'granted' ? 'granted' : 'default',
    endpoint: null,
    checked: true,
  };
}

/** Relê permissão e assinatura; chamadas simultâneas compartilham a leitura. */
export function refreshPush(): Promise<PushSnapshot> {
  refreshing ??= detect()
    .then((next) => {
      set(next);
      return next;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function usePushStatus(): PushSnapshot {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (!snapshot.checked) void refreshPush();
      return () => {
        listeners.delete(listener);
      };
    },
    () => snapshot,
    () => snapshot,
  );
}

export class PushSetupError extends Error {}

/**
 * Pede a permissão (só funciona dentro de um toque) e assina com a chave pública VAPID do build.
 * A linha vai para `push_subscriptions` com a origem deste app: o `navigate` dos avisos volta para ela.
 */
export async function subscribePush(uid: string): Promise<PushStatus> {
  const reg = await registration();
  if (!reg) {
    throw new PushSetupError(
      'Avisos indisponíveis neste navegador. Em desenvolvimento, use pnpm build && pnpm preview.',
    );
  }
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) throw new PushSetupError('VITE_VAPID_PUBLIC_KEY não está definida neste build.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return (await refreshPush()).status;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(key),
    }));
  const row = subscriptionRow(sub.toJSON(), {
    uid,
    origin: location.origin,
    userAgent: navigator.userAgent,
  });
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint' });
  if (error) throw new PushSetupError(`Não deu para registrar a assinatura: ${error.message}`);
  await db.sync_state.put({ key: askKeys.lastSeen, value: today() });
  return (await refreshPush()).status;
}

/** Desliga os avisos neste aparelho: cancela no navegador e apaga a linha. */
export async function unsubscribePush(): Promise<PushStatus> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return (await refreshPush()).status;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `last_seen_at` uma vez por dia (chave em sync_state): barato e suficiente para expurgar assinaturas mortas. */
export async function touchSubscription(): Promise<void> {
  const current = await refreshPush();
  if (current.status !== 'subscribed' || !current.endpoint) return;
  const seen = await db.sync_state.get(askKeys.lastSeen);
  const day = today();
  if (seen?.value === day) return;
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('endpoint', current.endpoint);
  if (!error) await db.sync_state.put({ key: askKeys.lastSeen, value: day });
}
