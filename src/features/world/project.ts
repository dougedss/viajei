import type { WorldLayout } from './layout.ts';
import { projectPoint } from './math.ts';

/**
 * Onde cada pílula fica na tela, em px do canvas, calculado uma vez por layout e por tamanho de
 * tela: com a câmera parada, nada disto muda a cada quadro. A pílula fica um pouco acima do anel
 * do nó (`lift`, em unidades da cena).
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
  layout: WorldLayout,
  viewport: { width: number; height: number },
  lift = PILL_LIFT,
): ProjectedNode[] {
  const aspect = viewport.width / Math.max(1, viewport.height);
  return layout.nodes.map((node) => {
    const [x, y, z] = node.position;
    const p = projectPoint(layout.camera, aspect, [x, y + lift, z]);
    const visible = p.depth > 0 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.2;
    return {
      stop_id: node.stop_id,
      x: ((p.x + 1) / 2) * viewport.width,
      y: ((1 - p.y) / 2) * viewport.height,
      visible,
    };
  });
}

/** Qualquer ponto do mundo em px do canvas (o carro, uma curiosidade). */
export function projectWorld(
  layout: WorldLayout,
  viewport: { width: number; height: number },
  point: [number, number, number],
): { x: number; y: number; visible: boolean } {
  const aspect = viewport.width / Math.max(1, viewport.height);
  const p = projectPoint(layout.camera, aspect, point);
  return {
    x: ((p.x + 1) / 2) * viewport.width,
    y: ((1 - p.y) / 2) * viewport.height,
    visible: p.depth > 0 && Math.abs(p.x) <= 1.1 && Math.abs(p.y) <= 1.2,
  };
}
