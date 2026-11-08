import type { WorldLayout } from './layout.ts';
import { projectPoint, type CameraFrame } from './math.ts';

/**
 * Onde cada pílula fica na tela, em px do canvas, para um enquadramento. Com a câmera que segue o
 * carro (fase 14) o HUD recalcula isto a cada quadro em movimento, pelo laço da cena, sem
 * redesenhar o React; parado, nada muda. A pílula fica um pouco acima do anel do nó (`lift`, em
 * unidades da cena).
 */
export type ProjectedNode = {
  stop_id: string;
  /** px a partir da borda esquerda do canvas */
  x: number;
  /** px a partir do topo do canvas */
  y: number;
  visible: boolean;
};

export const PILL_LIFT = 2.6;

export function projectNodes(
  layout: Pick<WorldLayout, 'nodes' | 'camera'>,
  viewport: { width: number; height: number },
  lift = PILL_LIFT,
  frame: CameraFrame = layout.camera,
): ProjectedNode[] {
  return layout.nodes.map((node) => {
    const [x, y, z] = node.position;
    const p = projectWorld(frame, viewport, [x, y + lift, z]);
    return { stop_id: node.stop_id, x: p.x, y: p.y, visible: p.visible };
  });
}

/** Qualquer ponto do mundo em px do canvas (o carro, uma curiosidade), para um enquadramento. */
export function projectWorld(
  frame: CameraFrame,
  viewport: { width: number; height: number },
  point: [number, number, number],
): { x: number; y: number; visible: boolean; depth: number } {
  const aspect = viewport.width / Math.max(1, viewport.height);
  const p = projectPoint(frame, aspect, point);
  return {
    x: ((p.x + 1) / 2) * viewport.width,
    y: ((1 - p.y) / 2) * viewport.height,
    visible: p.depth > 0 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.2,
    depth: p.depth,
  };
}
