import type { BrowserContext, Page, Route } from '@playwright/test';
import { encodeEvent } from '../../supabase/functions/_shared/import-protocol.ts';
import type { Place } from '../../supabase/functions/_shared/places-schema.ts';
import type {
  FoundPlace,
  Outing,
  PlanSearchRequest,
  PlanSearchResult,
  PlanStep,
} from '../../supabase/functions/_shared/plan-search-protocol.ts';

/**
 * O planejador (fase 27) respondido no navegador, como a `plan-trip` nos outros specs: nenhuma IA e
 * nenhum Google de verdade na CI. A resposta é o `done` da `plan-search` (os lugares que as
 * ferramentas "acharam", pela referência, e o passeio em passos), precedido do andamento em palavras.
 * Os lugares são inventados na forma dos do Google (nenhum nome real de estabelecimento).
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Um lugar do Google inventado, com a nota, o aberto agora e o `place_id`. */
export function lugarGoogle(
  id: string,
  name: string,
  lat: number,
  lng: number,
  city: string,
  over: Partial<Place> = {},
): Place {
  return {
    id,
    name,
    lat,
    lng,
    categories: ['cafe', 'food'],
    city,
    address: `${name}, ${city} - SC, Brasil`,
    opening_hours: 'segunda-feira: 08:00 – 19:00 · terça-feira: 08:00 – 19:00',
    website: null,
    cuisine: null,
    osm: null,
    distance_m: null,
    provider: 'google',
    google_place_id: id,
    rating: 4.6,
    user_rating_count: 212,
    open_now: true,
    business_status: 'operational',
    maps_url: null,
    hours: [
      { day: 1, open: '08:00', close: '19:00' },
      { day: 2, open: '08:00', close: '19:00' },
    ],
    ...over,
  };
}

/** Os lugares achados com as referências p1, p2… na ordem dada. */
export function achados(places: readonly Place[]): FoundPlace[] {
  return places.map((place, i) => ({ ref: `p${String(i + 1)}`, place }));
}

/** Um passo do passeio, com o que não se disse no padrão. */
export function passo(
  ordem: number,
  o_que: string,
  candidatos: string[],
  over: Partial<PlanStep> = {},
): PlanStep {
  return {
    ordem,
    o_que,
    relacao: 'na_cidade',
    cidade: 'Canoinhas',
    hora_do_dia: '',
    candidatos,
    achou: candidatos.length > 0,
    fora_da_cidade: false,
    ...over,
  };
}

/** O passeio entregue: os passos e, quando houver, os pendentes, as perguntas, o destino e a origem. */
export function passeio(passos: PlanStep[], over: Partial<Outing> = {}): Outing {
  return { passos, pendentes: [], perguntas: [], destino: '', origem: '', ...over };
}

/** O resultado inteiro de uma rodada, como o `done` o leva. */
export function rodada(lugares: FoundPlace[], outing: Outing): PlanSearchResult {
  return {
    lugares,
    passeio: outing,
    numeros: {
      turnos: 2,
      chamadas: outing.passos.length,
      buscas: outing.passos.length,
      lugares: lugares.length,
      fonte: lugares.length > 0 ? 'google' : 'none',
      fim: 'delivered',
    },
  };
}

/** O SSE da `plan-search`: o `start`, o andamento em palavras e o `done`. */
export function planejadorSse(result: PlanSearchResult): string {
  return [
    encodeEvent({
      type: 'start',
      id: 'c0ffee00-0000-4000-8000-000000000027',
      model: 'claude-sonnet-5-5',
    }),
    encodeEvent({ type: 'delta', text: 'Procurando lugares…' }),
    encodeEvent({ type: 'delta', text: 'Lugares encontrados; seguindo…' }),
    encodeEvent({
      type: 'done',
      data: result,
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 4_600, output_tokens: 550 },
    }),
  ].join('');
}

/**
 * A `plan-search` respondida: cada pedido vai para `answer` (que pode olhar as perguntas e as
 * respostas da rodada), e os pedidos ficam guardados para o teste conferir o que foi para a IA.
 */
export async function planejador(
  target: Page | BrowserContext,
  answer: (body: PlanSearchRequest) => PlanSearchResult,
): Promise<{ pedidos: PlanSearchRequest[] }> {
  const pedidos: PlanSearchRequest[] = [];
  await target.route('**/functions/v1/plan-search', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as PlanSearchRequest;
    pedidos.push(body);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', ...CORS },
      body: planejadorSse(answer(body)),
    });
  });
  return { pedidos };
}
