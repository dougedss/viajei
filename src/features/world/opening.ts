import type { WorldLayout } from './layout.ts';

/**
 * A abertura do dia, como dados: a linha do tempo de cada passo (relevo, estrada, pinos, carro,
 * "Agora") e o instante em que cada pino cai. Uma vez por dia e aparelho; com reduzir movimento,
 * um quadro só. A cena e o HUD leem o plano; nada aqui anima.
 */
export type OpeningStep = 'terrain' | 'road' | 'pins' | 'car' | 'agora';

export type OpeningPlan = {
  total_ms: number;
  steps: { step: OpeningStep; from_ms: number; to_ms: number }[];
  pins: { stop_id: string; at_ms: number }[];
  /** onde o carro estaciona: o primeiro nó */
  park_s: number;
  /** de onde o carro entra: o começo da estrada, antes do primeiro nó */
  enter_s: number;
};

export const OPENING_TIMELINE: Record<OpeningStep, [number, number]> = {
  terrain: [0, 600],
  road: [600, 1200],
  pins: [1200, 1800],
  car: [1800, 2400],
  agora: [2400, 2400],
};
export const OPENING_TOTAL_MS = 2400;

export const openedKey = (dayId: string): string => `world:opened:${dayId}`;

export function planOpening(layout: WorldLayout, reducedMotion: boolean): OpeningPlan {
  const first = layout.nodes[0];
  const park_s = first?.s ?? 0;
  const n = Math.max(1, layout.nodes.length);
  if (reducedMotion) {
    return {
      total_ms: 0,
      steps: (Object.keys(OPENING_TIMELINE) as OpeningStep[]).map((step) => ({
        step,
        from_ms: 0,
        to_ms: 0,
      })),
      pins: layout.nodes.map((node) => ({ stop_id: node.stop_id, at_ms: 0 })),
      park_s,
      enter_s: park_s,
    };
  }
  const [pinsFrom, pinsTo] = OPENING_TIMELINE.pins;
  return {
    total_ms: OPENING_TOTAL_MS,
    steps: (Object.keys(OPENING_TIMELINE) as OpeningStep[]).map((step) => {
      const [from_ms, to_ms] = OPENING_TIMELINE[step];
      return { step, from_ms, to_ms };
    }),
    pins: layout.nodes.map((node, i) => ({
      stop_id: node.stop_id,
      at_ms: Math.round(pinsFrom + ((pinsTo - pinsFrom) * i) / n),
    })),
    park_s,
    enter_s: 0,
  };
}

/** Progresso (0 a 1) de um passo num instante da abertura. */
export function stepProgress(plan: OpeningPlan, step: OpeningStep, elapsed_ms: number): number {
  const entry = plan.steps.find((s) => s.step === step);
  if (!entry || entry.to_ms <= entry.from_ms) return elapsed_ms >= (entry?.from_ms ?? 0) ? 1 : 0;
  return Math.max(0, Math.min(1, (elapsed_ms - entry.from_ms) / (entry.to_ms - entry.from_ms)));
}
