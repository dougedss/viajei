import { withSupabase } from '@supabase/server';
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from '@negrel/webpush';
import { z } from 'zod';
import {
  buildPushPayload,
  claimedNotificationSchema,
  notificationText,
  type ClaimedNotification,
  type ClaimedSubscription,
} from '../_shared/notifications.ts';
import { briefingWeather } from '../_shared/briefing-weather.ts';
import { vapidJwkFromPkcs8 } from '../_shared/vapid.ts';

/**
 * send-notifications: servidor para servidor, chamada a cada minuto pelo pg_cron (via pg_net) com a
 * chave secreta do projeto no cabeçalho `apikey`. `withSupabase({ auth: 'secret' })` recusa qualquer
 * outra chamada e entrega o client admin: é a única função com `supabaseAdmin`.
 *
 * Fluxo: claim_due_notifications (reserva atômica no banco) → o clima dos briefings da manhã (uma
 * chamada ao Open-Meteo para o lote, com prazo de 3 s, gravada em `data.weather`) → texto em _shared/notifications.ts →
 * Web Push (RFC 8291/8292) para cada assinatura viva, 8 por vez, dentro do orçamento de 30 s →
 * sent_at/status na linha; 404 ou 410 marcam failed_at na assinatura.
 */
const CONCURRENCY = 8;
const BUDGET_MS = 27_000;
const SEND_TIMEOUT_MS = 10_000;

let appServer: Promise<ApplicationServer> | null = null;
function server(): Promise<ApplicationServer> {
  appServer ??= (async () => {
    const pkcs8 = Deno.env.get('VAPID_PRIVATE_KEY');
    const subject = Deno.env.get('VAPID_SUBJECT');
    if (!pkcs8 || !subject) throw new Error('VAPID_PRIVATE_KEY e VAPID_SUBJECT são obrigatórios');
    const vapidKeys = await importVapidKeys(await vapidJwkFromPkcs8(pkcs8), { extractable: false });
    return ApplicationServer.new({ contactInformation: subject, vapidKeys });
  })();
  return appServer;
}

type SendResult = { ok: true } | { ok: false; gone: boolean; error: string };

async function sendOne(row: ClaimedNotification, sub: ClaimedSubscription): Promise<SendResult> {
  const text = notificationText(row.kind, row.data, row.ref);
  const payload = buildPushPayload(row, sub.origin);
  const subscriber = (await server()).subscribe({
    endpoint: sub.endpoint,
    keys: { auth: sub.auth, p256dh: sub.p256dh },
  });
  try {
    await Promise.race([
      subscriber.pushTextMessage(JSON.stringify(payload), {
        ttl: text.ttlSeconds,
        urgency: Urgency.High,
        ...(text.topic ? { topic: text.topic } : {}),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('push service não respondeu em 10 s')), SEND_TIMEOUT_MS),
      ),
    ]);
    return { ok: true };
  } catch (err) {
    if (err instanceof PushMessageError) {
      const status = err.response.status;
      return { ok: false, gone: status === 404 || status === 410, error: `push ${status}` };
    }
    return { ok: false, gone: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Roda `fn` sobre os itens com no máximo `limit` em paralelo, até o orçamento de tempo acabar. */
async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  deadline: number,
  fn: (item: T) => Promise<void>,
): Promise<number> {
  let next = 0;
  let skipped = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      if (Date.now() > deadline) {
        skipped++;
        continue;
      }
      await fn(item);
    }
  });
  await Promise.all(workers);
  return skipped;
}

const bodySchema = z.object({ now: z.string().optional() }).passthrough();

/**
 * O clima dos briefings da manhã do lote, gravado na linha antes de enviar: a nova tentativa de um
 * aviso lê o que ficou gravado (o mesmo texto) e não chama o Open-Meteo de novo. Sem resposta no
 * prazo, o aviso sai sem clima, com o motivo em `data.weather`.
 */
async function withWeather(
  rows: ClaimedNotification[],
  save: (id: string, data: ClaimedNotification['data']) => PromiseLike<unknown>,
): Promise<{ ok: number; none: number }> {
  const pending = rows.filter((r) => r.kind === 'morning_briefing' && r.data.weather == null);
  const tally = { ok: 0, none: 0 };
  if (pending.length === 0) return tally;
  const weather = await briefingWeather(
    pending.map((r) => ({
      id: r.id,
      date: r.data.date,
      first_point: r.data.first_point,
      last_point: r.data.last_point,
    })),
    { fetch },
  );
  await Promise.all(
    pending.map(async (r) => {
      const w = weather.get(r.id);
      if (!w) return;
      r.data = { ...r.data, weather: w };
      tally[w.status]++;
      await save(r.id, r.data);
    }),
  );
  return tally;
}

export default {
  fetch: withSupabase({ auth: 'secret' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
    const started = Date.now();
    const deadline = started + BUDGET_MS;
    // o corpo é informativo; a hora que vale é a do banco
    bodySchema.safeParse(await req.json().catch(() => ({})));

    const admin = ctx.supabaseAdmin;
    const { data, error } = await admin.rpc('claim_due_notifications', {
      p_now: new Date().toISOString(),
    });
    if (error) {
      console.error('claim_due_notifications:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    const parsed = z.array(claimedNotificationSchema).safeParse(data);
    if (!parsed.success) {
      console.error('claim_due_notifications: resposta fora do formato', parsed.error.message);
      return Response.json({ error: 'resposta fora do formato' }, { status: 500 });
    }
    const rows = parsed.data;
    const summary = { claimed: rows.length, sent: 0, failed: 0, no_subscription: 0, skipped: 0 };
    const weather = await withWeather(rows, (id, data) =>
      admin.from('notifications_sent').update({ data }).eq('id', id),
    );

    summary.skipped = await forEachLimited(rows, CONCURRENCY, deadline, async (row) => {
      if (row.subscriptions.length === 0) {
        summary.no_subscription++;
        await admin
          .from('notifications_sent')
          .update({ status: 'no_subscription', error: null })
          .eq('id', row.id);
        return;
      }
      const results = await Promise.all(row.subscriptions.map((sub) => sendOne(row, sub)));
      const gone = row.subscriptions.filter(
        (_, i) => results[i]?.ok === false && (results[i] as { gone: boolean }).gone,
      );
      if (gone.length > 0) {
        await admin
          .from('push_subscriptions')
          .update({ failed_at: new Date().toISOString() })
          .in(
            'id',
            gone.map((s) => s.id),
          );
      }
      const delivered = results.some((r) => r.ok);
      if (delivered) {
        summary.sent++;
        await admin
          .from('notifications_sent')
          .update({ status: 'sent', sent_at: new Date().toISOString(), error: null })
          .eq('id', row.id);
      } else {
        summary.failed++;
        const firstError = results.find((r) => !r.ok);
        await admin
          .from('notifications_sent')
          .update({
            status: 'failed',
            error: firstError && !firstError.ok ? firstError.error : 'falhou',
          })
          .eq('id', row.id);
      }
    });

    console.info('send-notifications', { ...summary, weather, ms: Date.now() - started });
    return Response.json({ ...summary, weather, ms: Date.now() - started });
  }),
};
