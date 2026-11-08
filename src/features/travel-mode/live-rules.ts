import type { Stop } from '@/lib/db/schema.ts';
import {
  ARRIVAL_RADIUS_M,
  arrivalAt,
  DEPARTURE_RADIUS_M,
  hasDeparted,
  isWithin,
  type Fix,
} from '@/lib/geo/geofence.ts';
import { isAutoStop } from '@/features/itinerary/rules.ts';
import { isDepartureNode, type DayState } from './rules.ts';

/**
 * As decisões do acompanhamento da posição, puras (as regras da D47, antes do modo painel): quando
 * acompanhar, e a cada leitura de GPS o que marcar sozinho e quanto GPS gastar. Partiu! só depois
 * de ter visto o carro na parada (uma leitura dentro do raio): um GPS que começa longe não "sai"
 * de lugar nenhum. Chegamos! pela presença de 3 min no raio. Parado por 10 min, leituras de baixa
 * precisão a cada 60 s.
 */
export const FIX_BUFFER_MS = 15 * 60_000;
export const STATIONARY_MS = 10 * 60_000;
export const STATIONARY_RADIUS_M = 100;
export const LOW_POWER_INTERVAL_MS = 60_000;

/**
 * O acompanhamento existe enquanto o mapa está na tela (fase 14): a tela visível, o dia mostrado
 * sendo hoje, a viagem em andamento e a posição permitida pela pessoa (a pergunta do app, D48). Fora
 * disso, nada acompanha: o sistema apaga a tela e corta o GPS, e está tudo bem.
 */
export function liveEnabled(input: {
  visible: boolean;
  isToday: boolean;
  ongoing: boolean;
  consent: boolean;
}): boolean {
  return input.visible && input.isToday && input.ongoing && input.consent;
}

type Located = Stop & { lat: number; lng: number };
function located(stop: Stop | null): stop is Located {
  return stop?.lat != null && stop.lng !== null;
}

/** Guarda só os últimos 15 min de leituras, em ordem. */
export function pushFix(fixes: readonly Fix[], fix: Fix): Fix[] {
  return [...fixes, fix].filter((f) => fix.t - f.t <= FIX_BUFFER_MS).sort((a, b) => a.t - b.t);
}

export type LiveDecision = {
  /** o carro saiu de `at` (ou do nó de saída que era a próxima) */
  autoDepart: boolean;
  /** o carro está há 3 min na próxima */
  autoArrive: boolean;
  /** parado há 10 min: trocar para leituras de baixa precisão a cada 60 s */
  lowPower: boolean;
};

/** A parada de onde se sai: `at` parado, ou o nó de saída quando ainda não há `at`. */
export function departureStop(state: Pick<DayState, 'at' | 'next' | 'onRoad'>): Stop | null {
  if (state.at && !state.onRoad) return state.at;
  if (!state.at && state.next && isDepartureNode(state.next)) return state.next;
  return null;
}

export function liveDecision(
  fixes: readonly Fix[],
  state: Pick<DayState, 'at' | 'next' | 'onRoad'>,
  now: number,
): LiveDecision {
  const latest = fixes.at(-1);
  if (!latest) return { autoDepart: false, autoArrive: false, lowPower: false };

  const from = departureStop(state);
  const wasThere = located(from) && fixes.some((f) => isWithin(f, from, ARRIVAL_RADIUS_M));
  // a saída de uma parada que se registrou sozinha é do detector (fase 15): a primeira leitura a
  // 60 m dela, com a hora medida, e sem toast; esta regra, a 300 m, chegaria depois e repetiria
  const autoDepart = located(from) && !isAutoStop(from) && wasThere && hasDeparted(latest, from);

  const next = state.next;
  const autoArrive = located(next) && !isDepartureNode(next) && arrivalAt(fixes, next) !== null;

  const recent = fixes.filter((f) => now - f.t <= STATIONARY_MS);
  const oldest = recent[0];
  const lowPower =
    oldest !== undefined &&
    now - oldest.t >= STATIONARY_MS - 1000 &&
    recent.every((f) => isWithin(f, latest, STATIONARY_RADIUS_M));

  return { autoDepart, autoArrive, lowPower };
}

export { DEPARTURE_RADIUS_M };
