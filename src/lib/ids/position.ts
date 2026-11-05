import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

/**
 * Posição fracionária das paradas e dos itens de lista (`position text collate "C"`): uma string
 * cuja ordem lexicográfica por byte é a ordem da lista. Mover um item gera uma posição só, entre
 * as duas vizinhas, sem renumerar o resto; dois aparelhos sem sinal reordenando ao mesmo tempo
 * não se misturam, porque cada um escreve só a linha que moveu.
 */
export function positionBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

export function positionsBetween(before: string | null, after: string | null, n: number): string[] {
  return generateNKeysBetween(before, after, n);
}

/** Depois da última posição de uma lista já ordenada. */
export function positionAtEnd(positions: readonly string[]): string {
  return generateKeyBetween(positions.at(-1) ?? null, null);
}

/** Ordem de `position`: comparação por code unit, igual ao collate "C" do Postgres. */
export function comparePosition(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A posição nova de um item que sai do índice `from` e vai para o índice `to` numa lista
 * ordenada. Entre os vizinhos que ele terá depois de sair do lugar antigo.
 */
export function positionForMove(
  positions: readonly string[],
  from: number,
  to: number,
): string | null {
  if (from === to || from < 0 || to < 0 || from >= positions.length || to >= positions.length)
    return null;
  const rest = positions.filter((_, i) => i !== from);
  const before = rest[to - 1] ?? null;
  const after = rest[to] ?? null;
  return generateKeyBetween(before, after);
}
