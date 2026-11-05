import {
  pushPayloadSchema,
  type PushActionId,
  type PushData,
  type PushPayload,
} from '@shared/notifications.ts';

/**
 * Leitura do payload no service worker, pura e testada. O mesmo JSON serve ao Safari (parte
 * declarativa) e ao Chrome (o SW monta a notificação daqui).
 */
export type ParsedPush = PushPayload;

export function parsePush(json: unknown): ParsedPush | null {
  const parsed = pushPayloadSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** O que `showNotification` recebe. Tipo próprio porque `actions` só existe na lib do worker. */
export type ShowNotificationOptions = {
  body: string;
  tag: string;
  lang: string;
  dir: 'ltr';
  icon: string;
  badge: string;
  renotify: boolean;
  data: PushData;
  actions: { action: PushActionId; title: string }[];
};

export const NOTIFICATION_ICON = '/pwa-192x192.png';
export const NOTIFICATION_BADGE = '/favicon.svg';

export function notificationOptions(payload: ParsedPush): ShowNotificationOptions {
  const n = payload.notification;
  return {
    body: n.body,
    tag: n.tag,
    lang: n.lang,
    dir: n.dir,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    // "hora de sair" substitui o "sair em 15 min" da mesma parada e vibra de novo
    renotify: n.data.kind === 'departure_now',
    data: n.data,
    actions: payload.actions,
  };
}

/** O selo pedido pelo servidor, como número; null quando o aviso não mexe no selo. */
export function appBadgeOf(payload: ParsedPush): number | null {
  const raw = payload.notification.app_badge;
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Lê `notification.data` de volta de um clique (vem como `unknown`). */
export function parsePushData(data: unknown): PushData | null {
  const parsed = pushPayloadSchema.shape.notification.shape.data.safeParse(data);
  return parsed.success ? parsed.data : null;
}
