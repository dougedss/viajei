/**
 * A troca de modelo no palco, pura: o carro atual sai rodando pela direita da tela e o novo entra
 * pela esquerda, cerca de 0,9 s. Na saída, se o carro não estiver de perfil, ele esterça até a
 * direção de saída nos primeiros 35% (como um carro que manobra para sair do disco); o novo já
 * chega de perfil e assenta no centro. A distância percorrida gira as rodas.
 */
export const SWAP = { outMs: 450, inMs: 450, distance: 7.5, steer: 0.35 } as const;

export type SwapPose = {
  /** quanto o carro que sai andou para a direita da tela */
  out: { travel: number; steer: number } | null;
  /** quanto falta ao carro que entra para chegar ao centro (negativo: à esquerda) */
  in: { offset: number } | null;
  done: boolean;
};

export function swapPose(t: number): SwapPose {
  if (t >= SWAP.outMs + SWAP.inMs) return { out: null, in: { offset: 0 }, done: true };
  if (t < SWAP.outMs) {
    const k = Math.max(0, t) / SWAP.outMs;
    const steer = Math.min(1, k / SWAP.steer);
    return {
      out: { travel: SWAP.distance * k * k, steer: steer * steer * (3 - 2 * steer) },
      in: null,
      done: false,
    };
  }
  const k = (t - SWAP.outMs) / SWAP.inMs;
  const rest = 1 - k;
  return { out: null, in: { offset: -SWAP.distance * rest * rest * rest }, done: false };
}

/** O ângulo mais curto de `a` para `b`, para o esterço não dar a volta inteira. */
export function shortestTurn(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
