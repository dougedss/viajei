import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { APP_SENDER } from '../../supabase/functions/_shared/constants.ts';
import { inboxAddress } from '../../supabase/functions/_shared/inbox-code.ts';
import { pushPayloadSchema } from '../../supabase/functions/_shared/notifications.ts';
import { fromBase64Url } from '../../supabase/functions/_shared/vapid.ts';
import { addDays } from './arm.ts';
import { must, syncPush } from './client.ts';
import type { LabConfig } from './env.ts';
import type { Check } from './evaluate.ts';
import { makePdf } from './files.ts';
import { log, sleep, type Session } from './session.ts';
import { decryptWebPush, type SubscriptionKeys } from './webpush-decrypt.ts';

/**
 * `app_email_recebido` (fase 18), de ponta a ponta e de verdade: o laboratório envia um e-mail pela
 * API do Resend, do remetente do app (`viajei@reitechia.com.br`, o domínio de envio) para o endereço
 * de recebimento do lab-a (a conta do laboratório aceita esse remetente: a exceção da D105), com um
 * PDF inventado; o Resend o recebe no subdomínio, chama a `inbound-mail`, a função lê com a IA e grava
 * a recebida (as datas, 90 dias à frente, não casam com viagem nenhuma do laboratório), e o
 * `due_notifications` manda o aviso, que chega ao `push-receiver` na assinatura principal do lab-a.
 * Sem o secret `RESEND_API_KEY` no Actions, ou com a função respondendo `no_source` (as chaves ainda
 * não estão no hospedado), o cenário é pulado com o motivo, nunca vermelho. Em `data`, só tempos e
 * contagens: nunca o endereço, o código nem o texto do e-mail.
 */
export type EmailContext = {
  cfg: LabConfig;
  a: Session;
  /** o navegador do lab-a, para ver a recebida na tela; null sem navegador */
  page: Page | null;
  apiKey: string | undefined;
  /** a assinatura principal do lab-a no receptor de mentira, para ler o aviso */
  inbox: { inbox: string; keys: SubscriptionKeys } | null;
  artifactsDir: string;
};

const RESEND_SEND = 'https://api.resend.com/emails';
const ROW_TIMEOUT = 240_000;
const PUSH_TIMEOUT = 180_000;
const CODE = 'LAB-MAIL-1';
const NAME = 'Pousada do e-mail do laboratório';

function skip(detail: string, data: Record<string, unknown> = {}): Check {
  return { scenario: 'app_email_recebido', status: 'skip', latency_ms: null, detail, data };
}

