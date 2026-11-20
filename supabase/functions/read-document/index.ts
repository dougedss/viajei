import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { ImportConfigError, type ImportStore } from '../_shared/import-handler.ts';
import { handleRead } from '../_shared/read-handler.ts';

// o runtime do Supabase segura o worker até a promessa terminar (o registro fecha depois do stream)
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

/**
 * read-document (fase 18): lê a confirmação de uma reserva (o texto colado, ou o PDF ou o print que a
 * fila já subiu ao Storage) ou a foto de uma nota, e devolve uma reserva ou um gasto preenchidos, em
 * SSE, como a import-itinerary e com o mesmo esqueleto: roda como a pessoa (`auth: 'user'`, RLS vale;
 * o anexo é lido do bucket com o JWT dela, então só o que ela pode ver), sem chave secreta do Supabase,
 * com a ANTHROPIC_API_KEY que já existe em `supabase secrets`. Cotas pela `edge_call`:
 * `read-confirmation` (20 em 24 h) e `read-receipt` (30). O handler mora em `_shared/read-handler.ts`,
 * testado pelo Vitest. Nada do texto, do anexo nem da resposta vai para log.
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
    return handleRead(req, {
      store,
      // o anexo pelo caminho, como a pessoa: a policy "membros leem" do bucket vale
      async fetchFile(path) {
        const { data, error } = await db.storage.from(BUCKET).download(path);
        if (error || !data) return null;
        return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type };
      },
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
