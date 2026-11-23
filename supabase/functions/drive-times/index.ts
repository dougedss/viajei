import { withSupabase } from '@supabase/server';
import { handleDrive } from '../_shared/drive-handler.ts';
import { DRIVE_DAILY_LIMIT, DRIVE_FN } from '../_shared/drive-schema.ts';

/**
 * drive-times (a correção de 22/11/2026, D310): o tempo de carro medido entre pares de pontos, pela
 * Routes API do Google (`computeRouteMatrix`, sem trânsito). É o "X min de carro" dos cartões das
 * opções e a estrada da conta do passeio: nenhum tempo de carro mostrado é estimativa em linha reta.
 * A chave `GOOGLE_PLACES_API_KEY` só em `supabase secrets` (regra 9; a conta e a chave são do Douglas,
 * e a Routes API precisa estar ligada no projeto e na restrição da chave). Roda como a pessoa
 * (`auth: 'user'`, RLS vale), sem chave secreta do Supabase. Cota pela `edge_call`: 200 medições por
 * pessoa em 24 h, até 60 pares cada. Sem a chave, `no_source` (503): a tela diz que não deu para medir.
 * O handler mora em `_shared/drive-handler.ts`, testado pelo Vitest; o log é só de números.
 */
export default {
  fetch: withSupabase({ auth: 'user' }, (req, ctx) =>
    handleDrive(req, {
      googleKey: Deno.env.get('GOOGLE_PLACES_API_KEY') || undefined,
      async claim() {
        const { error } = await ctx.supabase.rpc('edge_call', {
          p_fn: DRIVE_FN,
          p_limit: DRIVE_DAILY_LIMIT,
        });
        if (!error) return 'ok';
        if (error.code === '54000') return 'limit';
        throw new Error(`edge_call ${error.code}`);
      },
      fetch: (input, init) => fetch(input, init),
      log: (line) => console.log(line),
    }),
  ),
};
