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
  /** mais de um plausível, longe um do outro e nenhum mais importante: a pessoa escolhe */
  | { kind: 'choice'; options: PlaceHit[] }
  /** nenhum plausível, mas há candidatos longe (outro país, além do alcance): a pessoa confirma */
  | { kind: 'far'; options: PlaceHit[] }
  /**
   * nenhuma cidade com esse nome no mapa ("Serra Gaúcha" são postos de gasolina; "perto de papanduva"
   * não volta nada): a pessoa diz qual é a cidade (D283), nunca o app segue sem ela em silêncio
   */
  | { kind: 'unknown' };

/** Até onde um lugar dito ainda é plausível a partir de onde a pessoa está: o alcance máximo da D228. */
export const PLAUSIBLE_KM = MAX_RADIUS_KM;
/**
 * Dois resultados de cidade com o mesmo nome a menos disto são o mesmo município: a sede (`place`) e o
 * contorno (`boundary`), cujo centro pode ficar a dezenas de km dela (a medição de 21/11, D282).
 */
export const SAME_CITY_KM = 50;
/**
 * Entre dois candidatos plausíveis, o mais importante vale sozinho quando tem pelo menos isto vezes a
 * importância do outro: o município de Papanduva diante das localidades de mesmo nome em Presidente
 * Getúlio e em Campo Alegre (a medição de 21/11, D283). Mafra/SC e Mafra/Lisboa (0,49 e 0,49) e as
 * duas Joinville (0,55 e 0,56) ficam em dúvida, e a tela pergunta.
 */
export const DOMINANCE = 2;

const at = (r: { lat: number; lng: number }): LngLat => [r.lng, r.lat];
const plainName = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
/** O resultado é uma cidade, um bairro ou um município (não uma rua, um rio, uma loja). */
const isCity = (r: SearchResult) => r.category === 'place' || r.category === 'boundary';

/**
 * O mesmo lugar dito por dois resultados: a menos de 2 km um do outro (a entrada e o estacionamento),
 * ou duas cidades com o mesmo nome a menos de `SAME_CITY_KM` (a sede e o contorno do município).
 */
function sameAs(a: SearchResult, b: SearchResult): boolean {
  const m = haversineM(at(a), at(b));
  if (m <= SAME_PLACE_M) return true;
  return (
    isCity(a) && isCity(b) && plainName(a.name) === plainName(b.name) && m <= SAME_CITY_KM * 1000
  );
}

export function resolvePlace(
  results: readonly SearchResult[],
  reference: LngLat | null,
  plausibleKm = PLAUSIBLE_KM,
): PlaceResolution {
  // quem diz de onde sai ou para onde vai diz uma cidade: as ruas, os rios, as lojas e os postos com o
  // mesmo nome não contam (D282); sem nenhuma cidade, a pessoa diz qual é (D283)
  const hits: PlaceHit[] = results.filter(isCity).map((r) => {
    const km = reference ? haversineM(reference, at(r)) / 1000 : null;
    return { ...r, km, minutes: km === null ? null : driveMinutes(km) };
  });
  if (hits.length === 0) return { kind: 'unknown' };
  const byDistance = [...hits].sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  const plausible = reference ? byDistance.filter((h) => (h.km ?? 0) <= plausibleKm) : byDistance;
  if (plausible.length === 0) return { kind: 'far', options: byDistance.slice(0, MAX_CHOICES) };
  // o mesmo lugar dito duas vezes fica uma: a sede da cidade no lugar do contorno, quando há as duas
  const distinct: PlaceHit[] = [];
  for (const h of plausible) {
    const i = distinct.findIndex((o) => sameAs(o, h));
    if (i < 0) distinct.push(h);
    else if (distinct[i]?.category === 'boundary' && h.category === 'place') distinct[i] = h;
  }
  const first = distinct[0];
  if (!first) return { kind: 'unknown' };
  if (distinct.length === 1) return { kind: 'found', hit: first };
  // o homônimo pequeno não vira dúvida: o mais importante, com folga, é o que a pessoa disse (D283)
  const [top, second] = [...distinct].sort((a, b) => (b.importance ?? -1) - (a.importance ?? -1));
  if (
    top?.importance !== undefined &&
    second?.importance !== undefined &&
    top.importance >= DOMINANCE * second.importance
  ) {
    return { kind: 'found', hit: top };
  }
  return { kind: 'choice', options: distinct.slice(0, MAX_CHOICES) };
}

/**
 * A pergunta da cidade na tela: o que foi dito, o papel dela (de onde sai ou para onde vai), os
 * candidatos, e por que se pergunta: mais de um (`choice`), todos longe (`far`) ou nenhuma cidade com
 * esse nome (`unknown`, sem candidatos: a pessoa escreve a cidade).
 */
export type PlaceQuestion = {
  said: string;
  role: 'origin' | 'area';
  options: PlaceHit[];
  kind: 'choice' | 'far' | 'unknown';
};

/** A chave de uma escolha guardada na conversa: o que foi dito, sem acento nem caixa. */
export const placeKey = (said: string): string =>
  said
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
