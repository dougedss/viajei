import { format } from 'date-fns';
import { CircleCheck, CircleMinus, CircleX, FlaskConical, RefreshCw, Timer } from 'lucide-react';
import { z } from 'zod';
import { Splash } from '@/app/Splash.tsx';
import { Button } from '@/components/ui/Button.tsx';
import { Card } from '@/components/ui/Card.tsx';
import { Chip } from '@/components/ui/Chip.tsx';
import { EmptyState } from '@/components/ui/EmptyState.tsx';
import { PageHeader } from '@/components/ui/PageHeader.tsx';
import { cx } from '@/lib/cx.ts';
import { useLabRole, useLabRuns } from '../queries.ts';
import {
  asStatus,
  failedScenarios,
  formatMs,
  greenStreak,
  lastFailure,
  latestChecks,
  passRate,
  scenarioHistory,
  typicalLatency,
  type LabRunRow,
} from '../rules.ts';
import {
  isLabScenario,
  LAB_SCENARIO_KEYS,
  LAB_SCENARIOS,
  type LabScenario,
  type LabStatus,
} from '../scenarios.ts';

/**
 * O painel do laboratório: o agente agendado roda os cenários da tela apagada na produção e grava o
 * resultado; aqui se vê o estado de agora, o histórico de cada cenário e o detalhe de cada execução.
 * Estado sempre com ícone e palavra, nunca só cor.
 */
const STATUS = {
  pass: {
    label: 'Verde',
    Icon: CircleCheck,
    text: 'text-on-time-ink',
    fill: 'bg-on-time',
    soft: 'bg-on-time/15',
  },
  fail: {
    label: 'Falhou',
    Icon: CircleX,
    text: 'text-late-ink',
    fill: 'bg-late',
    soft: 'bg-late/15',
  },
  skip: {
    label: 'Pulado',
    Icon: CircleMinus,
    text: 'text-ink-2',
    fill: 'bg-ink-2/40',
    soft: 'bg-line',
  },
} as const satisfies Record<LabStatus, unknown>;

const TARGET_LABEL: Record<string, string> = { production: 'produção', local: 'local' };

function when(iso: string): string {
  return format(new Date(iso), 'dd/MM HH:mm');
}

function StatusBadge({ status, size = 'sm' }: { status: LabStatus; size?: 'sm' | 'lg' }) {
  const s = STATUS[status];
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold',
        s.soft,
        s.text,
        size === 'lg' ? 'min-h-9 px-3 text-[15px]' : 'min-h-7 px-2.5 text-[13px]',
      )}
    >
      <s.Icon className={size === 'lg' ? 'size-5' : 'size-4'} aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** As últimas execuções de um cenário: um quadradinho por execução, a mais nova à direita. */
function HistoryStrip({ runs, scenario }: { runs: readonly LabRunRow[]; scenario: LabScenario }) {
  const history = scenarioHistory(runs, scenario);
  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const h of history) if (h.status) counts[h.status]++;
  return (
    <div
      role="img"
      aria-label={`Últimas ${history.length} execuções: ${counts.pass} verdes, ${counts.fail} com falha, ${counts.skip} puladas`}
      className="flex flex-wrap gap-[2px]"
    >
      {history.map((h) => (
        <span
          key={h.runId}
          title={`${when(h.at)} · ${h.status ? STATUS[h.status].label : 'não rodou'}`}
          className={cx('h-4 w-2.5 rounded-[3px]', h.status ? STATUS[h.status].fill : 'bg-line')}
        />
      ))}
    </div>
  );
}

function Tile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <Card className="grid content-start gap-1">
      <span className="label-caps text-ink-2">{label}</span>
      <span className="font-num text-[30px] leading-none font-semibold text-ink">{value}</span>
      <span className="text-[13px] text-ink-2">{caption}</span>
    </Card>
  );
}

const diagnosticsSchema = z.looseObject({
  cron: z
    .array(
      z.looseObject({
        start: z.string(),
        status: z.string().nullish(),
        message: z.string().nullish(),
      }),
    )
    .optional(),
  http: z
    .array(
      z.looseObject({
        at: z.string(),
        status: z.number().nullish(),
        error: z.string().nullish(),
        body: z.string().nullish(),
      }),
    )
    .optional(),
  sent: z
    .array(
      z.looseObject({
        kind: z.string(),
        status: z.string(),
        attempts: z.number().nullish(),
        error: z.string().nullish(),
      }),
    )
    .optional(),
});

