import type { CarModel } from '@shared/constants.ts';

/**
 * O contrato de todo carro por código: um perfil lateral 2D com as rodas, os vidros, as luzes e as
 * âncoras onde os acessórios encaixam. O mesmo perfil vira o carro 3D (`build.ts` extruda o
 * contorno) e a vista lateral em SVG (`CarSide`), então a silhueta do card nunca diverge da cena.
 * Dados puros, sem three: este arquivo entra no chunk principal.
 *
 * Eixos do perfil, em unidades da cena (o hatch é a régua, cerca de 0,9 m por unidade): x para o
 * nariz, y para cima a partir do chão, z para o lado (+z é o lado que a vista lateral mostra).
 * Toda medida de contorno é do contorno cru; o chanfro (`bevel`) cresce para fora dele.
 */
export type Pt = readonly [x: number, y: number];

export type PathCmd =
  | { op: 'M'; to: Pt }
  | { op: 'L'; to: Pt }
  | { op: 'Q'; c: Pt; to: Pt }
  /** arco anti-horário de `from` a `to` (radianos), só nos arcos das rodas que `outline` gera */
  | { op: 'A'; center: Pt; r: number; from: number; to: number };

export type CarLights = {
  /** centro do farol no contorno da frente; espelhado em ±`spread` */
  head: Pt;
  headSize: readonly [h: number, w: number];
  headRound: boolean;
  tail: Pt;
  tailSize: readonly [h: number, w: number];
  headSpread: number;
  tailSpread: number;
};

export type CarAnchors = {
  /** o trilho do teto: altura da superfície, extensão e o z de cada faixa, da mais próxima à mais distante */
  roof: { y: number; x0: number; x1: number; lanes: readonly number[] };
  /** faróis de milha, no para-choque da frente, espelhados em ±`spread` */
  frontBumper: { at: Pt; spread: number };
  rearPlate: Pt;
  /** base da antena com bandeirinha */
  antenna: readonly [x: number, y: number, z: number];
  /** os três espaços de adesivo, iguais nos dois lados */
  stickers: readonly [StickerSpot, StickerSpot, StickerSpot];
};

export type StickerSpot = { at: Pt; size: number };

export type CarProfile = {
  model: CarModel;
  /** o contorno de cima, da traseira na soleira ao nariz na soleira; a borda de baixo é gerada */
  top: readonly PathCmd[];
  /** y da soleira entre as rodas, onde os arcos são recortados */
  sill: number;
  /** largura total da carroceria, com o chanfro */
  width: number;
  bevel: number;
  wheels: {
    radius: number;
    /** largura do pneu */
    tire: number;
    front: number;
    rear: number;
    /** distância entre os centros dos pneus de um eixo */
    track: number;
    /** folga entre o pneu e o arco */
    archGap: number;
    /** espessura do para-lama marcado em volta do arco; 0 sem */
    flare: number;
  };
  glass: {
    side: readonly (readonly Pt[])[];
    windshield: { from: Pt; to: Pt; split: boolean };
    rear: { from: Pt; to: Pt } | null;
  };
  lights: CarLights;
  /** grade da frente, no contorno; a kombi não tem (motor atrás) */
  grille: { at: Pt; size: readonly [h: number, w: number] } | null;
  mirror: Pt;
  handles: readonly Pt[];
  /** caçamba aberta (picape): do fundo à cabine; `floor` é o contorno do piso, `top` a borda das paredes */
  bed: { x0: number; x1: number; floor: number; top: number; wall: number } | null;
  /** estepe na tampa traseira (SUV) */
  spare: Pt | null;
  /** pintura saia e blusa (kombi): y da divisa e o fundo do V no nariz */
  twoTone: { split: number; vDepth: number } | null;
  anchors: CarAnchors;
};

export const moveTo = (x: number, y: number): PathCmd => ({ op: 'M', to: [x, y] });
export const lineTo = (x: number, y: number): PathCmd => ({ op: 'L', to: [x, y] });
export const quadTo = (cx: number, cy: number, x: number, y: number): PathCmd => ({
  op: 'Q',
  c: [cx, cy],
  to: [x, y],
});

/** O centro de cada roda: no chão, a um raio de altura. */
export function wheelCenters(p: CarProfile): { front: Pt; rear: Pt } {
  return { front: [p.wheels.front, p.wheels.radius], rear: [p.wheels.rear, p.wheels.radius] };
}

/** Raio do recorte do arco (pneu + folga). */
export function archRadius(p: CarProfile): number {
  return p.wheels.radius + p.wheels.archGap;
}

/** O arco de uma roda: centrado nela, cortando a linha da soleira. */
export function archOf(p: CarProfile, cx: number): Extract<PathCmd, { op: 'A' }> {
  const cy = p.wheels.radius;
  const r = archRadius(p);
  const a = Math.asin(Math.max(-1, Math.min(1, (p.sill - cy) / r)));
  return { op: 'A', center: [cx, cy], r, from: a, to: Math.PI - a };
}

