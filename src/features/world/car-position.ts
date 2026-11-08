import type { DayState } from '@/features/travel-mode/rules.ts';
import type { CatchupPosition } from '@/lib/geo/catchup.ts';
import type { LayoutNode, WorldLayout } from './layout.ts';

/**
 * Onde o carrinho fica no caminho, puro. Prioridade: a posição deste aparelho (a leitura única ao
 * abrir ou o acompanhamento com o mapa aberto, fase 14), a trilha do time, e por fim o nó da última
 * concluída. Sem posição e na estrada, o carro aparece
 * logo depois do nó de saída, nunca no meio do trecho: não se inventa posição. Fora da rota, o `s`
 * continua o projetado e a cena desloca o carro na perpendicular, com a distância no chip.
 */
export type CarSource = 'gps' | 'team-track' | 'node';

export type CarPlacement = {
  s: number;
  offRoute: { distance_m: number } | null;
  source: CarSource;
  /** o nó em que o carro está parado, quando está num nó */
  atNodeId: string | null;
};

export type CarPositionInput = {
  state: Pick<DayState, 'at' | 'onRoad' | 'next' | 'finished'>;
  /** do `useCatchup`; `last-done` é só o nó, então vale como "sem posição" */
  position: CatchupPosition | null;
  layout: WorldLayout;
};

/** "logo depois do nó": uma fração do caminho, nunca menos que isto em unidades da cena */
export const ROAD_STEP_FRACTION = 0.015;
export const ROAD_STEP_MIN = 2;
/** a menos disto de um nó, o carro está "no nó" */
export const AT_NODE_EPSILON = 0.5;

function nodeOf(layout: WorldLayout, stopId: string | null | undefined): LayoutNode | null {
  if (!stopId) return null;
  return layout.nodes.find((n) => n.stop_id === stopId) ?? null;
}

function nodeNear(layout: WorldLayout, s: number): LayoutNode | null {
  return layout.nodes.find((n) => Math.abs(n.s - s) <= AT_NODE_EPSILON) ?? null;
}

export function placeCar(input: CarPositionInput): CarPlacement {
  const { state, position, layout } = input;
  const first = layout.nodes[0] ?? null;
  const last = layout.nodes.at(-1) ?? null;

  if (position && position.fraction !== null && position.source !== 'last-done') {
    const s = layout.fractionToS(position.fraction);
    const source: CarSource = position.source === 'gps' ? 'gps' : 'team-track';
    const offRoute =
      position.offRoute && position.distanceM !== null
        ? { distance_m: Math.round(position.distanceM) }
        : null;
    return {
      s,
      offRoute,
      source,
      atNodeId: offRoute ? null : (nodeNear(layout, s)?.stop_id ?? null),
    };
  }

  if (state.finished && last) {
    return { s: last.s, offRoute: null, source: 'node', atNodeId: last.stop_id };
  }
  const at = nodeOf(layout, state.at?.id);
  if (!at) {
    return { s: first?.s ?? 0, offRoute: null, source: 'node', atNodeId: first?.stop_id ?? null };
  }
  if (!state.onRoad) return { s: at.s, offRoute: null, source: 'node', atNodeId: at.stop_id };
  const following = layout.nodes[at.index + 1] ?? null;
  const step = Math.max(ROAD_STEP_MIN, layout.pathLength * ROAD_STEP_FRACTION);
  const limit = following ? following.s - AT_NODE_EPSILON : layout.pathLength;
  return { s: Math.min(at.s + step, limit), offRoute: null, source: 'node', atNodeId: null };
}