/** O que o servidor viu durante a execução: cron, respostas HTTP do pg_net e avisos reservados. */
function Diagnostics({ value }: { value: unknown }) {
  const parsed = diagnosticsSchema.safeParse(value);
  if (!parsed.success) return null;
  const { cron = [], http = [], sent = [] } = parsed.data;
  const time = (iso: string) => format(new Date(iso), 'HH:mm:ss');
  return (
    <div className="grid gap-3 rounded-field bg-paper p-3 text-[13px] text-ink-2">
      <div className="grid gap-1">
        <span className="label-caps">Cron ({cron.length})</span>
        {cron.map((c) => (
          <span key={c.start} className="font-mono">
            {time(c.start)} · {c.status ?? '?'} · {c.message ?? ''}
          </span>
        ))}
      </div>
      <div className="grid gap-1">
        <span className="label-caps">Chamadas à função ({http.length})</span>
        {http.map((h) => (
          <span key={h.at} className="font-mono break-all">
            {time(h.at)} · {h.status ?? 'sem resposta'} {h.error ? `· ${h.error}` : ''}{' '}
            {h.body ? `· ${h.body}` : ''}
          </span>
        ))}
      </div>
      <div className="grid gap-1">
        <span className="label-caps">Avisos reservados ({sent.length})</span>
        {sent.map((s, i) => (
          <span key={`${s.kind}-${i}`} className="font-mono">
            {s.kind} · {s.status} · {s.attempts ?? 0} tentativa(s) {s.error ? `· ${s.error}` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function RunDetails({ run }: { run: LabRunRow }) {
  const status = asStatus(run.status);
  const duration = Date.parse(run.finished_at) - Date.parse(run.started_at);
  const checks = run.lab_checks
    .filter((c) => isLabScenario(c.scenario))
    .sort(
      (a, b) =>
        LAB_SCENARIO_KEYS.indexOf(a.scenario as LabScenario) -
        LAB_SCENARIO_KEYS.indexOf(b.scenario as LabScenario),
    );
  return (
    <details className="group rounded-card bg-card shadow-[inset_0_0_0_1px_var(--color-line)]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <StatusBadge status={status} />
        <span className="grid min-w-0 flex-1">
          <span className="font-num text-[17px] font-semibold">{when(run.started_at)}</span>
          <span className="truncate text-[13px] text-ink-2">{run.summary ?? ''}</span>
        </span>
        <span className="shrink-0 text-[13px] text-ink-2">{formatMs(duration)}</span>
      </summary>
      <div className="grid gap-3 border-t border-line px-4 py-3">
        <p className="text-[13px] text-ink-2">
          {TARGET_LABEL[run.target] ?? run.target} · {run.source}
          {run.commit_sha ? ` · ${run.commit_sha.slice(0, 7)}` : ''}
        </p>
        <ul className="grid gap-2">
          {checks.map((c) => {
            const s = STATUS[asStatus(c.status)];
            return (
              <li key={c.scenario} className="flex items-start gap-2 text-[14px]">
                <s.Icon className={cx('mt-0.5 size-4 shrink-0', s.text)} aria-label={s.label} />
                <span className="min-w-0">
                  <b className="font-semibold">{LAB_SCENARIOS[c.scenario as LabScenario].label}</b>
                  {c.latency_ms !== null ? (
                    <span className="text-ink-2"> · {formatMs(c.latency_ms)}</span>
                  ) : null}
                  {c.detail ? (
                    <span className="block break-words text-ink-2">{c.detail}</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        {status === 'fail' ? <Diagnostics value={run.diagnostics} /> : null}
      </div>
    </details>
  );
}

export default function LabPage() {
  const role = useLabRole();
  const runs = useLabRuns();

  if (role.isPending || (role.data && runs.isPending)) return <Splash />;
  if (!role.data) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Laboratório"
        text="Este painel é de quem cuida do Viajei."
      />
    );
  }
  const list = runs.data ?? [];
  const last = list[0];
  const lastStatus = last ? asStatus(last.status) : null;
  const streak = greenStreak(list);
  const typical = typicalLatency(list);
  // "agora" é a hora da última leitura do servidor: render puro, e a conta anda junto com a lista
  const week = passRate(list, new Date(runs.dataUpdatedAt - 7 * 86_400_000));
  const failure = lastFailure(list);
  const failing = last ? failedScenarios(last) : [];

  return (
    <div className="grid gap-5">
      <PageHeader
        back="/perfil"
        title="Laboratório"
        eyebrow={<Chip>{TARGET_LABEL[last?.target ?? 'production'] ?? 'produção'}</Chip>}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={runs.isFetching}
            onClick={() => void runs.refetch()}
            aria-label="Atualizar"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Atualizar
          </Button>
        }
      />

      {!last || !lastStatus ? (
        <EmptyState
          icon={FlaskConical}
          title="Nenhuma execução ainda"
          text="O agente roda todo dia às 3h. Para rodar agora: GitHub → Actions → Laboratório → Run workflow, ou pnpm lab:remote no Mac."
        />
      ) : (
        <>
          <section
            aria-labelledby="h-estado"
            className="grid gap-3 rounded-card bg-night px-5 py-4 text-hud-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.5)]"
          >
            <h2 id="h-estado" className="sr-only">
              Estado agora
            </h2>
            <p className="flex items-center gap-3">
              {(() => {
                const s = STATUS[lastStatus];
                return (
                  <s.Icon
                    className={cx(
                      'size-9 shrink-0',
                      lastStatus === 'pass'
                        ? 'text-[#5BD39A]'
                        : lastStatus === 'fail'
                          ? 'text-[#FF8A8A]'
                          : 'text-hud-muted',
                    )}
                    aria-hidden="true"
                  />
                );
              })()}
              <span className="grid">
                <span className="font-num text-[28px] leading-tight font-semibold">
                  {lastStatus === 'pass'
                    ? 'Tudo verde'
                    : lastStatus === 'fail'
                      ? `Falhou: ${failing.map((f) => LAB_SCENARIOS[f].label).join(', ')}`
                      : 'Última execução pulada'}
                </span>
                <span className="text-[14px] text-hud-muted">
                  {when(last.started_at)} ·{' '}
                  {formatMs(Date.parse(last.finished_at) - Date.parse(last.started_at))}
                  {streak > 1 ? ` · ${streak} execuções verdes seguidas` : ''}
                </span>
              </span>
            </p>
            {lastStatus !== 'pass' && last.summary ? (
              <p className="text-[14px] text-hud-muted">{last.summary}</p>
            ) : null}
          </section>

          <div className="grid grid-cols-3 gap-2">
            <Tile
              label="Atraso"
              value={typical === null ? '—' : formatMs(typical)}
              caption="típico da entrega, últimas 10"
            />
            <Tile label="7 dias" value={`${week.pass}/${week.total}`} caption="execuções verdes" />
            <Tile
              label="Última falha"
              value={failure ? format(new Date(failure.started_at), 'dd/MM') : 'nenhuma'}
              caption={
                failure
                  ? format(new Date(failure.started_at), 'HH:mm')
                  : `nas últimas ${list.length}`
              }
            />
          </div>

          <section aria-labelledby="h-cenarios" className="grid gap-3">
            <h2 id="h-cenarios" className="label-caps text-accent-ink">
              Cenários
            </h2>
            <ul className="grid gap-2">
              {latestChecks(last, LAB_SCENARIO_KEYS).map(({ scenario, check }) => (
                <li key={scenario}>
                  <Card className="grid gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid min-w-0">
                        <span className="text-[17px] font-semibold">
                          {LAB_SCENARIOS[scenario].label}
                        </span>
                        <span className="text-[13px] text-ink-2">
                          {LAB_SCENARIOS[scenario].description}
                        </span>
                      </span>
                      {check ? <StatusBadge status={asStatus(check.status)} /> : null}
                    </div>
                    {check?.detail ? (
                      <p className="flex items-start gap-1.5 text-[14px] break-words text-ink-2">
                        {check.latency_ms !== null && scenario !== 'preparo' ? (
                          <Timer className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        ) : null}
                        {check.detail}
                      </p>
                    ) : null}
                    <HistoryStrip runs={list} scenario={scenario} />
                  </Card>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="h-execucoes" className="grid gap-3">
            <h2 id="h-execucoes" className="label-caps text-accent-ink">
              Execuções
            </h2>
            <div className="grid gap-2">
              {list.slice(0, 20).map((r) => (
                <RunDetails key={r.id} run={r} />
              ))}
            </div>
          </section>
        </>
      )}

      <p className="text-[13px] text-ink-2">
        O agente roda sozinho todo dia às 3h, nas máquinas do GitHub, contra a produção, como dois
        aparelhos de mentira: monta viagens de hoje, espera o cron mandar os avisos e confere o que
        chegou. Para rodar agora: GitHub → Actions → Laboratório → Run workflow, ou pnpm lab:remote.
        A entrega real no iPhone e no Android continua sendo do teste manual.
      </p>
    </div>
  );
}
