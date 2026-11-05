import { withSupabase } from '@supabase/server';
import { publicKeyFromPkcs8, toBase64Url } from '../_shared/vapid.ts';
import { verifyVapidAuthorization } from '../_shared/vapid-jwt.ts';

/**
 * push-receiver: um push service de mentira, só para o laboratório. As assinaturas de laboratório
 * apontam para cá (`/push-receiver/<inbox>`, ou `/push-receiver/<inbox>/gone` para simular um
 * aparelho que desinstalou o app), e o send-notifications de verdade envia para cá como enviaria
 * para o FCM ou a Apple. O receptor faz o que um push service faz: confere o JWT VAPID (só a nossa
 * chave, `aud` igual à origem do endpoint, `exp` em até 24 h), recusa corpo acima de 4096 bytes, e
 * responde 201, 410, 413 ou 401. Cada POST vira uma linha em `lab_inbox`, com o corpo ainda cifrado:
 * quem decifra é o laboratório, que guarda a chave privada da assinatura.
 *
 * Sem JWT da plataforma (`verify_jwt = false`) porque push service não recebe chave do Supabase; a
 * autenticação é o próprio VAPID. Endpoint desconhecido responde 404 e não grava nada.
 */
const MAX_BODY_BYTES = 4096;
const PATH = /\/push-receiver\/([0-9a-f-]{36})(\/gone)?\/?$/;
/** a caixa de entrada guarda só a última semana */
const KEEP_MS = 7 * 86_400_000;

let ourPublicKey: Promise<string> | null = null;
function serverPublicKey(): Promise<string> {
  ourPublicKey ??= (async () => {
    const pkcs8 = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!pkcs8) throw new Error('VAPID_PRIVATE_KEY não está definida');
    return publicKeyFromPkcs8(pkcs8);
  })();
  return ourPublicKey;
}

function header(req: Request, name: string): string | null {
  return req.headers.get(name);
}

export default {
  fetch: withSupabase({ auth: 'none', cors: false }, async (req, ctx) => {
    if (req.method !== 'POST') return new Response(null, { status: 405 });
    const match = PATH.exec(new URL(req.url).pathname);
    if (!match?.[1]) return new Response(null, { status: 404 });
    const inbox = match[1];
    const gone = match[2] !== undefined;
    const admin = ctx.supabaseAdmin;

    const { data: subs, error: subError } = await admin
      .from('push_subscriptions')
      .select('id, user_id, endpoint')
      .like('endpoint', `%/push-receiver/${inbox}%`)
      .limit(1);
    if (subError) {
      console.error('push-receiver: assinatura', subError.message);
      return new Response(null, { status: 500 });
    }
    const sub = subs[0];
    if (!sub) return new Response(null, { status: 404 });

    const body = new Uint8Array(await req.arrayBuffer());
    const verdict = await verifyVapidAuthorization(header(req, 'authorization'), {
      publicKey: await serverPublicKey(),
      audience: new URL(sub.endpoint).origin,
      now: Date.now(),
    });
    const status = !verdict.ok ? 401 : body.length > MAX_BODY_BYTES ? 413 : gone ? 410 : 201;
    const ttl = Number(header(req, 'ttl'));

    const { error } = await admin.from('lab_inbox').insert({
      user_id: sub.user_id,
      subscription_id: sub.id,
      inbox,
      gone,
      status_code: status,
      vapid_ok: verdict.ok,
      vapid_error: verdict.ok ? null : verdict.error,
      vapid_sub: verdict.claims?.sub ?? null,
      vapid_aud: verdict.claims?.aud ?? null,
      vapid_exp:
        verdict.claims?.exp !== undefined
          ? new Date(verdict.claims.exp * 1000).toISOString()
          : null,
      ttl: Number.isFinite(ttl) ? ttl : null,
      urgency: header(req, 'urgency'),
      topic: header(req, 'topic'),
      content_encoding: header(req, 'content-encoding'),
      size_bytes: body.length,
      body_b64: body.length <= MAX_BODY_BYTES ? toBase64Url(body) : null,
    });
    if (error) {
      console.error('push-receiver: caixa', error.message);
      return new Response(null, { status: 500 });
    }
    await admin
      .from('lab_inbox')
      .delete()
      .lt('received_at', new Date(Date.now() - KEEP_MS).toISOString());
    console.info('push-receiver', { status, gone, size: body.length });
    return new Response(null, { status });
  }),
};
