import { z } from 'zod';
import {
  DECLARATIVE_WEB_PUSH,
  isDepartureKind,
  NOTIFICATION_KIND_KEYS,
  type NotificationKind,
} from './constants.ts';
import { formatDuration } from './format.ts';

/**
 * O texto dos avisos, puro. O banco (`due_notifications`) devolve fatos em `data`; aqui eles viram
 * título, corpo, tag, ações e selo, num payload único que serve ao Safari (Declarative Web Push,
 * lido sem JavaScript) e ao Chrome (o service worker monta a notificação com as ações).
 */

/** Fatos que `claim_due_notifications` devolve em `data`, por tipo. Tudo opcional: cada tipo usa o seu. */
export const notificationDataSchema = z.looseObject({
  trip_name: z.string().nullish(),
  stop_name: z.string().nullish(),
  stop_kind: z.string().nullish(),
  stop_time: z.string().nullish(),
  from_name: z.string().nullish(),
  travel_minutes: z.number().nullish(),
  lead_minutes: z.number().nullish(),
  leave_time: z.string().nullish(),
  closes_time: z.string().nullish(),
  is_next: z.boolean().nullish(),
  date: z.string().nullish(),
  day_index: z.number().nullish(),
  day_count: z.number().nullish(),
  stops_count: z.number().nullish(),
  first_time: z.string().nullish(),
  first_kind: z.string().nullish(),
  start_date: z.string().nullish(),
  done_time: z.string().nullish(),
  actor_name: z.string().nullish(),
  reservation_name: z.string().nullish(),
  reservation_type: z.string().nullish(),
  cancel_until: z.string().nullish(),
  /** véspera: itens de "antes" e da mala ainda sem marcar */
  before_left: z.number().nullish(),
  pack_left: z.number().nullish(),
});
export type NotificationData = z.infer<typeof notificationDataSchema>;

export const pushPlatformSchema = z.enum(['ios', 'android', 'desktop']);
export type PushPlatform = z.infer<typeof pushPlatformSchema>;

export const claimedSubscriptionSchema = z.object({
  id: z.uuid(),
  endpoint: z.url(),
  p256dh: z.string(),
  auth: z.string(),
  platform: pushPlatformSchema,
  origin: z.string(),
});
export type ClaimedSubscription = z.infer<typeof claimedSubscriptionSchema>;

/** Uma linha de `claim_due_notifications`. */
export const claimedNotificationSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  kind: z.enum(NOTIFICATION_KIND_KEYS),
  ref: z.string(),
  scheduled_at: z.string(),
  trip_id: z.uuid().nullable(),
  stop_id: z.uuid().nullable(),
  attempts: z.number(),
  data: notificationDataSchema,
  subscriptions: z.array(claimedSubscriptionSchema),
});
export type ClaimedNotification = z.infer<typeof claimedNotificationSchema>;

export const PUSH_ACTIONS = { departed: 'Partiu!', arrived: 'Chegamos!' } as const;
export type PushActionId = keyof typeof PUSH_ACTIONS;

export const pushActionSchema = z.object({
  action: z.enum(['departed', 'arrived']),
  title: z.string(),
});
export const pushDataSchema = z.object({
  kind: z.enum(NOTIFICATION_KIND_KEYS),
  tripId: z.uuid().nullable(),
  stopId: z.uuid().nullable(),
  /** caminho dentro do app, para o service worker navegar na SPA */
  navigate: z.string(),
});
export type PushData = z.infer<typeof pushDataSchema>;

/**
 * O payload que vai no push. `web_push: 8030` liga a leitura declarativa do Safari; `navigate` é
 * absoluto por exigência dela; `app_badge` é string, como no exemplo da WebKit. O Chrome ignora
 * `web_push` e entrega tudo ao service worker, que usa `actions`.
 */
