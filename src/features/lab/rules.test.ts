import { describe, expect, it } from 'vitest';
import {
  failedScenarios,
  formatMs,
  greenStreak,
  lastFailure,
  latestChecks,
  passRate,
  scenarioHistory,
  typicalLatency,
  type LabRunRow,
} from './rules.ts';

function run(
  id: string,
  status: string,
  startedAt: string,
  entregaMs: number | null = 3000,
): LabRunRow {
  return {
    id,
    target: 'production',
    source: 'github-actions',
    commit_sha: null,
    status,
    summary: null,
    started_at: startedAt,
    finished_at: startedAt,
    diagnostics: {},
    lab_checks: [
      {
        scenario: 'entrega',
        status: status === 'skip' ? 'skip' : 'pass',
        latency_ms: entregaMs,
        detail: null,
      },
      { scenario: 'saida', status, latency_ms: null, detail: status === 'fail' ? 'faltou' : null },
    ],
  };
}

// da mais nova para a mais antiga, como a consulta devolve
const runs = [
  run('r5', 'pass', '2026-12-11T15:17:00Z', 2000),
  run('r4', 'skip', '2026-12-11T09:17:00Z', null),
  run('r3', 'pass', '2026-12-11T03:17:00Z', 6000),
  run('r2', 'fail', '2026-12-10T21:17:00Z', 4000),
  run('r1', 'pass', '2026-12-10T15:17:00Z', 1000),
];

describe('painel do laboratório', () => {
  it('histórico de um cenário, do mais antigo para o mais novo', () => {
    expect(scenarioHistory(runs, 'saida').map((h) => h.status)).toEqual([
      'pass',
      'fail',
      'pass',
      'skip',
      'pass',
    ]);
    expect(scenarioHistory(runs, 'vapid')[0]?.status).toBeNull();
  });

  it('sequência verde: puladas não quebram nem contam', () => {
    expect(greenStreak(runs)).toBe(2);
    expect(greenStreak([])).toBe(0);
  });

  it('atraso típico é a mediana de quem mediu', () => {
    expect(typicalLatency(runs)).toBe(3000);
    expect(typicalLatency(runs.slice(0, 1))).toBe(2000);
    expect(typicalLatency([])).toBeNull();
  });

  it('taxa de verdes, última falha, cenários que falharam, último de cada cenário', () => {
    expect(passRate(runs, new Date('2026-12-10T20:00:00Z'))).toEqual({ pass: 2, total: 3 });
    expect(lastFailure(runs)?.id).toBe('r2');
    expect(failedScenarios(runs[3]!)).toEqual(['saida']);
    expect(latestChecks(runs[0], ['saida', 'vapid'])).toEqual([
      {
        scenario: 'saida',
        check: { scenario: 'saida', status: 'pass', latency_ms: null, detail: null },
      },
      { scenario: 'vapid', check: null },
    ]);
  });

  it('formata durações', () => {
    expect(formatMs(3400)).toBe('3 s');
    expect(formatMs(222_000)).toBe('3 min 42 s');
  });
});
