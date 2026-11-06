/**
 * Contas de cor em hexadecimal, puras: misturar com branco ou preto para os degradês da vista
 * lateral (o mesmo carro, com brilho em cima e sombra embaixo, sem depender do three).
 */
function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `a` misturado com `b` na proporção `t` (0 = só `a`). */
export function mixHex(a: string, b: string, t: number): string {
  const x = parse(a);
  const y = parse(b);
  return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export const lighten = (c: string, t: number) => mixHex(c, '#ffffff', t);
export const darken = (c: string, t: number) => mixHex(c, '#000000', t);
