import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { BUILD_LANDMARK_FN } from '../_shared/landmark-protocol.ts';
import { runLandmarkJob, type LandmarkJob } from '../_shared/landmark-worker.ts';

// o runtime do Supabase segura o worker até a promessa terminar (o job segue depois do 200)
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void };

/**
 * build-landmark (fase 23): o trabalhador da fila dos cartões-postais. Servidor para servidor, chamado
 * a cada minuto pelo pg_cron (via pg_net, só quando há fila) com a chave secreta do projeto no
 * cabeçalho `apikey`: `withSupabase({ auth: 'secret' })` recusa qualquer outra chamada e entrega o
 * client do servidor (o molde da `send-notifications`, D37). O poder dele é o das RPCs da 0017
 * (`landmark_claim`, `landmark_identified`, `landmark_store`, `landmark_fail`) e o registro em
 * `ai_imports` em nome de quem pediu (D128); nada das tabelas da viagem. Um job por chamada: responde
 * na hora e trabalha em segundo plano, dentro do relógio da função. Nada da pessoa em log.
 */
let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ausente nos secrets');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export default {
  fetch: withSupabase({ auth: 'secret', cors: false }, (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'só POST' }, { status: 405 });
    const admin = ctx.supabaseAdmin;
    const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
      const { data, error } = await admin.rpc(fn, args);
      if (error) throw new Error(`${fn} ${error.code}`);
      return data as T;
    };
    const work = runLandmarkJob({
      rpc: {
        claim: () => rpc<LandmarkJob | null>('landmark_claim', {}),
        identified: (job, key, name, wikidata, modeled) =>
          rpc('landmark_identified', {
            p_job: job,
            p_key: key,
            p_name: name,
            p_wikidata: wikidata,
            p_modeled: modeled,
          }),
        store: async (job, recipe, modeled, sources) => {
          await rpc('landmark_store', {
            p_job: job,
            p_recipe: recipe,
            p_modeled: modeled,
            p_sources: sources,
          });
        },
        fail: async (job, code, retry) => {
          await rpc('landmark_fail', { p_job: job, p_code: code, p_retry: retry });
        },
        async record(row) {
          if (!row.user_id) return;
          const { error } = await admin.from('ai_imports').insert({
            user_id: row.user_id,
            trip_id: row.trip_id,
            kind: 'landmark',
            input_chars: 0,
            input_bytes: row.input_bytes,
            model: row.model,
            status: row.status,
            error: row.error,
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
            finished_at: new Date().toISOString(),
          });
          if (error) console.warn(`${BUILD_LANDMARK_FN} ai_imports ${error.code}`);
        },
      },
      fetch: (input, init) => fetch(input, init),
      ai: (params, options) =>
        anthropic().beta.messages.create(params, { signal: options.signal, maxRetries: 1 }),
      log: (line) => console.log(line),
    });
    EdgeRuntime.waitUntil(
      work.catch((err: unknown) =>
        console.error(`${BUILD_LANDMARK_FN} ${err instanceof Error ? err.message : String(err)}`),
      ),
    );
    return Response.json({ ok: true });
  }),
};