export const pushPayloadSchema = z.object({
  web_push: z.literal(DECLARATIVE_WEB_PUSH),
  notification: z.object({
    title: z.string().min(1),
    body: z.string(),
    navigate: z.url(),
    tag: z.string(),
    lang: z.literal('pt-BR'),
    dir: z.literal('ltr'),
    app_badge: z.string().optional(),
    data: pushDataSchema,
  }),
  actions: z.array(pushActionSchema),
});
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export type NotificationText = {
  title: string;
  body: string;
  tag: string;
  actions: { action: PushActionId; title: string }[];
  /** selo no ícone ("1" quando a próxima saída está perto); null não mexe no selo */
  appBadge: string | null;
  /** quanto tempo o push service guarda a mensagem se o aparelho estiver sem sinal */
  ttlSeconds: number;
  /** tópico do push service: uma mensagem nova com o mesmo tópico substitui a anterior ainda não entregue */
  topic: string | null;
};

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const;

/** "sexta" a partir de 'YYYY-MM-DD', sem depender do fuso do servidor. */
export function weekdayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? '';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function roadBody(data: NotificationData): string {
  const travel = data.travel_minutes ?? null;
  const arrive = data.stop_time ?? null;
  const parts: string[] = [];
  if (travel !== null) parts.push(`${formatDuration(travel)} de estrada`);
  if (arrive) parts.push(`chegada prevista ${arrive}`);
  return parts.join(' · ');
}

/**
 * O que falta nas listas na véspera: "3 itens de antes e 2 da mala faltando", só uma das listas, ou
 * null quando nada falta (o aviso volta a ser o da fase 4, com a primeira saída).
 */
export function checklistMissing(data: NotificationData): string | null {
  const before = data.before_left ?? 0;
  const pack = data.pack_left ?? 0;
  if (before <= 0 && pack <= 0) return null;
  const item = (n: number) => `${n} ${n === 1 ? 'item' : 'itens'}`;
  if (before > 0 && pack > 0) return `${item(before)} de antes e ${pack} da mala faltando`;
  return before > 0 ? `${item(before)} de antes faltando` : `${item(pack)} da mala faltando`;
}

/** "08/12" a partir de 'YYYY-MM-DD', sem passar por Date (nada de fuso). */
export function dayMonth(date: string): string {
  const [, m, d] = date.split('-');
  return m && d ? `${d}/${m}` : '';
}

function action(id: PushActionId) {
  return { action: id, title: PUSH_ACTIONS[id] };
}

