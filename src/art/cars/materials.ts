import { CAR_COLORS, type CarColor, type CarFinish } from '@shared/constants.ts';
import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshPhysicalNodeMaterial,
  MeshStandardMaterial,
} from 'three/webgpu';
import { abs, clamp, float, mix, positionLocal, smoothstep, step, uniform } from 'three/tsl';
import type { CarProfile } from './profile.ts';
import { PAINT_TOP_HEX } from './shapes.ts';

/**
 * Os materiais dos carros. A tinta é um `MeshPhysicalNodeMaterial` cuja cor, metal, rugosidade,
 * verniz e iridescência vêm de nós TSL: no carro de uma cor só, a saia é tudo; na kombi, a altura de
 * cada ponto da carroceria escolhe entre a saia (a cor da pessoa) e a blusa (branco gelo), com o V
 * no nariz descendo para o centro. Uma malha só, divisa nítida, nos dois backends do
 * `WebGPURenderer`. O dourado pinta a kombi inteira. As trocas de cor e de acabamento interpolam os
 * mesmos uniformes: o grafo é um só para os cinco modelos e os quatro acabamentos (D73, D74).
 */

export type PaintState = {
  lower: Color;
  upper: Color;
  metal: [lower: number, upper: number];
  rough: [lower: number, upper: number];
  /** o verniz (0 a 1): a fosca não tem */
  coat: number;
  /** a película fina da perolada (0 a 1): o tom que muda com o ângulo */
  iridescence: number;
};

export type FinishParams = { metal: number; rough: number; coat: number; iridescence: number };

/**
 * O acabamento (fase 16), em números físicos. Lisa: pouco metal, o verniz dá o brilho e a cor fica
 * viva, sem virar pastel com o reflexo do estúdio (D73). Metálica: o metal alto da Névoa e do
 * Dourado de antes. Perolada: verniz, rugosidade baixa e a iridescência (a película fina que muda de
 * tom com o ângulo). Fosca: sem verniz e rugosa, a luz se espalha.
 */
export const FINISH: Record<CarFinish, FinishParams> = {
  solid: { metal: 0.2, rough: 0.36, coat: 1, iridescence: 0 },
  metallic: { metal: 0.85, rough: 0.3, coat: 1, iridescence: 0 },
  pearl: { metal: 0.35, rough: 0.22, coat: 1, iridescence: 1 },
  matte: { metal: 0.15, rough: 0.72, coat: 0, iridescence: 0 },
};

/** A espessura da película da perolada, em nanômetros, e o índice dela. */
const PEARL_FILM_NM = 380;
const PEARL_FILM_IOR = 1.3;

/** O estado da tinta para uma cor e um acabamento: a saia e, quando há blusa, o branco gelo (ou o dourado). */
export function paintState(color: CarColor, finish: CarFinish, twoTone: boolean): PaintState {
  const base = FINISH[finish];
  const lower = new Color(CAR_COLORS[color].hex);
  const whole = !twoTone || color === 'gold';
  return {
    lower,
    upper: whole ? lower.clone() : new Color(PAINT_TOP_HEX),
    metal: [base.metal, whole ? base.metal : 0.15],
    rough: [base.rough, whole ? base.rough : Math.max(0.3, base.rough)],
    coat: base.coat,
    iridescence: base.iridescence,
  };
}

export function lerpPaint(a: PaintState, b: PaintState, t: number, out: PaintState): void {
  out.lower.copy(a.lower).lerp(b.lower, t);
  out.upper.copy(a.upper).lerp(b.upper, t);
  out.metal[0] = a.metal[0] + (b.metal[0] - a.metal[0]) * t;
  out.metal[1] = a.metal[1] + (b.metal[1] - a.metal[1]) * t;
  out.rough[0] = a.rough[0] + (b.rough[0] - a.rough[0]) * t;
  out.rough[1] = a.rough[1] + (b.rough[1] - a.rough[1]) * t;
  out.coat = a.coat + (b.coat - a.coat) * t;
  out.iridescence = a.iridescence + (b.iridescence - a.iridescence) * t;
}

export function clonePaint(s: PaintState): PaintState {
  return {
    lower: s.lower.clone(),
    upper: s.upper.clone(),
    metal: [s.metal[0], s.metal[1]],
    rough: [s.rough[0], s.rough[1]],
    coat: s.coat,
    iridescence: s.iridescence,
  };
}

export type Paint = {
  /** a carroceria inteira, com o que vai no lote dela (retrovisores, caçamba) */
  body: MeshPhysicalNodeMaterial;
  state: PaintState;
  apply: (s: PaintState) => void;
  dispose: () => void;
};

