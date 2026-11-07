/// <reference lib="webworker" />
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import {
  appBadgeOf,
  notificationOptions,
  parsePush,
  parsePushData,
} from '@/features/notifications/push-payload.ts';
import { applyNotificationAction, pushNow, resubscribe } from './sw/actions.ts';
import { drainMediaInBackground } from './sw/media.ts';
import { OSM_TILE_ORIGIN, TILE_CACHE } from '@/lib/map/tiles.ts';
import { MEDIA_SYNC_TAG } from '@/lib/media/types.ts';

declare let self: ServiceWorkerGlobalScope;

/**
 * Service worker próprio (estratégia injectManifest do vite-plugin-pwa). Precache da casca, fontes
 * e ícones; toda navegação cai no index.html, então o app abre sem rede; os tiles do OSM já vistos
 * em CacheFirst. E a parte da tela apagada: `push` monta a notificação (o payload é o mesmo que o
 * Safari lê sozinho, de forma declarativa), `notificationclick` grava Partiu!/Chegamos! pela mesma
 * `mutate` da tela e tenta enviar a fila, `pushsubscriptionchange` reassina.
 */
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Os tiles do OSM que a pessoa já viu, para o mapa abrir sem sinal (nunca baixados antes, pela
// política do OSM). Até a fase 11 esta rota nunca gravou um tile: sem `cacheWillUpdate`, o Workbox só
// grava status 200, e o Leaflet pedia os tiles sem `crossorigin` (no-cors), com resposta opaca
// (status 0). Agora o mapa pede com CORS (o OSM responde `access-control-allow-origin: *`) e só o 200
// entra. Nunca o 0: o Chrome conta uns 7 MB de cota por resposta opaca, e um erro opaco ficaria preso
// no CacheFirst.
registerRoute(
  ({ url }) => url.origin === OSM_TILE_ORIGIN,
  new CacheFirst({
    cacheName: TILE_CACHE.name,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({
        maxEntries: TILE_CACHE.maxEntries,
        maxAgeSeconds: TILE_CACHE.maxAgeSeconds,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

// "Nova versão disponível → Recarregar": o app pede para a versão nova assumir já
self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'SKIP_WAITING'
  ) {
    void self.skipWaiting();
  }
});

// --------------------------------------------------------------------------------- push
function payloadOf(event: PushEvent): unknown {
  try {
    return event.data?.json();
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePush(payloadOf(event));
  if (!payload) return;
  event.waitUntil(
    (async () => {
      // no Safari a parte declarativa é o fallback; no Chrome esta é a notificação, com as ações
      await self.registration.showNotification(
        payload.notification.title,
        notificationOptions(payload),
      );
      const badge = appBadgeOf(payload);
      if (badge !== null) {
        try {
          await navigator.setAppBadge(badge);
        } catch {
          /* sem Badging API neste navegador: o selo é um extra */
        }
      }
    })(),
  );
});

// ----------------------------------------------------------------------- notificationclick
async function openApp(path: string): Promise<void> {
  const url = new URL(path, self.location.origin).href;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find((c) => c.url.startsWith(self.location.origin));
  if (existing) {
    await existing.focus();
    existing.postMessage({ type: 'NAVIGATE', url: path });
    return;
  }
  await self.clients.openWindow(url);
}

function clock(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

self.addEventListener('notificationclick', (event) => {
  const data = parsePushData(event.notification.data);
  const path = data?.navigate ?? '/';
  const action = event.action === 'departed' || event.action === 'arrived' ? event.action : null;
  const tag = event.notification.tag;
  event.notification.close();

  if (!action || !data) {
    // iPhone (sem botões) ou toque no corpo: abre o "Agora" com o botão em destaque
    event.waitUntil(openApp(path));
    return;
  }

  event.waitUntil(
    (async () => {
      try {
        const result = await applyNotificationAction(action, data);
        if (result.outcome === 'applied') {
          // confirmação silenciosa no lugar do aviso: a pessoa sabe que ficou marcado
          await self.registration.showNotification(result.label, {
            tag,
            body: `Marcado às ${clock()}`,
            silent: true,
            data,
            lang: 'pt-BR',
            icon: '/pwa-192x192.png',
          });
          await pushNow();
          return;
        }
      } catch (err) {
        console.warn('viajei: ação da notificação não aplicada', err);
      }
      await openApp(path);
    })(),
  );
});

// ---------------------------------------------------------------- pushsubscriptionchange
type PushSubscriptionChangeEvent = ExtendableEvent & {
  oldSubscription: PushSubscription | null;
  newSubscription: PushSubscription | null;
};

self.addEventListener('pushsubscriptionchange', (event) => {
  const e = event as PushSubscriptionChangeEvent;
  e.waitUntil(
    resubscribe(e.oldSubscription, import.meta.env.VITE_VAPID_PUBLIC_KEY).catch((err: unknown) => {
      console.warn('viajei: não deu para reassinar o push', err);
    }),
  );
});

// Background Sync (Android): a fila de fotos e documentos sobe quando a rede volta, com o app fechado
type SyncEvent = ExtendableEvent & { tag: string };
self.addEventListener('sync', (event) => {
  const e = event as SyncEvent;
  if (e.tag === MEDIA_SYNC_TAG) e.waitUntil(drainMediaInBackground());
});
