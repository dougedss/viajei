import type { PushPlatform } from '@shared/notifications.ts';

/**
 * A linha de `push_subscriptions` a partir de uma assinatura do navegador. Pura: o client e o
 * service worker (em `pushsubscriptionchange`) montam a mesma linha.
 */
export type SubscriptionJson = {
  endpoint?: string;
  keys?: Record<string, string>;
};

export type SubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  platform: PushPlatform;
  origin: string;
  user_agent: string | null;
  last_seen_at: string;
  failed_at: null;
};

/** `ios` no iPhone e iPad, `android` no Android, senão `desktop` (inclui iPad com UA de Mac). */
export function detectPlatform(userAgent: string): PushPlatform {
  if (/iP(hone|ad|od)/.test(userAgent)) return 'ios';
  if (userAgent.includes('Android')) return 'android';
  return 'desktop';
}

export function subscriptionRow(
  json: SubscriptionJson,
  ctx: { uid: string; origin: string; userAgent: string; now?: Date },
): SubscriptionRow {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error('assinatura push sem endpoint ou chaves');
  return {
    user_id: ctx.uid,
    endpoint,
    p256dh,
    auth,
    platform: detectPlatform(ctx.userAgent),
    origin: ctx.origin,
    user_agent: ctx.userAgent.slice(0, 300) || null,
    last_seen_at: (ctx.now ?? new Date()).toISOString(),
    failed_at: null,
  };
}