/** O texto de um aviso a partir dos fatos. Determinístico: é o que o Vitest confere por tipo. */
export function notificationText(
  kind: NotificationKind,
  data: NotificationData,
  ref: string,
): NotificationText {
  const stop = data.stop_name ?? '';
  const departureNode = isDepartureKind(data.stop_kind ?? '');
  const stopTopic = ref.replaceAll('-', '').slice(0, 32);
  switch (kind) {
    case 'departure_soon': {
      const lead = data.lead_minutes ?? 15;
      return {
        title: departureNode ? `Sair em ${lead} min` : `Sair em ${lead} min para ${stop}`,
        body: departureNode ? `${stop} · ${data.stop_time ?? ''}`.trim() : roadBody(data),
        tag: `stop:${ref}`,
        actions: [action('departed')],
        appBadge: '1',
        ttlSeconds: 600,
        topic: stopTopic,
      };
    }
    case 'departure_now':
      return {
        title: departureNode ? 'Hora de sair' : `Hora de sair para ${stop}`,
        body: departureNode ? `${stop} · ${data.stop_time ?? ''}`.trim() : roadBody(data),
        tag: `stop:${ref}`,
        actions: [action('departed')],
        appBadge: '1',
        ttlSeconds: 600,
        topic: stopTopic,
      };
    case 'closes_soon':
      return {
        title: `${stop} fecha às ${data.closes_time ?? ''}`.trim(),
        body: 'faltam 60 min',
        tag: `closes:${ref}`,
        actions: data.is_next ? [action('arrived')] : [],
        appBadge: null,
        ttlSeconds: 1800,
        topic: null,
      };
    case 'morning_briefing': {
      const n = data.stops_count ?? 0;
      const first = data.first_time
        ? ` · primeira ${isDepartureKind(data.first_kind ?? '') ? 'saída' : 'parada'} às ${data.first_time}`
        : '';
      return {
        title: `Dia ${data.day_index ?? 1} de ${data.day_count ?? 1} · ${weekdayName(data.date ?? '')}`,
        body: `${plural(n, 'parada', 'paradas')}${first}`,
        tag: `day:${ref}`,
        actions: [],
        appBadge: null,
        ttlSeconds: 3600,
        topic: null,
      };
    }
    case 'eve_checklist': {
      const missing = checklistMissing(data);
      return {
        title: missing ? 'Amanhã é dia de viajar' : `Amanhã começa ${data.trip_name ?? 'a viagem'}`,
        body:
          missing ??
          (data.first_time
            ? `Primeira ${isDepartureKind(data.first_kind ?? '') ? 'saída' : 'parada'} às ${data.first_time}`
            : 'Confira o roteiro do primeiro dia'),
        tag: `trip:${ref}`,
        actions: [],
        appBadge: null,
        ttlSeconds: 3 * 3600,
        topic: null,
      };
    }
    case 'team_arrived':
      return {
        title: `${data.actor_name ?? 'Alguém do time'} ${departureNode ? 'partiu' : 'chegou'}`,
        body: `${stop} · ${data.done_time ?? ''}`.trim(),
        tag: `team:${ref}`,
        actions: [],
        appBadge: null,
        ttlSeconds: 1800,
        topic: null,
      };
    case 'cancel_deadline': {
      // chega na véspera do cancel_until: amanhã é o último dia; a data repete a da política
      const until = data.cancel_until ? ` · até ${dayMonth(data.cancel_until)}` : '';
      return {
        title: 'Amanhã é o último dia para cancelar sem custo',
        body: `${data.reservation_name ?? 'Reserva'}${until}`,
        tag: `cancel:${ref}`,
        actions: [],
        appBadge: null,
        ttlSeconds: 6 * 3600,
        topic: null,
      };
    }
    case 'retro_ready': // fase 9
      return {
        title: data.trip_name ?? 'Viajei',
        body: '',
        tag: `${kind}:${ref}`,
        actions: [],
        appBadge: null,
        ttlSeconds: 3600,
        topic: null,
      };
  }
}

/**
 * Caminho que o aviso abre: o "Agora" da viagem; o prazo de cancelamento abre a própria reserva; a
 * véspera com itens faltando abre a lista que falta (antes primeiro).
 */
export function navigatePath(
  row: Pick<ClaimedNotification, 'kind' | 'ref' | 'trip_id'> & {
    data?: Pick<NotificationData, 'before_left' | 'pack_left'>;
  },
): string {
  if (!row.trip_id) return '/';
  if (row.kind === 'cancel_deadline') {
    return `/viagens/${row.trip_id}/reservas?abrir=${encodeURIComponent(row.ref)}`;
  }
  if (row.kind === 'eve_checklist') {
    const before = row.data?.before_left ?? 0;
    const pack = row.data?.pack_left ?? 0;
    if (before > 0) return `/viagens/${row.trip_id}/checklists?aba=antes`;
    if (pack > 0) return `/viagens/${row.trip_id}/checklists?aba=mala`;
  }
  return `/viagens/${row.trip_id}/viagem`;
}

/** O payload para uma assinatura: `navigate` absoluto na origem que assinou (produção, preview ou localhost). */
export function buildPushPayload(
  row: Pick<ClaimedNotification, 'kind' | 'ref' | 'trip_id' | 'stop_id' | 'data'>,
  origin: string,
): PushPayload {
  const text = notificationText(row.kind, row.data, row.ref);
  const path = navigatePath(row);
  return {
    web_push: DECLARATIVE_WEB_PUSH,
    notification: {
      title: text.title,
      body: text.body,
      navigate: `${origin.replace(/\/$/, '')}${path}`,
      tag: text.tag,
      lang: 'pt-BR',
      dir: 'ltr',
      ...(text.appBadge !== null ? { app_badge: text.appBadge } : {}),
      data: { kind: row.kind, tripId: row.trip_id, stopId: row.stop_id, navigate: path },
    },
    actions: text.actions,
  };
}
