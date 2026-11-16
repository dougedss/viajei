import { withSupabase } from '@supabase/server';
import { handlePlaces } from '../_shared/places-handler.ts';
import { PLACES_DAILY_LIMIT, PLACES_FN } from '../_shared/places-schema.ts';

/**
 * find-places (fase 24): os lugares que existem de verdade, por tipo, num círculo (as opções ao
 * alcance) ou no corredor da rota (as sugestões do caminho). A fonte é a Places API da Geoapify, sobre
 * o OpenStreetMap, com a `GEOAPIFY_API_KEY` só em `supabase secrets` (regra 9; a conta e a chave são
 * do Douglas). Roda como a pessoa (`auth: 'user'`, RLS vale), sem chave secreta do Supabase. Cota pela
 * `edge_call`: 60 buscas por pessoa em 24 h. Sem chave, `no_source` (503): o app busca pelo nome. O
 * handler mora em `_shared/places-handler.ts`, testado pelo Vitest; o log é só de números.
 */
export default {
  fetch: withSupabase({ auth: 'user' }, (req, ctx) =>
    handlePlaces(req, {
      key: Deno.env.get('GEOAPIFY_API_KEY') || undefined,
      async claim() {
        const { error } = await ctx.supabase.rpc('edge_call', {
          p_fn: PLACES_FN,
          p_limit: PLACES_DAILY_LIMIT,
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
