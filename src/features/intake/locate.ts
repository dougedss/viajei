// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import { haversineM, type LngLat } from '../../../supabase/functions/_shared/geo.ts';
import { MAX_CHOICES, SAME_PLACE_M, type SearchResult } from './named.ts';
import { driveMinutes, MAX_RADIUS_KM } from './search.ts';

/**
 * A cidade conferida (fase 25, D276): o que o geocodificador devolve para "Mafra" ou "Joinville" é
 * conferido pela distância ao ponto de referência (a posição, ou a origem resolvida) antes de valer.
 * Plausível é o que está ao alcance máximo das opções (a D228, 400 km); um resultado em outro país ou
 * além disso **nunca é usado em silêncio**: sem nenhum plausível, a tela pergunta com os candidatos e
 * a distância ("Mafra, Portugal · a cerca de 146 h"). Com mais de um plausível a mais de 2 km um do
 * outro, a escolha na tela, nunca o chute (o molde da D229). `countrycodes=br` não entra: o Uruguai é
 * viagem legítima; o país é sinal de dúvida, não restrição. Puro.
 */
export type PlaceHit = SearchResult & {
  /** a distância ao ponto de referência, em km, e o tempo de carro estimado; null sem referência */
  km: number | null;
  minutes: number | null;
};

export type PlaceResolution =
  | { kind: 'found'; hit: PlaceHit }
  /** mais de um plausível, longe um do outro: a pessoa escolhe */
  | { kind: 'choice'; options: PlaceHit[] }
  /** nenhum plausível, mas há candidatos longe (outro país, além do alcance): a pessoa confirma */
  | { kind: 'far'; options: PlaceHit[] }
  | { kind: 'none' };

/** Até onde um lugar dito ainda é plausível a partir de onde a pessoa está: o alcance máximo da D228. */
export const PLAUSIBLE_KM = MAX_RADIUS_KM;

const at = (r: { lat: number; lng: number }): LngLat => [r.lng, r.lat];

export function resolvePlace(
  results: readonly SearchResult[],
  reference: LngLat | null,
  plausibleKm = PLAUSIBLE_KM,
): PlaceResolution {
  const hits: PlaceHit[] = results.map((r) => {
    const km = reference ? haversineM(reference, at(r)) / 1000 : null;
    return { ...r, km, minutes: km === null ? null : driveMinutes(km) };
  });
  if (hits.length === 0) return { kind: 'none' };
  const byDistance = [...hits].sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  const plausible = reference ? byDistance.filter((h) => (h.km ?? 0) <= plausibleKm) : byDistance;
  if (plausible.length === 0) return { kind: 'far', options: byDistance.slice(0, MAX_CHOICES) };
  // dois resultados a menos de 2 km um do outro são o mesmo lugar (a cidade e o município dela)
  const distinct = plausible.filter(
    (h, i) => !plausible.slice(0, i).some((o) => haversineM(at(o), at(h)) <= SAME_PLACE_M),
  );
  const first = distinct[0];
  if (!first) return { kind: 'none' };
  return distinct.length === 1
    ? { kind: 'found', hit: first }
    : { kind: 'choice', options: distinct.slice(0, MAX_CHOICES) };
}

/** A pergunta da cidade na tela: o que foi dito, o papel dela, os candidatos e se estão todos longe. */
export type PlaceQuestion = {
  said: string;
  role: 'origin' | 'area';
  options: PlaceHit[];
  far: boolean;
};

/** A chave de uma escolha guardada na conversa: o que foi dito, sem acento nem caixa. */
export const placeKey = (said: string): string =>
  said
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