function endOf(cmd: PathCmd): Pt {
  if (cmd.op === 'A') {
    return [cmd.center[0] + cmd.r * Math.cos(cmd.to), cmd.center[1] + cmd.r * Math.sin(cmd.to)];
  }
  return cmd.to;
}

function startOfArc(cmd: Extract<PathCmd, { op: 'A' }>): Pt {
  return [cmd.center[0] + cmd.r * Math.cos(cmd.from), cmd.center[1] + cmd.r * Math.sin(cmd.from)];
}

/**
 * O contorno fechado da carroceria: o de cima como o perfil descreve e a borda de baixo, do nariz à
 * traseira, com os dois arcos centrados nas rodas. É a fonte única do `Shape` do three e do `d` do
 * SVG.
 */
export function outline(p: CarProfile): PathCmd[] {
  const front = archOf(p, p.wheels.front);
  const rear = archOf(p, p.wheels.rear);
  const out: PathCmd[] = [...p.top];
  out.push({ op: 'L', to: startOfArc(front) }, front);
  out.push({ op: 'L', to: startOfArc(rear) }, rear);
  const first = p.top[0];
  if (first) out.push({ op: 'L', to: endOf(first) });
  return out;
}

/** O contorno amostrado como polígono (arcos e curvas em segmentos), para testes e medidas. */
export function samplePath(cmds: readonly PathCmd[], steps = 12): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
  for (const c of cmds) {
    if (c.op === 'M' || c.op === 'L') {
      cur = c.to;
      pts.push(cur);
    } else if (c.op === 'Q') {
      const [x0, y0] = cur;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        pts.push([
          u * u * x0 + 2 * u * t * c.c[0] + t * t * c.to[0],
          u * u * y0 + 2 * u * t * c.c[1] + t * t * c.to[1],
        ]);
      }
      cur = c.to;
    } else {
      for (let i = 0; i <= steps * 2; i++) {
        const a = c.from + ((c.to - c.from) * i) / (steps * 2);
        pts.push([c.center[0] + c.r * Math.cos(a), c.center[1] + c.r * Math.sin(a)]);
      }
      cur = endOf(c);
    }
  }
  return pts;
}

/** O `d` de um `<path>` SVG no espaço do perfil (y para cima; quem desenha vira o eixo). */
export function toSvgPath(cmds: readonly PathCmd[], close = true): string {
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  const parts: string[] = [];
  for (const c of cmds) {
    if (c.op === 'M' || c.op === 'L') parts.push(`${c.op}${f(c.to[0])} ${f(c.to[1])}`);
    else if (c.op === 'Q') parts.push(`Q${f(c.c[0])} ${f(c.c[1])} ${f(c.to[0])} ${f(c.to[1])}`);
    else {
      const [sx, sy] = startOfArc(c);
      const [ex, ey] = endOf(c);
      const large = c.to - c.from > Math.PI ? 1 : 0;
      // `sweep=1` é o sentido de ângulo crescente no espaço do próprio path (de +x para +y), que é o
      // anti-horário do perfil; quem desenha vira o eixo y depois, com scale(1 -1)
      parts.push(`L${f(sx)} ${f(sy)}A${f(c.r)} ${f(c.r)} 0 ${large} 1 ${f(ex)} ${f(ey)}`);
    }
  }
  return parts.join('') + (close ? 'Z' : '');
}

/** O d de um polígono simples (vidros). */
export function polygonPath(pts: readonly Pt[]): string {
  return toSvgPath(pts.map((to, i): PathCmd => (i === 0 ? { op: 'M', to } : { op: 'L', to })));
}

/** Ponto dentro de polígono (par-ímpar). */
export function insidePolygon(pt: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    if (!pi || !pj) continue;
    if (
      pi[1] > pt[1] !== pj[1] > pt[1] &&
      pt[0] < ((pj[0] - pi[0]) * (pt[1] - pi[1])) / (pj[1] - pi[1]) + pi[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/** A caixa do contorno com o chanfro: comprimento, altura e vão livre de verdade. */
export function bodyBounds(p: CarProfile): Bounds {
  const pts = samplePath(outline(p));
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    minX: minX - p.bevel,
    maxX: maxX + p.bevel,
    minY: p.sill - p.bevel,
    maxY: maxY + p.bevel,
  };
}

/** As medidas que o plano e a documentação citam: comprimento, altura, vão, entre-eixos. */
export function dimensions(p: CarProfile): {
  length: number;
  height: number;
  clearance: number;
  wheelbase: number;
  roofLength: number;
} {
  const b = bodyBounds(p);
  return {
    length: b.maxX - b.minX,
    height: b.maxY,
    clearance: b.minY,
    wheelbase: p.wheels.front - p.wheels.rear,
    roofLength: p.anchors.roof.x1 - p.anchors.roof.x0,
  };
}