export async function appEmailRecebido(ctx: EmailContext, today: string): Promise<Check> {
  const { cfg, a } = ctx;
  const startedAt = Date.now();
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  /** o que chegou (preenchido dentro dos passos: um objeto, para o TypeScript não estreitar) */
  const got: { id: string | null; files: string[] } = { id: null, files: [] };
  const step = async (name: string, run: () => Promise<void>) => {
    if (steps.some((s) => !s.ok)) return;
    try {
      await run();
      steps.push({ step: name, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      steps.push({ step: name, ok: false, detail: message.slice(0, 300) });
      await ctx.page
        ?.screenshot({ path: join(ctx.artifactsDir, 'app_email_recebido.png'), fullPage: true })
        .catch(() => undefined);
    }
  };

  if (!ctx.apiKey) {
    return skip(
      'Sem o secret RESEND_API_KEY no GitHub Actions: o laboratório não tem como enviar um e-mail de verdade (é do Douglas).',
    );
  }
  // a função responde `no_source` (503) sem as chaves do Resend nos secrets do hospedado, e 401 a um
  // pedido sem assinatura quando elas existem: um pedido vazio diz em qual caso estamos
  const probe = await fetch(`${cfg.url}/functions/v1/inbound-mail`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => null);
  data.sonda_http = probe?.status ?? null;
  if (probe?.status === 503) {
    return skip(
      'A função inbound-mail respondeu no_source: as chaves do Resend (RESEND_INBOUND_API_KEY e RESEND_WEBHOOK_SECRET) ainda não estão nos secrets do hospedado (são do Douglas).',
      data,
    );
  }
  if (probe?.status !== 401) {
    return {
      scenario: 'app_email_recebido',
      status: 'fail',
      latency_ms: Date.now() - startedAt,
      detail: `A função inbound-mail respondeu ${String(probe?.status ?? 'nada')} a um pedido sem assinatura (esperado 401).`,
      data,
    };
  }

  let sentAt = new Date().toISOString();
  await step('o endereço do lab-a', async () => {
    const [row] = must(await a.client.from('inbox_addresses').select('code').limit(1), 'endereço');
    if (!row) throw new Error('o lab-a não tem endereço (o pull do usuário não o trouxe?)');
    data.endereco = inboxAddress(row.code);
  });
  await step('enviar o e-mail de verdade pelo Resend, com um PDF', async () => {
    const checkin = addDays(today, 90);
    const checkout = addDays(today, 91);
    const text = [
      `Olá! Sua reserva na ${NAME} está confirmada.`,
      `Código da reserva: ${CODE}`,
      `Check-in: ${checkin} a partir das 15:00 · Check-out: ${checkout} até 11:00`,
      'Valor total: R$ 275,00 (café incluído)',
      'Telefone da pousada: (54) 99123-9876',
      'Cancelamento grátis até 7 dias antes do check-in.',
      'Reservado pelo Booking.',
    ].join('\n');
    sentAt = new Date(Date.now() - 5_000).toISOString();
    const t0 = Date.now();
    const res = await fetch(RESEND_SEND, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.apiKey ?? ''}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `Viajei <${APP_SENDER}>`,
        to: [data.endereco],
        subject: `Fwd: Confirmação · ${NAME}`,
        text,
        attachments: [{ filename: 'voucher.pdf', content: makePdf().toString('base64') }],
      }),
    });
    if (!res.ok) throw new Error(`o Resend respondeu ${String(res.status)} ao envio`);
    data.envio_ms = Date.now() - t0;
    delete data.endereco;
  });
  await step('a reserva recebida chega ao servidor (a função leu o e-mail)', async () => {
    const t0 = Date.now();
    for (;;) {
      const rows = must(
        await a.client
          .from('received_reservations')
          .select('id, name, confirmation_code, status, amount, files, received_at')
          .gte('received_at', sentAt)
          .order('received_at', { ascending: false }),
        'recebidas',
      );
      const row = rows.find((r) => r.confirmation_code === CODE);
      if (row) {
        got.id = row.id;
        got.files = (Array.isArray(row.files) ? row.files : [])
          .map((f) =>
            typeof f === 'object' && f !== null
              ? (f as { storage_path?: string }).storage_path
              : undefined,
          )
          .filter((p): p is string => typeof p === 'string');
        data.recebida_ms = Date.now() - t0;
        data.status = row.status;
        data.anexos = got.files.length;
        data.nome_lido = row.name === NAME;
        data.valor_lido = Number(row.amount) === 275;
        if (row.status !== 'received')
          throw new Error(`a recebida nasceu ${row.status} (esperado received)`);
        if (got.files.length !== 1)
          throw new Error(`${String(got.files.length)} anexos na caixa (esperado 1)`);
        break;
      }
      if (Date.now() - t0 > ROW_TIMEOUT) throw new Error('a recebida não chegou em 4 min');
      await sleep(5_000);
    }
  });
  await step('o aviso "Chegou a reserva" chega ao push-receiver', async () => {
    if (!ctx.inbox) throw new Error('sem a assinatura principal do lab-a');
    const t0 = Date.now();
    for (;;) {
      const rows = must(
        await a.client
          .from('lab_inbox')
          .select('body_b64, received_at')
          .eq('inbox', ctx.inbox.inbox)
          .gte('received_at', sentAt)
          .order('received_at'),
        'caixa do receptor',
      );
      for (const row of rows) {
        if (!row.body_b64) continue;
        try {
          const plain = new TextDecoder().decode(
            await decryptWebPush(fromBase64Url(row.body_b64), ctx.inbox.keys),
          );
          const payload = pushPayloadSchema.safeParse(JSON.parse(plain));
          if (payload.success && payload.data.notification.data.kind === 'reservation_received') {
            data.aviso_ms = Date.now() - t0;
            data.aviso_titulo_ok = payload.data.notification.title === `Chegou a reserva: ${NAME}`;
            data.aviso_destino = payload.data.notification.data.navigate;
            return;
          }
        } catch {
          // um aviso de outro tipo ou de outra assinatura: segue
        }
      }
      if (Date.now() - t0 > PUSH_TIMEOUT) throw new Error('o aviso não chegou em 3 min');
      await sleep(5_000);
    }
  });
  await step('a recebida na tela do lab-a', async () => {
    const page = ctx.page;
    if (!page) {
      data.na_tela = 'sem navegador';
      return;
    }
    await page.goto(`${cfg.appOrigin}/viagens`);
    await page
      .getByRole('region', { name: 'Reservas recebidas' })
      .getByRole('article', { name: NAME })
      .waitFor({ timeout: 60_000 });
    data.na_tela = true;
  });

  // a limpeza: a recebida dispensada pelo mesmo caminho do app (o `sync_push`) e os objetos da caixa
  // fora (a dona apaga, só sem linha viva; o que ficar sai pelo expurgo)
  if (got.id) {
    await syncPush(a.client, [
      {
        table: 'received_reservations',
        id: got.id,
        op: 'patch',
        values: { status: 'dismissed' },
      },
    ]).catch(() => undefined);
    if (got.files.length > 0)
      await a.client.storage
        .from('attachments')
        .remove(got.files)
        .catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  log(`app_email_recebido: ${failed ? `falhou em ${failed.step}` : 'ok'}`);
  return {
    scenario: 'app_email_recebido',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `O e-mail virou a recebida em ${typeof data.recebida_ms === 'number' ? `${(data.recebida_ms / 1000).toFixed(0)} s` : '?'} e o aviso chegou em ${typeof data.aviso_ms === 'number' ? `${(data.aviso_ms / 1000).toFixed(0)} s` : '?'}`,
    data: { ...data, passos: steps },
  };
}
