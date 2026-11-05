/// <reference lib="webworker" />
import type { PushActionId, PushData } from '@shared/notifications.ts';
import { fromBase64Url } from '@shared/vapid.ts';
import { activeStops } from '@/features/itinerary/rules.ts';
import { subscriptionRow } from '@/features/notifications/subscription-row.ts';
import { arrive, depart } from '@/features/travel-mode/actions.ts';
import { dayState } from '@/features/travel-mode/rules.ts';
import { db } from '@/lib/db/schema.ts';
import { pushOutbox } from '@/lib/db/sync/push.ts';
import { pushRpcFor } from '@/lib/db/sync/rpc.ts';
import { swSupabase } from '@/lib/supabase/sw-client.ts';

declare const self: ServiceWorkerGlobalScope;

/**
 * O que o service worker faz quando a pessoa toca em Partiu! ou Chegamos! na notificação, com o
 * app fechado: lê o dia do Dexie, recalcula o estado com o mesmo `dayState` da tela e aplica a
 * mesma ação da tela, pela mesma `mutate` (linha local e outbox na mesma transação). Depois tenta
 * enviar a fila com a sessão do IndexedDB. Se o estado já mudou (alguém marcou antes), não marca
 * nada: quem chamou abre o "Agora" com o botão em destaque.
 */
export type ActionOutcome =
  { outcome: 'applied'; label: string } | { outcome: 'stale' | 'no-session' | 'no-data' };

export async function sessionUserId(): Promise<string | null> {
  const { data } = await swSupabase().auth.getSession();
  return data.session?.user.id ?? null;
}

export async function applyNotificationAction(
  action: PushActionId,
  data: PushData,
  now = new Date(),
): Promise<ActionOutcome> {
  if (!data.stopId) return { outcome: 'no-data' };
  const uid = await sessionUserId();
  if (!uid) return { outcome: 'no-session' };
  const stop = await db.stops.get(data.stopId);
  if (!stop) return { outcome: 'no-data' };
  const day = await db.trip_days.get(stop.trip_day_id);
  if (!day) return { outcome: 'no-data' };
  const stops = activeStops(await db.stops.where('trip_day_id').equals(day.id).toArray());
  const state = dayState(day, stops, now);
  if (state.next?.id !== data.stopId) return { outcome: 'stale' };

  if (action === 'departed') {
    if (!state.departAvailable) return { outcome: 'stale' };
    const label =
      state.at && !state.onRoad ? `Saímos de ${state.at.name}` : `Saímos: ${state.next.name}`;
    await depart(state, uid);
    return { outcome: 'applied', label };
  }
  if (!state.arriveAvailable) return { outcome: 'stale' };
  await arrive(state, uid);
  return { outcome: 'applied', label: `Chegamos: ${state.next.name}` };
}

/** Tenta enviar a fila agora, sob o mesmo Web Lock do motor do app: os dois nunca brigam. */
export async function pushNow(): Promise<void> {
  const rpc = pushRpcFor(swSupabase());
  await navigator.locks.request('viajei:sync', { ifAvailable: true }, async (lock) => {
    if (lock) await pushOutbox(db, rpc);
  });
}

/**
 * O push service trocou a assinatura: reassina com a mesma chave pública (a da assinatura antiga,
 * ou a do build) e atualiza a linha pelo endpoint antigo.
 */
export async function resubscribe(
  old: PushSubscription | null,
  fallbackKey: string | undefined,
): Promise<void> {
  const key =
    old?.options.applicationServerKey ?? (fallbackKey ? fromBase64Url(fallbackKey) : null);
  if (!key) return;
  const sub = await self.registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });
  const uid = await sessionUserId();
  if (!uid) return;
  const row = subscriptionRow(sub.toJSON(), {
    uid,
    origin: self.location.origin,
    userAgent: navigator.userAgent,
  });
  const client = swSupabase();
  if (old && old.endpoint !== sub.endpoint) {
    await client.from('push_subscriptions').delete().eq('endpoint', old.endpoint);
  }
  await client.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
}
