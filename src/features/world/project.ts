import type { WorldLayout } from './layout.ts';
import { projectPoint, type CameraFrame } from './math.ts';

/**
 * Onde cada pílula fica na tela, em px do canvas, para um enquadramento. O HUD recalcula isto a
 * cada quadro em movimento, pelo laço da cena, sem redesenhar o React; parado, nada muda. A pílula
 * fica um pouco acima do anel do nó (`lift`, em unidades da cena). No repouso (fase 22) todas as
 * pílulas estão em cena por construção: a câmera de repouso enquadra as âncoras com as mesmas folgas
 * daqui; no modo de perto e no mergulho só as em cena aparecem.
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

/** a faixa de cima do palco (o clima, "Rever o dia"), em px */
export const HUD_TOP = 44;
/** a barra do "Agora" quando ainda não foi medida, em px */
export const HUD_BOTTOM = 72;

/**
 * A pílula inteira cabe na tela: a âncora é a base dela, e a pílula sobe uns 40 px a partir daí
 * (`height`), então a base fica abaixo da faixa de cima mais isso; acima do que cobre o pé do palco
 * com uma folga (`bottomGap`), nunca menos que `bottomMin`; e com folga lateral (`side`).
 */
export const PILL_SAFE = { side: 24, height: 40, bottomGap: 8, bottomMin: 24 } as const;

export type Viewport = { width: number; height: number };

/** A âncora de uma pílula (em px do palco) está em cena com a pílula inteira? */
export function pillInView(
  p: { x: number; y: number; depth: number },
  viewport: Viewport,
  bottomInset: number,
  hudTop = HUD_TOP,
): boolean {
  const bottom = Math.max(PILL_SAFE.bottomMin, bottomInset + PILL_SAFE.bottomGap);
  return (
    p.depth > 0 &&
    p.x >= PILL_SAFE.side &&
    p.x <= viewport.width - PILL_SAFE.side &&
    p.y >= hudTop + PILL_SAFE.height &&
    p.y <= viewport.height - bottom
  );
}

export function projectNodes(
  layout: Pick<WorldLayout, 'nodes'>,
  viewport: Viewport,
  frame: CameraFrame,
  lift = PILL_LIFT,
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
  viewport: Viewport,
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

// ------------------------------------------------------------------ os nomes das cidades
/** Um nome de cidade de passagem na tela: o centro, o tamanho e a população (quem fica). */
export type PlaceLabel = { index: number; x: number; y: number; w: number; h: number; pop: number };
export type PlacedLabel = { index: number; y: number; hidden: boolean };

/** o tamanho de um nome em maiúsculas pequenas espaçadas (12 px, 0,18em), sem medir o DOM */
export const LABEL_CHAR_PX = 9.4;
export const LABEL_HEIGHT_PX = 16;
/** a folga entre dois nomes, e quanto o nome de baixo desce para sair da frente */
const LABEL_GAP_PX = 4;

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) =>
  Math.abs(a.x - b.x) * 2 < a.w + b.w + LABEL_GAP_PX &&
  Math.abs(a.y - b.y) * 2 < a.h + b.h + LABEL_GAP_PX;

/**
 * Os nomes das cidades de passagem sem um por cima do outro (fase 24: "JARAGUÁ DO SUL" sobre "SÃO
 * BENTO DO SUL" no teste de 15/11). A cidade maior fica onde está; a menor que a cruza desce uma
 * linha e, se ainda cruzar alguma, some. Puro: o HUD só aplica.
 */
export function declutterLabels(labels: readonly PlaceLabel[]): PlacedLabel[] {
  const kept: { x: number; y: number; w: number; h: number }[] = [];
  const out = new Map<number, PlacedLabel>();
  for (const label of [...labels].sort((a, b) => b.pop - a.pop)) {
    const at = { x: label.x, y: label.y, w: label.w, h: label.h };
    const lower = { ...at, y: label.y + label.h + LABEL_GAP_PX };
    const free = (box: typeof at) => !kept.some((k) => overlaps(k, box));
    if (free(at)) {
      kept.push(at);
      out.set(label.index, { index: label.index, y: at.y, hidden: false });
    } else if (free(lower)) {
      kept.push(lower);
      out.set(label.index, { index: label.index, y: lower.y, hidden: false });
    } else {
      out.set(label.index, { index: label.index, y: label.y, hidden: true });
    }
  }
  return labels.map((l) => out.get(l.index) ?? { index: l.index, y: l.y, hidden: true });
}
