/**
 * As contas do cenário `lighthouse` (puras, sem o Lighthouse nem o navegador): a mediana das três
 * execuções e as notas abaixo da meta.
 */
export const LIGHTHOUSE_RUNS = 3;
export const LIGHTHOUSE_TARGET = 90;
export const CATEGORIES = ['performance', 'accessibility', 'best-practices'] as const;
export type Category = (typeof CATEGORIES)[number];
export type Scores = Record<Category, number>;

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** As notas abaixo da meta, rota a rota: "visao_geral performance 84". */
export function belowTarget(routes: Record<string, Scores>, target = LIGHTHOUSE_TARGET): string[] {
  return Object.entries(routes).flatMap(([route, s]) =>
    CATEGORIES.filter((c) => s[c] < target).map((c) => `${route} ${c} ${String(s[c])}`),
  );
}
