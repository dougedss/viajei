import { haversineM } from '@shared/geo.ts';
import type { GeocodeResult } from '@/lib/db/schema.ts';
import { parseMapsLink } from '@/lib/links/index.ts';
import type { Review, ReviewStop } from './plan.ts';
import type { Preview } from './preview.ts';

/**
 * A localização das paradas importadas: coordenada nunca vem da IA. Vem de um link do Maps que o
 * texto trouxe (o leitor da fase 3, sem rede) ou da busca do Nominatim (a fila de 1 por segundo com
 * cache, D31). As regras são puras; quem chama a fila é `useGeocoding`.
 */
export type GeoState =
  | { kind: 'waiting' }
  | { kind: 'searching' }
  | { kind: 'found'; lat: number; lng: number; label: string; via: 'link' | 'search' }
  | { kind: 'choice'; options: GeocodeResult[] }
  | { kind: 'none' }
  /** sem rede: a parada espera, e a busca volta quando a rede voltar */
  | { kind: 'offline' };

/** Resultados a até 2 km um do outro são o mesmo lugar (a entrada e o estacionamento do parque). */
export const SAME_PLACE_M = 2_000;
export const MAX_OPTIONS = 3;

export function classifyResults(
  results: readonly GeocodeResult[],
): Extract<GeoState, { kind: 'found' | 'choice' | 'none' }> {
  const first = results[0];
  if (!first) return { kind: 'none' };
  const together = results.every(
    (r) => haversineM([first.lng, first.lat], [r.lng, r.lat]) <= SAME_PLACE_M,
  );
  if (together) {
    return { kind: 'found', lat: first.lat, lng: first.lng, label: first.address, via: 'search' };
  }
  return { kind: 'choice', options: results.slice(0, MAX_OPTIONS) };
}

/**
 * As buscas de uma parada, em ordem: nome e endereço; só o endereço; só o nome quando não há
 * endereço. Sem repetir a mesma consulta, e sem as curtas demais para o Nominatim.
 */
export function queriesFor(stop: { name: string; address: string | null }): string[] {
  const name = stop.name.trim();
  const address = stop.address?.trim() ?? '';
  const all = address === '' ? [name] : name === '' ? [address] : [`${name}, ${address}`, address];
  const seen = new Set<string>();
  return all.filter((q) => {
    const key = q.toLocaleLowerCase('pt-BR');
    if (q.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Um link do Maps no texto resolve sem rede. */
export function fromLink(url: string | null): Extract<GeoState, { kind: 'found' }> | null {
  if (!url) return null;
  const coords = parseMapsLink(url);
  return coords
    ? { kind: 'found', ...coords, label: 'Marcada pelo link do Maps', via: 'link' }
    : null;
}

export type GeoTarget = { key: string; name: string; address: string | null; url: string | null };

/**
 * A busca de uma parada: a primeira consulta que acha alguma coisa decide (um lugar ou uma
 * escolha); nenhuma achou, a parada fica sem coordenada, como uma parada manual pode ficar.
 */
export async function locate(
  stop: Omit<GeoTarget, 'key'>,
  search: (query: string) => Promise<GeocodeResult[]>,
): Promise<Extract<GeoState, { kind: 'found' | 'choice' | 'none' }>> {
  const link = fromLink(stop.url);
  if (link) return link;
  for (const query of queriesFor(stop)) {
    const state = classifyResults(await search(query));
    if (state.kind !== 'none') return state;
  }
  return { kind: 'none' };
}

/**
 * Enquanto o JSON chega, as paradas que já fecharam (o nome não muda mais) entram na fila: quando a
 * revisão abre, boa parte já está no lugar. A chave é a mesma da revisão (`d<dia>s<parada>`).
 */
export function previewTargets(preview: Preview): GeoTarget[] {
  return preview.days.flatMap((day, di) =>
    day.stops.flatMap((s, si) =>
      s.complete && s.name.trim() !== ''
        ? [{ key: `d${di}s${si}`, name: s.name, address: s.address, url: s.url }]
        : [],
    ),
  );
}

/** As paradas da revisão que ainda esperam um lugar: mantidas, sem coordenada e sem decisão. */
export function geoTargets(review: Pick<Review, 'days'>): GeoTarget[] {
  return review.days.flatMap((day) =>
    day.include
      ? day.stops
          .filter((s) => s.include && s.lat === null && s.geo === null)
          .map((s) => ({ key: s.key, name: s.name, address: s.address, url: s.url }))
      : [],
  );
}

/**
 * A revisão com o que a busca já achou. Puro e sem gravar: o que a fila acha automaticamente se
 * refaz do cache depois de recarregar; só a decisão da pessoa (escolher, "nenhum destes", editar)
 * fica guardada na própria parada da revisão.
 */
export function applyGeo(review: Review, states: Readonly<Record<string, GeoState>>): Review {
  const located = (s: ReviewStop): ReviewStop => {
    if (s.lat !== null || s.geo !== null || !Object.hasOwn(states, s.key)) return s;
    const state = states[s.key];
    if (state?.kind !== 'found') return s;
    return {
      ...s,
      lat: state.lat,
      lng: state.lng,
      geo: { status: 'found', label: state.label, via: state.via },
    };
  };
  const days = review.days.map((day) => {
    const stops = day.stops.map(located);
    return stops.some((s, i) => s !== day.stops[i]) ? { ...day, stops } : day;
  });
  return days.some((d, i) => d !== review.days[i]) ? { ...review, days } : review;
}

/** O progresso da busca, para "Localizando… 3 de 18". */
export function geoProgress(
  targets: readonly GeoTarget[],
  states: Readonly<Record<string, GeoState>>,
): { done: number; total: number; offline: boolean } {
  let done = 0;
  let offline = false;
  for (const t of targets) {
    const state = Object.hasOwn(states, t.key) ? states[t.key] : undefined;
    if (state?.kind === 'offline') offline = true;
    else if (state && state.kind !== 'waiting' && state.kind !== 'searching') done += 1;
  }
  return { done, total: targets.length, offline };
}
