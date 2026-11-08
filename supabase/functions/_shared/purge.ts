import { z } from 'zod';

/**
 * O expurgo (fase 12): as regras, o contrato com a função SQL `purge` (0012) e o handler da Edge
 * Function `purge`, sem Deno e sem rede. O `index.ts` liga o banco e o Storage; o Vitest liga de
 * mentira. O log é uma linha só com contagens: nunca nome, texto, caminho de arquivo ou id.
 */

/** Quanto cada coisa espera antes de sair de vez. */
export const PURGE_DAYS = {
  /** viagem excluída pelo dono (a regra do prompt, 4.1): sai inteira, menos XP e conquistas */
  trips: 30,
  /** lápide de uma viagem viva: um aparelho que não puxa há mais que isso faz `resync` */
  tombstones: 90,
  /** registros do servidor: avisos enviados, chamadas de função, importações, laboratório */
  logs: 90,
  /** objeto do Storage sem linha viva: o arquivo sobe antes da linha (D78) */
  orphans: 7,
} as const;

export type PurgeDays = { readonly [K in keyof typeof PURGE_DAYS]: number };

export const PURGE_BUCKET = 'attachments';
/** A API do Storage apaga uma lista por chamada; lotes pequenos cabem no prazo e na requisição. */
export const PURGE_STORAGE_BATCH = 100;

const DAY_MS = 86_400_000;

/** Os cortes, como a função SQL os recebe: tudo o que é anterior a cada um se qualifica. */
export type PurgeCutoffs = {
  p_trips_before: string;
  p_tombstones_before: string;
  p_logs_before: string;
  p_orphans_before: string;
};

export function purgeCutoffs(now: Date, days: PurgeDays = PURGE_DAYS): PurgeCutoffs {
  const before = (n: number) => new Date(now.getTime() - n * DAY_MS).toISOString();
  return {
    p_trips_before: before(days.trips),
    p_tombstones_before: before(days.tombstones),
    p_logs_before: before(days.logs),
    p_orphans_before: before(days.orphans),
  };
}

const count = z.number().int().nonnegative();
/** Quantos se qualificam e a data do mais novo deles: o laboratório confere que é mais velho que a regra. */
const tally = z.object({ count, newest: z.string().nullable() });
export type PurgeTally = z.infer<typeof tally>;

/**
 * O que a função SQL devolve, no `dry_run` e de verdade (as mesmas contagens).
 * - `trips`: viagens excluídas há mais de 30 dias; `newest` é a exclusão mais recente.
 * - `trip_rows`: as linhas que saem junto com elas, por tabela.
 * - `trip_kept`: as que ficam sem a viagem (`on delete set null`): XP, conquistas e importações.
 * - `tombstones`: lápides de viagens vivas, por tabela; `newest` é o `synced_at` mais recente.
 * - `held`: lápides que ficam porque uma linha viva ainda depende delas por FK em cascata.
 * - `horizons`: viagens e pessoas que ganham horizonte novo (o `resync` de quem está atrasado).
 * - `logs`: registros do servidor, por tabela.
 * - `storage`: objetos das viagens expurgadas e objetos sem linha viva; os caminhos só voltam para a
 *   chave secreta, que os apaga pela API do Storage.
 */
export const purgeReportSchema = z.object({
  dry_run: z.boolean(),
  trips: tally,
  trip_rows: z.record(z.string(), count),
  trip_kept: z.record(z.string(), count),
  tombstones: z.record(z.string(), tally),
  held: count,
  horizons: z.object({ trips: count, users: count }),
  logs: z.record(z.string(), tally),
  storage: z.object({
    trip_objects: count,
    orphans: tally,
    paths: z.array(z.string()).default([]),
  }),
});
export type PurgeReport = z.infer<typeof purgeReportSchema>;

/** A resposta da função: o relatório sem os caminhos, mais o que o Storage apagou. */
export type PurgeSummary = Omit<PurgeReport, 'storage'> & {
  by: PurgeMode;
  storage: { trip_objects: number; orphans: PurgeTally; removed: number; failed: number };
  ms: number;
};

/** Sem `dry_run` no corpo, é `dry_run`: apagar exige pedir para apagar. */
export const purgeRequestSchema = z.object({ dry_run: z.boolean().optional() });

