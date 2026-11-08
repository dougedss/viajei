import { PURGE_DAYS } from '../../supabase/functions/_shared/purge.ts';
import type { Check } from './evaluate.ts';
import type { Session } from './session.ts';

/**
 * `expurgo` (fase 12): todo dia, o `dry_run` da função `purge` com o JWT do lab-a (D52: o executor
 * nunca tem a chave secreta, e a função só aceita o `dry_run` dele). Confere que a função responde,
 * que nada saiu do Storage e que o item mais novo de cada categoria é mais velho que a regra, contado
 * daqui, com o relógio desta máquina: nada fora da regra se qualifica. Só contagens vão para `data`.
 */
type Tally = { count: number; newest: string | null };
export type PurgeSummaryLike = {
  dry_run: boolean;
  by: string;
  trips: Tally;
  trip_rows: Record<string, number>;
  trip_kept: Record<string, number>;
  tombstones: Record<string, Tally>;
  held: number;
  horizons: { trips: number; users: number };
  logs: Record<string, Tally>;
  storage: { trip_objects: number; orphans: Tally; removed: number; failed: number };
  ms: number;
};

const DAY_MS = 86_400_000;
/** a função e esta máquina medem o tempo cada uma com o seu relógio */
const SLACK_MS = 10 * 60_000;

/** O que se qualificou fora da regra: cada "mais novo" tem de ser anterior a agora menos os dias. */
export function outOfRule(s: PurgeSummaryLike, now: Date): string[] {
  const problems: string[] = [];
  const check = (what: string, t: Tally, days: number) => {
    if (t.count === 0 || t.newest === null) return;
    const limit = now.getTime() - days * DAY_MS + SLACK_MS;
    if (Date.parse(t.newest) > limit) {
      problems.push(`${what}: o mais novo é de ${t.newest}, dentro dos ${String(days)} dias`);
    }
  };
  check('viagens', s.trips, PURGE_DAYS.trips);
  for (const [t, tally] of Object.entries(s.tombstones))
    check(`lápides de ${t}`, tally, PURGE_DAYS.tombstones);
  for (const [t, tally] of Object.entries(s.logs))
    check(`registros de ${t}`, tally, PURGE_DAYS.logs);
  check('objetos sem linha', s.storage.orphans, PURGE_DAYS.orphans);
  return problems;
}

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

export async function expurgo(a: Session, now = new Date()): Promise<Check> {
  const t0 = Date.now();
  const done = (status: Check['status'], detail: string, data: Record<string, unknown> = {}) => ({
    scenario: 'expurgo' as const,
    status,
    latency_ms: Date.now() - t0,
    detail,
    data,
  });
  const res = await a.client.functions.invoke<PurgeSummaryLike>('purge', {
    body: { dry_run: true },
  });
  if (res.error) {
    // FunctionsHttpError traz a resposta em `context`; sem ela, foi a rede
    const err: unknown = res.error;
    const status =
      err && typeof err === 'object' && 'context' in err
        ? (err.context as { status?: number } | undefined)?.status
        : undefined;
    if (status === 404) return done('skip', 'A função purge ainda não está no ar.');
    const message = err instanceof Error ? err.message : 'sem resposta';
    return done('fail', `A função respondeu ${status === undefined ? message : String(status)}.`);
  }
  const data = res.data;
  if (!data) return done('fail', 'A função respondeu sem corpo.');

  const problems: string[] = [];
  if (!data.dry_run || data.by !== 'user') problems.push('não veio como o dry_run do laboratório');
  if (data.storage.removed > 0 || data.storage.failed > 0)
    problems.push('o dry_run mexeu no Storage');
  problems.push(...outOfRule(data, now));

  const tombstones = sum(Object.values(data.tombstones).map((t) => t.count));
  const logs = sum(Object.values(data.logs).map((t) => t.count));
  const counts = {
    viagens: data.trips.count,
    linhas_das_viagens: sum(Object.values(data.trip_rows)),
    linhas_que_ficam: sum(Object.values(data.trip_kept)),
    lapides: tombstones,
    seguras: data.held,
    horizontes: data.horizons,
    registros: Object.fromEntries(Object.entries(data.logs).map(([t, v]) => [t, v.count])),
    objetos: { das_viagens: data.storage.trip_objects, sem_linha: data.storage.orphans.count },
    ms: data.ms,
  };
  return problems.length > 0
    ? done('fail', problems.join('; '), counts)
    : done(
        'pass',
        `dry_run em ${String(data.ms)} ms: ${String(data.trips.count)} viagens, ${String(tombstones)} lápides, ${String(logs)} registros e ${String(data.storage.trip_objects + data.storage.orphans.count)} objetos se qualificam, nada fora da regra`,
        counts,
      );
}
