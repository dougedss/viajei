import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { handleLandmarkCheck, type CheckTarget } from '../_shared/landmark-check-handler.ts';
import {
  LANDMARK_CHECK_FN,
  LANDMARK_CHECK_LIMIT,
  LANDMARKS_FN,
} from '../_shared/landmark-protocol.ts';

/**
 * landmarks (fase 23): a conferência de um cartão-postal pelo aparelho (ação `check`). Roda como a
 * pessoa (`auth: 'user'`, RLS vale) para a cota (`edge_call`) e o registro em `ai_imports`; a peça
 * gerada e o veredito passam pelas duas RPCs estreitas da 0017 com a chave do servidor
 * (`landmark_check_target`, que só devolve a peça a quem é da viagem que a pediu, e
 * `landmark_verdict`). A ANTHROPIC_API_KEY só aqui. O handler mora em `_shared/landmark-check-handler.ts`,
 * testado pelo Vitest. Nada das capturas, das fotos nem da pessoa vai para log.
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
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const db = ctx.supabase;
    const admin = ctx.supabaseAdmin;
    const { data: userData } = await db.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return Response.json({ error: { code: 'unauthorized' } }, { status: 401 });
    return handleLandmarkCheck(req, {
      userId,
      async claim() {
        const { error } = await db.rpc('edge_call', {
          p_fn: LANDMARK_CHECK_FN,
          p_limit: LANDMARK_CHECK_LIMIT,
        });
        if (!error) return 'ok';
        if (error.code === '54000') return 'limit';
        throw new Error(`edge_call ${error.code}`);
      },
      async isLab() {
        const { data } = await db.rpc('my_lab_role');
        return data === 'runner';
      },
      async target(landmarkId) {
        const { data, error } = await admin.rpc('landmark_check_target', {
          p_landmark: landmarkId,
          p_user: userId,
        });
        if (error) throw new Error(`landmark_check_target ${error.code}`);
        return (data as CheckTarget | null) ?? null;
      },
      async verdict(landmarkId, version, verdict, recipe) {
        const { data, error } = await admin.rpc('landmark_verdict', {
          p_landmark: landmarkId,
          p_version: version,
          p_verdict: verdict,
          p_recipe: recipe,
        });
        if (error) throw new Error(`landmark_verdict ${error.code}`);
        return data as 'published' | 'adjusted' | 'rejected' | 'stale';
      },
      // o registro como a pessoa, no molde da importação (D132): abrir com o que os grants de
      // inserção permitem e fechar com o resultado (o carimbo é do gatilho). Num insert só, as
      // colunas do fechamento davam 42501 e a conferência ficava fora da conta (D269)
      async record(row) {
        const { data, error } = await db
          .from('ai_imports')
          .insert({
            trip_id: row.trip_id,
            kind: 'landmark',
            input_chars: 0,
            input_bytes: row.input_bytes,
            model: row.model,
          })
          .select('id')
          .single();
        if (error) {
          console.warn(`${LANDMARKS_FN} ai_imports open ${error.code}`);
          return;
        }
        const { error: closeError } = await db
          .from('ai_imports')
          .update({
            status: row.status,
            error: row.error,
            input_tokens: row.input_tokens,
            output_tokens: row.output_tokens,
          })
          .eq('id', data.id as string);
        if (closeError) console.warn(`${LANDMARKS_FN} ai_imports close ${closeError.code}`);
      },
      fetch: (input, init) => fetch(input, init),
      // em stream: o SDK recusa um pedido sem stream com `max_tokens` alto (a receita e o veredito
      // pedem 24 mil), e a resposta inteira chega pelo `finalMessage`
      ai: (params, options) =>
        anthropic()
          .beta.messages.stream(params, { signal: options.signal, maxRetries: 1 })
          .finalMessage(),
      log: (line) => console.log(line),
    });
  }),
};
