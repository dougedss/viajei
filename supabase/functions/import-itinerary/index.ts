import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { handleImport, ImportConfigError, type ImportStore } from '../_shared/import-handler.ts';

// o runtime do Supabase segura o worker até a promessa terminar (o registro fecha depois do stream)
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

/**
 * import-itinerary: lê um roteiro colado e devolve o JSON da importação aos poucos (SSE), para o
 * preview do app. Roda como a pessoa (`auth: 'user'`, RLS vale), sem chave secreta do Supabase.
 * A `ANTHROPIC_API_KEY` existe só em `supabase secrets`. Limite: 20 leituras por pessoa em 24 h,
 * pela `edge_call`. O handler mora em `_shared/import-handler.ts`, testado pelo Vitest; aqui só se
 * ligam o runtime, o SDK e o banco. Nada do texto nem da resposta vai para log.
 */

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // criado na primeira leitura: sem a chave, o worker sobe e responde, e o registro diz `config`
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ImportConfigError('ANTHROPIC_API_KEY ausente nos secrets');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// o worker vai ser encerrado (limite de parede, CPU ou memória): as leituras em andamento param e
// fecham o registro com `shutdown`
const running = new Set<() => void>();
addEventListener('beforeunload', () => {
  for (const stop of running) stop();
});

export default {
  fetch: withSupabase({ auth: 'user' }, (req, ctx) => {
    const db = ctx.supabase;
    const store: ImportStore = {
      async claim(fn, limit) {
        const { error } = await db.rpc('edge_call', { p_fn: fn, p_limit: limit });
        if (!error) return { ok: true };
        if (error.code === '54000') return { ok: false, retryAt: error.details || null };
        throw new Error(`edge_call ${error.code}`);
      },
      async isLab() {
        const { data } = await db.rpc('my_lab_role');
        return data === 'runner';
      },
      async tripOnServer(tripId) {
        const { data } = await db.from('trips').select('id').eq('id', tripId).maybeSingle();
        return data !== null;
      },
      async open(row) {
        const { data, error } = await db.from('ai_imports').insert(row).select('id').single();
        if (error) throw new Error(`ai_imports ${error.code}`);
        return data.id as string;
      },
      async close(id, row) {
        const { error } = await db.from('ai_imports').update(row).eq('id', id);
        if (error) throw new Error(`ai_imports ${error.code}`);
      },
    };
    return handleImport(req, {
      store,
      openStream: (params, options) => anthropic().beta.messages.stream(params, options),
      waitUntil: (work) => EdgeRuntime.waitUntil(work),
      onShutdown: (stop) => {
        running.add(stop);
        return () => running.delete(stop);
      },
      log: (line) => console.log(line),
    });
  }),
};
