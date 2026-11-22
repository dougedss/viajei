import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { ImportConfigError, type ImportStore } from '../_shared/import-handler.ts';
import { handlePlanSearch } from '../_shared/plan-search-handler.ts';

// o runtime do Supabase segura o worker até a promessa terminar (o registro fecha depois do stream)
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

/**
 * plan-search (fase 27): o planejador. A IA planeja a busca de lugares com ferramentas que esta função
 * executa (a Text Search do Google pela `GOOGLE_PLACES_API_KEY`, a Geoapify de reserva pela
 * `GEOAPIFY_API_KEY`, a estimativa do tempo de carro) e entrega o passeio em passos; o app julga e a
 * pessoa escolhe. Roda como a pessoa (`auth: 'user'`, RLS vale), sem chave secreta do Supabase, com a
 * `ANTHROPIC_API_KEY` que já existe em `supabase secrets`. Cota pela `edge_call`: `plan-search` (20 em
 * 24 h; 200 para a conta do laboratório, que roda a bateria). O handler mora em
 * `_shared/plan-search-handler.ts`, testado pelo Vitest. Nada do pedido nem da resposta vai para log.
 */

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new ImportConfigError('ANTHROPIC_API_KEY ausente nos secrets');
    client = new Anthropic({ apiKey });
  }
  return client;
}

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
      tripOnServer: () => Promise.resolve(false),
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
    return handlePlanSearch(req, {
      store,
      openStream: (params, options) => anthropic().beta.messages.stream(params, options),
      waitUntil: (work) => EdgeRuntime.waitUntil(work),
      onShutdown: (stop) => {
        running.add(stop);
        return () => running.delete(stop);
      },
      log: (line) => console.log(line),
      tools: {
        fetch: (input, init) => fetch(input, init),
        googleKey: Deno.env.get('GOOGLE_PLACES_API_KEY') || undefined,
        geoapifyKey: Deno.env.get('GEOAPIFY_API_KEY') || undefined,
      },
    });
  }),
};
