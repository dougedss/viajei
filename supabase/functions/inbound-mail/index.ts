import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { ImportConfigError, type ImportStore } from '../_shared/import-handler.ts';
import {
  handleInbound,
  type InboundOwner,
  type ReceiveResult,
} from '../_shared/inbound-handler.ts';

// o runtime do Supabase segura o worker até a promessa terminar (a leitura segue depois do 200)
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

/**
 * inbound-mail (fase 18): o webhook `email.received` do Resend. Um e-mail encaminhado para
 * `<código>@reservas.…` vira uma reserva na viagem cujas datas a contêm, ou uma reserva recebida. Sem
 * usuário: quem autentica é a assinatura svix do webhook (RESEND_WEBHOOK_SECRET), conferida sobre o
 * corpo bruto; sem as chaves, `no_source` (503, e o Resend tenta de novo). O conteúdo e os anexos
 * vêm pela API do Resend (RESEND_INBOUND_API_KEY: a chave Full access de uma conta do Resend só do
 * recebimento, separada da do SMTP do Auth; D253). A escrita no banco é só pelas três RPCs estreitas da 0016,
 * com a chave do servidor que o ambiente das funções fornece (`ctx.supabaseAdmin`), nunca com o client
 * admin solto nas tabelas da viagem; o registro em `ai_imports` (só números e códigos, D128) é a única
 * escrita direta, em nome da dona do código. O handler mora em `_shared/inbound-handler.ts`, testado
 * pelo Vitest. Nada do e-mail vai para log.
 */
const BUCKET = 'attachments';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ImportConfigError('ANTHROPIC_API_KEY ausente nos secrets');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export default {
  fetch: withSupabase({ auth: 'none', cors: false }, (req, ctx) => {
    const admin = ctx.supabaseAdmin;
    return handleInbound(req, {
      secrets: {
        webhook: Deno.env.get('RESEND_WEBHOOK_SECRET') || undefined,
        api: Deno.env.get('RESEND_INBOUND_API_KEY') || undefined,
      },
      fetch: (input, init) => fetch(input, init),
      rpc: {
        async lookup(code, sourceId) {
          const { data, error } = await admin.rpc('inbox_lookup', {
            p_code: code,
            p_source_id: sourceId,
          });
          if (error) throw new Error(`inbox_lookup ${error.code}`);
          const rows = (data ?? []) as InboundOwner[];
          return rows[0] ?? null;
        },
        async tripFor(userId, startAt, endAt) {
          const { data, error } = await admin.rpc('inbox_trip_for', {
            p_user: userId,
            p_start: startAt,
            p_end: endAt,
          });
          if (error) throw new Error(`inbox_trip_for ${error.code}`);
          return typeof data === 'string' ? data : null;
        },
        async receive(input) {
          const { data, error } = await admin.rpc('receive_reservation', {
            p_user: input.userId,
            p_trip: input.tripId,
            p_reservation: input.reservation,
            p_files: input.files,
            p_source_id: input.sourceId,
            p_ai_import_id: input.aiImportId,
          });
          if (error) throw new Error(`receive_reservation ${error.code}`);
          return data as ReceiveResult;
        },
      },
      async upload(path, bytes, mime) {
        const { error } = await admin.storage
          .from(BUCKET)
          .upload(path, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
        return !error;
      },
      ai: {
        openStream: (params, options) => anthropic().beta.messages.stream(params, options),
        // o registro da leitura em nome da dona do código; sem cota (a tranca é o remetente)
        storeFor(userId): ImportStore {
          return {
            claim: () => Promise.resolve({ ok: true }),
            isLab: () => Promise.resolve(false),
            tripOnServer: () => Promise.resolve(false),
            async open(row) {
              const { data, error } = await admin
                .from('ai_imports')
                .insert({ ...row, user_id: userId })
                .select('id')
                .single();
              if (error) throw new Error(`ai_imports ${error.code}`);
              return data.id as string;
            },
            async close(id, row) {
              const { error } = await admin.from('ai_imports').update(row).eq('id', id);
              if (error) throw new Error(`ai_imports ${error.code}`);
            },
          };
        },
      },
      uuid: () => crypto.randomUUID(),
      waitUntil: (work) => EdgeRuntime.waitUntil(work),
      log: (line) => console.log(line),
    });
  }),
};
