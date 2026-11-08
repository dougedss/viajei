/**
 * As contas do cenário `lighthouse` (puras, sem o Lighthouse nem o navegador): a mediana das três
 * execuções, as notas abaixo da meta e o veredito pela máquina do dia.
 */
export const LIGHTHOUSE_RUNS = 3;
export const LIGHTHOUSE_TARGET = 90;
/**
 * A régua (fase 13): a meta de 90 só é cobrada numa máquina normal. O `benchmarkIndex` do Lighthouse
 * mede a CPU de onde ele rodou; as medidas da D162 saíram de máquinas com 2.800 a 3.000, e as
 * máquinas lentas do GitHub (2.300 a 2.400) davam 83 a 88 na mesma tela, sem nenhuma mudança no
 * app. Abaixo de 2.800 o resultado é "medido, não cobrado": o laboratório fica pulado com os
 * números no detalhe, e só fica vermelho quando a tela piorou, não quando a máquina era lenta.
 */
export const MIN_BENCHMARK_INDEX = 2_800;
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

export type Verdict = { status: 'pass' | 'fail' | 'skip'; detail: string };

/**
 * O veredito do cenário: o que falhou por si (o Lighthouse não rodou, o app não é instalável) é
 * falha em qualquer máquina; uma nota abaixo da meta é falha numa máquina normal e "medido, não
 * cobrado" numa lenta; sem nada disso, passou. O índice vai sempre no detalhe.
 */
export function verdict(opts: {
  below: readonly string[];
  benchmark: number | null;
  problems: readonly string[];
  ok: string;
}): Verdict {
  const index =
    opts.benchmark === null
      ? 'índice de CPU desconhecido'
      : `índice de CPU ${String(Math.round(opts.benchmark))}`;
  if (opts.problems.length > 0) {
    return { status: 'fail', detail: [...opts.problems, ...opts.below, index].join('; ') };
  }
  if (opts.below.length > 0) {
    const slow = opts.benchmark !== null && opts.benchmark < MIN_BENCHMARK_INDEX;
    return slow
      ? {
          status: 'skip',
          detail: `Medido, não cobrado: máquina lenta (${index}, abaixo de ${String(MIN_BENCHMARK_INDEX)}): ${opts.below.join('; ')}`,
        }
      : { status: 'fail', detail: `${opts.below.join('; ')} (${index})` };
  }
  return { status: 'pass', detail: `${opts.ok} · ${index}` };
}
