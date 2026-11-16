import type { BrowserContext, Page, Route } from '@playwright/test';
import type { Place, PlacesRequest } from '../../supabase/functions/_shared/places-schema.ts';
import { forgedRouteDay } from '../../src/features/lab/forged-stop.ts';

/**
 * A busca no mapa e a rota da conversa nova (fase 24), respondidas no navegador como a `plan-trip`
 * (nenhuma chamada de verdade na CI: nem a Geoapify, nem a `route-day`). Os lugares são inventados
 * para o teste, com nomes de lugares públicos.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export function lugar(
  id: string,
  name: string,
  lat: number,
  lng: number,
  categories: string[],
  city = 'Pomerode',
  opening_hours: string | null = null,
): Place {
  return {
    id,
    name,
    lat,
    lng,
    categories,
    city,
    address: `${name}, ${city} - SC, Brasil`,
    opening_hours,
    website: null,
    osm: { type: 'node', id: 1 },
    distance_m: null,
  };
}

export type PlacesAnswer = Place[] | { status: number; code: string };

/** A `find-places` respondida: cada pedido vai para `answer`, e os pedidos ficam guardados. */
export async function buscaNoMapa(
  target: Page | BrowserContext,
  answer: (body: PlacesRequest) => PlacesAnswer,
): Promise<{ pedidos: PlacesRequest[] }> {
  const pedidos: PlacesRequest[] = [];
  await target.route('**/functions/v1/find-places', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as PlacesRequest;
    pedidos.push(body);
    const out = answer(body);
    if (Array.isArray(out)) {
      await route.fulfill({
        json: { provider: 'geoapify', fetched_at: new Date().toISOString(), places: out },
        headers: CORS,
      });
      return;
    }
    await route.fulfill({
      status: out.status,
      json: { error: { code: out.code, message: 'A busca no mapa ainda não está ligada.' } },
      headers: CORS,
    });
  });
  return { pedidos };
}

/** A `route-day` respondida com a estrada forjada (uma reta entre os pontos, um trecho por par). */
export async function rotaForjada(target: Page | BrowserContext): Promise<{ pedidos: number }> {
  const box = { pedidos: 0 };
  await target.route('**/functions/v1/route-day', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    box.pedidos += 1;
    const body = route.request().postDataJSON() as { waypoints: [number, number][] };
    await route.fulfill({ json: forgedRouteDay(body.waypoints), headers: CORS });
  });
  return box;
}
