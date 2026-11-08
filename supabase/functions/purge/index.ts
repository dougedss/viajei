import { withSupabase } from '@supabase/server';
import { handlePurge, PURGE_BUCKET } from '../_shared/purge.ts';

/**
 * purge: o expurgo diário (fase 12). O pg_cron a chama às 4h de São Paulo com a chave secreta do
 * Vault no cabeçalho `apikey`, como a `send-notifications`: `public.purge` apaga as viagens
 * excluídas há 30 dias, as lápides de 90 dias (gravando o horizonte do `resync`) e os registros de
 * 90 dias, e devolve os objetos do Storage a apagar, que saem aqui pela API do Storage.
 *
 * Com o JWT de um executor do laboratório, só o `dry_run` (`lab_purge_preview`): o laboratório
 * confere todo dia que a função responde e que nada fora da regra se qualifica, sem nunca ter a
 * chave secreta (D52). O handler mora em `_shared/purge.ts`, testado pelo Vitest.
 */
export default {
  fetch: withSupabase({ auth: ['secret', 'user'] }, (req, ctx) =>
    handlePurge(req, {
      mode: ctx.authMode === 'secret' ? 'secret' : 'user',
      now: () => new Date(),
      // `purge` só existe para o service_role; o laboratório vai como ele mesmo, com RLS
      rpc: (fn, args) => (fn === 'purge' ? ctx.supabaseAdmin : ctx.supabase).rpc(fn, args),
      async remove(paths) {
        const { data, error } = await ctx.supabaseAdmin.storage.from(PURGE_BUCKET).remove(paths);
        if (error) throw new Error(error.message);
        return data.length;
      },
      log: (line) => console.info('purge', line),
    }),
  ),
};
