import type { BrowserContext, Page, Route } from '@playwright/test';
import type { DriveRequest } from '../../supabase/functions/_shared/drive-schema.ts';
import type { FindPlacesRequest, Place } from '../../supabase/functions/_shared/places-schema.ts';
import { forgedDriveTimes, forgedRouteDay } from '../../src/features/lab/forged-stop.ts';

/**
 * A busca no mapa, a rota e o tempo de carro da conversa nova (fase 24; o tempo medido desde a D310),
 * respondidos no navegador como a `plan-trip` (nenhuma chamada de verdade na CI: nem a Geoapify, nem o
 * Google, nem a `route-day`). Os lugares são inventados para o teste, com nomes de lugares públicos.
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

/**
 * A `drive-times` respondida (D310): o tempo de carro de cada par pela estrada reta forjada (a mesma
 * conta da `rotaForjada`), ou o erro que `answer` devolver (a medição que não respondeu). Os pedidos
 * ficam guardados. Quem chama `buscaNoMapa` já a tem; chamar de novo, depois, troca a resposta.
 */
export async function tempoDeCarro(
  target: Page | BrowserContext,
  answer?: (body: DriveRequest) => { status: number; code: string } | null,
): Promise<{ pedidos: DriveRequest[] }> {
  const pedidos: DriveRequest[] = [];
  await target.route('**/functions/v1/drive-times', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as DriveRequest;
    pedidos.push(body);
    const refused = answer?.(body) ?? null;
    if (refused) {
      await route.fulfill({
        status: refused.status,
        json: { error: { code: refused.code, message: 'Não deu para medir o tempo de carro.' } },
        headers: CORS,
      });
      return;
    }
    await route.fulfill({ json: forgedDriveTimes(body.pairs), headers: CORS });
  });
  return { pedidos };
}

/**
 * A `find-places` respondida: cada pedido vai para `answer` (a busca por tipo da Geoapify, ou a por
 * texto no Google desde a fase 27: `'provider' in body`), e os pedidos ficam guardados. O tempo de
 * carro das opções (`drive-times`) também fica respondido, pela estrada forjada.
 */
export async function buscaNoMapa(
  target: Page | BrowserContext,
  answer: (body: FindPlacesRequest) => PlacesAnswer,
): Promise<{ pedidos: FindPlacesRequest[] }> {
  await tempoDeCarro(target);
  const pedidos: FindPlacesRequest[] = [];
  await target.route('**/functions/v1/find-places', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as FindPlacesRequest;
    pedidos.push(body);
    const out = answer(body);
    if (Array.isArray(out)) {
      await route.fulfill({
        json: {
          provider: 'provider' in body ? 'google' : 'geoapify',
          fetched_at: new Date().toISOString(),
          places: out,
        },
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