/**
 * `secret`: o pg_cron (ou quem tem a chave secreta) roda o expurgo, de verdade ou em `dry_run`.
 * `user`: o executor do laboratório pede só o `dry_run`, com o JWT dele (D52: ele nunca tem a chave
 * secreta); o banco recusa quem não é executor.
 */
export type PurgeMode = 'secret' | 'user';
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
export type PurgeDeps = {
  mode: PurgeMode;
  now: () => Date;
  /** `purge` só com a chave secreta; `lab_purge_preview` como a pessoa */
  rpc: (
    fn: 'purge' | 'lab_purge_preview',
    args: PurgeCutoffs & { p_dry_run?: boolean },
  ) => Promise<RpcResult>;
  /** apaga pela API do Storage e devolve quantos saíram; lança se a chamada falhar */
  remove: (paths: string[]) => Promise<number>;
  log: (line: Record<string, unknown>) => void;
};

const sum = (values: Iterable<number>) => [...values].reduce((a, b) => a + b, 0);

/** A linha do log: só números. */
export function purgeLogLine(summary: PurgeSummary): Record<string, unknown> {
  return {
    dry_run: summary.dry_run,
    by: summary.by,
    trips: summary.trips.count,
    trip_rows: sum(Object.values(summary.trip_rows)),
    trip_kept: sum(Object.values(summary.trip_kept)),
    tombstones: sum(Object.values(summary.tombstones).map((t) => t.count)),
    held: summary.held,
    horizons: summary.horizons,
    logs: sum(Object.values(summary.logs).map((t) => t.count)),
    storage: {
      trip_objects: summary.storage.trip_objects,
      orphans: summary.storage.orphans.count,
      removed: summary.storage.removed,
      failed: summary.storage.failed,
    },
    ms: summary.ms,
  };
}

export async function handlePurge(req: Request, deps: PurgeDeps): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Use POST.' }, { status: 405 });
  const started = Date.now();
  const body = purgeRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return Response.json({ error: 'O corpo é { "dry_run": true | false }.' }, { status: 400 });
  }
  const dryRun = body.data.dry_run ?? true;
  if (deps.mode === 'user' && !dryRun) {
    return Response.json({ error: 'Pelo laboratório, só o dry_run.' }, { status: 403 });
  }

  const cutoffs = purgeCutoffs(deps.now());
  const { data, error } =
    deps.mode === 'secret'
      ? await deps.rpc('purge', { ...cutoffs, p_dry_run: dryRun })
      : await deps.rpc('lab_purge_preview', cutoffs);
  if (error) {
    deps.log({ error: error.code ?? 'rpc', by: deps.mode });
    const status = error.code === '42501' ? 403 : 500;
    return Response.json(
      { error: status === 403 ? 'Sem acesso.' : 'O expurgo falhou.' },
      { status },
    );
  }
  const parsed = purgeReportSchema.safeParse(data);
  if (!parsed.success) {
    deps.log({ error: 'formato', by: deps.mode });
    return Response.json({ error: 'Resposta do banco fora do formato.' }, { status: 500 });
  }
  const report = parsed.data;

  // o banco já apagou as linhas; os arquivos saem pela API do Storage (apagar a linha de
  // storage.objects por SQL deixaria o arquivo). Um lote que falha fica para o dia seguinte: sem
  // linha viva, ele continua se qualificando.
  let removed = 0;
  let failed = 0;
  if (deps.mode === 'secret' && !report.dry_run) {
    const paths = report.storage.paths;
    for (let i = 0; i < paths.length; i += PURGE_STORAGE_BATCH) {
      const batch = paths.slice(i, i + PURGE_STORAGE_BATCH);
      try {
        removed += await deps.remove(batch);
      } catch {
        failed += batch.length;
      }
    }
  }

  const { storage, ...rest } = report;
  const summary: PurgeSummary = {
    ...rest,
    by: deps.mode,
    storage: {
      trip_objects: storage.trip_objects,
      orphans: storage.orphans,
      removed,
      failed,
    },
    ms: Date.now() - started,
  };
  deps.log(purgeLogLine(summary));
  return Response.json(summary);
}
