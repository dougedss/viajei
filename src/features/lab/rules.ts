import { isLabScenario, type LabScenario, type LabStatus } from './scenarios.ts';

/**
 * As contas do painel do laboratório, puras: histórico por cenário, sequência de execuções verdes,
 * atraso típico de entrega e a última falha. O painel só desenha o que sai daqui.
 */
export type LabCheckRow = {
  scenario: string;
  status: string;
  latency_ms: number | null;
  detail: string | null;
};

export type LabRunRow = {
  id: string;
  target: string;
  source: string;
  commit_sha: string | null;
  status: string;
  summary: string | null;
  started_at: string;
  finished_at: string;
  diagnostics: unknown;
  lab_checks: LabCheckRow[];
};

export function asStatus(value: string): LabStatus {
  return value === 'pass' || value === 'fail' ? value : 'skip';
}

/** Os estados de um cenário nas últimas `n` execuções, da mais antiga para a mais nova. */
export function scenarioHistory(
  runs: readonly LabRunRow[],
  scenario: LabScenario,
  n = 20,
): { runId: string; at: string; status: LabStatus | null }[] {
  return runs
    .slice(0, n)
    .map((r) => {
      const check = r.lab_checks.find((c) => c.scenario === scenario);
      return { runId: r.id, at: r.started_at, status: check ? asStatus(check.status) : null };
    })
    .reverse();
}

/** O último resultado de cada cenário, na ordem de `keys`. */
export function latestChecks(
  run: LabRunRow | undefined,
  keys: readonly LabScenario[],
): { scenario: LabScenario; check: LabCheckRow | null }[] {
  return keys.map((scenario) => ({
    scenario,
    check: run?.lab_checks.find((c) => c.scenario === scenario) ?? null,
  }));
}

/** Quantas execuções seguidas, a partir da mais nova, terminaram verdes (puladas não quebram nem contam). */
export function greenStreak(runs: readonly LabRunRow[]): number {
  let n = 0;
  for (const r of runs) {
    const s = asStatus(r.status);
    if (s === 'skip') continue;
    if (s === 'fail') break;
    n++;
  }
  return n;
}

/** Mediana do atraso de entrega nas últimas `n` execuções que mediram. */
export function typicalLatency(runs: readonly LabRunRow[], n = 10): number | null {
  const values = runs
    .map((r) => r.lab_checks.find((c) => c.scenario === 'entrega')?.latency_ms ?? null)
    .filter((v): v is number => v !== null)
    .slice(0, n)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? (values[mid] ?? null)
    : Math.round(((values[mid - 1] ?? 0) + (values[mid] ?? 0)) / 2);
}

/** Verdes sobre o que de fato rodou (puladas fora) nas execuções desde `since`. */
export function passRate(runs: readonly LabRunRow[], since: Date): { pass: number; total: number } {
  const counted = runs.filter(
    (r) => Date.parse(r.started_at) >= since.getTime() && asStatus(r.status) !== 'skip',
  );
  return { pass: counted.filter((r) => r.status === 'pass').length, total: counted.length };
}

export function lastFailure(runs: readonly LabRunRow[]): LabRunRow | null {
  return runs.find((r) => r.status === 'fail') ?? null;
}

/** Os cenários que falharam numa execução, com o rótulo pronto. */
export function failedScenarios(run: LabRunRow): LabScenario[] {
  return run.lab_checks
    .filter((c) => c.status === 'fail' && isLabScenario(c.scenario))
    .map((c) => c.scenario as LabScenario);
}

export function formatMs(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