export function createPaint(profile: CarProfile, color: CarColor, finish: CarFinish): Paint {
  const twoTone = profile.twoTone;
  const state = paintState(color, finish, twoTone !== null);
  const lower = uniform(state.lower.clone());
  const upper = uniform(state.upper.clone());
  const metalLo = uniform(state.metal[0]);
  const metalHi = uniform(state.metal[1]);
  const roughLo = uniform(state.rough[0]);
  const roughHi = uniform(state.rough[1]);
  const coat = uniform(state.coat);
  const iridescence = uniform(state.iridescence);

  // um grafo só para os cinco carros: a divisa e o V são uniformes, e no carro de uma cor só a
  // divisa fica muito acima do teto (tudo é saia). Mesmo shader para todos: trocar de modelo nunca
  // compila tinta nova (a sombra e o reflexo compilam de forma síncrona e engasgariam a troca).
  const halfWidth = profile.width / 2;
  const nose = Math.max(...profile.top.map((c) => (c.op === 'A' ? -Infinity : c.to[0])));
  const split = uniform(twoTone ? twoTone.split : 1000);
  const vDepth = uniform(twoTone ? twoTone.vDepth : 0);
  const invHalf = uniform(1 / halfWidth);
  const noseFrom = uniform(nose - 0.45);
  const noseTo = uniform(nose - 0.08);
  // a divisa: reta na lateral; no nariz desce em V para o centro (|z| pequeno)
  const towardCenter = clamp(float(1).sub(abs(positionLocal.z).mul(invHalf)), 0, 1);
  const atNose = smoothstep(noseFrom, noseTo, positionLocal.x);
  const seam = split.sub(towardCenter.mul(atNose).mul(vDepth));
  const blouse = step(seam, positionLocal.y);
  const body = new MeshPhysicalNodeMaterial({ clearcoatRoughness: 0.06 });
  body.colorNode = mix(lower, upper, blouse);
  body.metalnessNode = mix(metalLo, metalHi, blouse);
  body.roughnessNode = mix(roughLo, roughHi, blouse);
  // o verniz e a película sempre no grafo, com o valor por uniforme: trocar de acabamento nunca
  // compila tinta nova (a fosca é verniz 0; as outras, película 0)
  body.clearcoatNode = coat;
  body.iridescenceNode = iridescence;
  body.iridescenceIORNode = float(PEARL_FILM_IOR);
  body.iridescenceThicknessNode = float(PEARL_FILM_NM);
  return {
    body,
    state,
    apply: (s) => {
      lower.value.copy(s.lower);
      upper.value.copy(s.upper);
      metalLo.value = s.metal[0];
      metalHi.value = s.metal[1];
      roughLo.value = s.rough[0];
      roughHi.value = s.rough[1];
      coat.value = s.coat;
      iridescence.value = s.iridescence;
      state.lower.copy(s.lower);
      state.upper.copy(s.upper);
      state.metal = [s.metal[0], s.metal[1]];
      state.rough = [s.rough[0], s.rough[1]];
      state.coat = s.coat;
      state.iridescence = s.iridescence;
    },
    dispose: () => body.dispose(),
  };
}

export type CarMaterials = {
  dark: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  chrome: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  rim: MeshStandardMaterial;
  /** a roda de aço pintada (fase 16) */
  steel: MeshStandardMaterial;
  head: MeshStandardMaterial;
  tail: MeshStandardMaterial;
  fog: MeshStandardMaterial;
  liner: MeshStandardMaterial;
  dispose: () => void;
};

/** Vidro escuro, cromado, borracha, plástico preto e as luzes emissivas que a noite acende. */
export function carMaterials(): CarMaterials {
  const dark = new MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
  const trim = new MeshStandardMaterial({ color: 0x22252b, roughness: 0.75, metalness: 0.1 });
  const glass = new MeshPhysicalMaterial({
    color: 0x0d1319,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    side: DoubleSide,
  });
  const chrome = new MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.95, roughness: 0.22 });
  const rubber = new MeshStandardMaterial({ color: 0x15171a, roughness: 0.95 });
  const rim = new MeshStandardMaterial({ color: 0x9aa2ad, metalness: 0.7, roughness: 0.38 });
  const steel = new MeshStandardMaterial({ color: 0x6f7781, metalness: 0.45, roughness: 0.5 });
  const head = new MeshStandardMaterial({
    color: 0xeef2ff,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.3,
  });
  const tail = new MeshStandardMaterial({
    color: 0x8a1c1c,
    emissive: 0xff2a1a,
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  const fog = new MeshStandardMaterial({
    color: 0xfff1c0,
    emissive: 0xffe2a0,
    emissiveIntensity: 0.15,
    roughness: 0.25,
  });
  const liner = new MeshStandardMaterial({ color: 0x24272d, roughness: 0.92 });
  const all = [dark, trim, glass, chrome, rubber, rim, steel, head, tail, fog, liner];
  return {
    dark,
    trim,
    glass,
    chrome,
    rubber,
    rim,
    steel,
    head,
    tail,
    fog,
    liner,
    dispose: () => {
      for (const m of all) m.dispose();
    },
  };
}
