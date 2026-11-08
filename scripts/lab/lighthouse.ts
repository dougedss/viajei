import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import lighthouse from 'lighthouse';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import type { Check } from './evaluate.ts';
import {
  belowTarget,
  CATEGORIES,
  LIGHTHOUSE_RUNS,
  median,
  verdict,
  type Category,
  type Scores,
} from './lighthouse-score.ts';
import type { Session } from './session.ts';

/**
 * `lighthouse` (fase 12): desempenho, acessibilidade e boas práticas no perfil de celular do
 * Lighthouse (o padrão: Moto G Power, CPU 4× mais lenta, 4G lento simulado), pela mediana de 3
 * execuções, porque a máquina do GitHub varia. A categoria PWA saiu do Lighthouse na versão 12 (a
 * 13.5.0 tem performance, accessibility, best-practices, seo e agentic-browsing): no lugar dela, os
 * critérios de instalação pelo DevTools Protocol (`Page.getInstallabilityErrors` vazio, o manifest
 * sem erro e o service worker controlando a página).
 *
 * O Lighthouse mede no mesmo navegador em que o lab-a entrou (um perfil persistente com a porta de
 * depuração aberta). A tela de entrar é a primeira visita, e mede fria: o reset padrão limpa o
 * service worker, o Cache Storage e o cache HTTP (não o IndexedDB nem os cookies). As telas de quem
 * entrou medem como abrem de verdade, com o service worker e o precache no lugar: só se chega a elas
 * depois de entrar, e entrar já instalou o app (D162). Elas também medem frias, uma vez cada, só para
 * registro (`frias`). A maquete em WebGL por software não representa um celular: o Modo Viagem entra
 * pela lista (`?render=list`), e a rota 3D fica fora da meta.
 */
const PORT = 9333;

export type LighthouseContext = {
  appUrl: string;
  bypass: string | null;
  a: Session;
  email: string;
  password: string;
  /** onde guardar o relatório inteiro da última execução de cada rota (a tarefa medir-desempenho) */
  reportsDir?: string;
};

type Run = { scores: Scores; lcp_ms: number; tbt_ms: number; cls: number; benchmark: number };
type Lhr = NonNullable<Awaited<ReturnType<typeof lighthouse>>>['lhr'];

/** O que o relatório diz do porquê, em poucas linhas: o elemento do LCP, o que mexe, o JS que pesa. */
function diagnose(lhr: Lhr) {
  type Item = Record<string, unknown>;
  const items = (id: string): Item[] => {
    const details = lhr.audits[id]?.details as { items?: Item[] } | undefined;
    return details?.items ?? [];
  };
  const node = (item: Item | undefined) => {
    const n = item?.node as { selector?: string; snippet?: string } | undefined;
    return n ? `${n.selector ?? ''} ${(n.snippet ?? '').slice(0, 80)}` : null;
  };
  const lcpItem = (items('largest-contentful-paint-element')[0]?.items as Item[] | undefined)?.[0];
  return {
    benchmark: lhr.environment.benchmarkIndex,
    lcp_element: node(lcpItem),
    lcp_phases: items('largest-contentful-paint-element')[1]?.items ?? null,
    shifts: items('layout-shifts')
      .slice(0, 4)
      .map((i) => `${String(Math.round(Number(i.score) * 1000) / 1000)} ${node(i) ?? ''}`),
    bootup: items('bootup-time')
      .slice(0, 5)
      .map(
        (i) => `${String(Math.round(Number(i.total)))} ms ${String(i.url).split('/').pop() ?? ''}`,
      ),
    bytes_kb: Math.round((lhr.audits['total-byte-weight']?.numericValue ?? 0) / 1024),
    requests: items('network-requests').length,
    // as regras de acessibilidade que falharam, com o primeiro elemento de cada (fase 14: a tela da
    // viagem com a lista deu 96, como na fase 13 inteira, e o laboratório não dizia por quê)
    a11y: (lhr.categories.accessibility?.auditRefs ?? [])
      .map((ref) => lhr.audits[ref.id])
      .filter((a) => a?.scoreDisplayMode === 'binary' && a.score !== null && a.score < 1)
      .map((a) => `${a?.id ?? ''} ${node(items(a?.id ?? '')[0]) ?? ''}`.trim()),
  };
}

/** `warm`: sem o reset do Lighthouse, com o service worker e o precache do app no lugar. */
async function measure(url: string, warm: boolean): Promise<{ run: Run; lhr: Lhr }> {
  const result = await lighthouse(url, {
    port: PORT,
    output: 'json',
    logLevel: 'error',
    onlyCategories: [...CATEGORIES],
    disableStorageReset: warm,
  });
  if (!result) throw new Error('o Lighthouse não devolveu resultado');
  const { lhr } = result;
  if (lhr.runtimeError) throw new Error(`Lighthouse: ${lhr.runtimeError.code}`);
  const score = (c: Category) => Math.round((lhr.categories[c]?.score ?? 0) * 100);
  const audit = (id: string) => lhr.audits[id]?.numericValue ?? 0;
  const run: Run = {
    scores: {
      performance: score('performance'),
      accessibility: score('accessibility'),
      'best-practices': score('best-practices'),
    },
    lcp_ms: Math.round(audit('largest-contentful-paint')),
    tbt_ms: Math.round(audit('total-blocking-time')),
    cls: Math.round(audit('cumulative-layout-shift') * 1000) / 1000,
    benchmark: lhr.environment.benchmarkIndex,
  };
  return { run, lhr };
}

/** As execuções e a mediana de cada número; o porquê e o relatório, da última. */
async function runs(
  url: string,
  key: string,
  reportsDir: string | undefined,
  { warm, count = LIGHTHOUSE_RUNS }: { warm: boolean; count?: number },
) {
  const all: Run[] = [];
  let last: Lhr | null = null;
  for (let i = 0; i < count; i++) {
    const { run, lhr } = await measure(url, warm);
    all.push(run);
    last = lhr;
  }
  if (last && reportsDir) {
    await mkdir(reportsDir, { recursive: true });
    const name = `lighthouse-${key}${warm ? '' : '-fria'}.json`;
    await writeFile(join(reportsDir, name), JSON.stringify(last));
  }
  const med = (pick: (r: Run) => number) => median(all.map(pick));
  return {
    scores: {
      performance: med((r) => r.scores.performance),
      accessibility: med((r) => r.scores.accessibility),
      'best-practices': med((r) => r.scores['best-practices']),
    },
    lcp_ms: med((r) => r.lcp_ms),
    tbt_ms: med((r) => r.tbt_ms),
    cls: med((r) => r.cls),
    performance_runs: all.map((r) => r.scores.performance),
    /** o índice de CPU da máquina em cada execução: a nota se lê com ele (fase 13) */
    benchmarks: all.map((r) => Math.round(r.benchmark)),
    porque: last ? diagnose(last) : null,
  };
}

/** Os critérios de instalação que a categoria PWA do Lighthouse conferia. */
async function installability(context: BrowserContext, page: Page) {
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  let controlled = false;
  for (let i = 0; i < 30 && !controlled; i++) {
    controlled = (await page.evaluate('navigator.serviceWorker.controller !== null')) === true;
    if (!controlled) await page.waitForTimeout(500);
  }
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  const manifest = (await cdp.send('Page.getAppManifest')) as {
    url: string;
    errors: { message: string }[];
  };
  await cdp.detach();
  return {
    errors: installabilityErrors.map((e) => e.errorId),
    manifest: manifest.url !== '' && manifest.errors.length === 0,
    manifest_errors: manifest.errors.map((e) => e.message),
    service_worker: controlled,
  };
}

export async function labLighthouse(ctx: LighthouseContext, today: string): Promise<Check> {
  const startedAt = Date.now();
  const trip = await uuidV5(ctx.a.uid, 'lab:estrada');
  const day = await uuidV5(trip, today);
  const routes = [
    { key: 'entrar', path: '/entrar', session: false },
    // a lista: `/viagens` nunca redireciona (o `/` cai no Modo Viagem com viagem de hoje, D33)
    { key: 'viagens', path: '/viagens', session: true },
    // as chaves ficam as da D162 para os números continuarem comparáveis; desde a fase 14 a viagem é o
    // mapa: `visao_geral` mede Detalhes e `modo_viagem` mede a tela da viagem pela lista do dia
    { key: 'visao_geral', path: `/viagens/${trip}/detalhes`, session: true },
    { key: 'roteiro_dia', path: `/viagens/${trip}/roteiro/${day}`, session: true },
    { key: 'modo_viagem', path: `/viagens/${trip}?render=list`, session: true },
  ];
  const dir = await mkdtemp(join(tmpdir(), 'viajei-lighthouse-'));
  let context: BrowserContext | null = null;
  const results: Record<string, Awaited<ReturnType<typeof runs>>> = {};
  const cold: Record<string, Awaited<ReturnType<typeof runs>>> = {};
  let install: Awaited<ReturnType<typeof installability>> | null = null;
  let failure: string | null = null;
  try {
    context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [`--remote-debugging-port=${String(PORT)}`],
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    });
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(TIMEOUT);
    await enterPreview(page, ctx.appUrl, ctx.bypass);
    await page.goto(`${ctx.appUrl}/entrar`);
    // os cartões de conquista desligados no perfil (D119): fica no localStorage da origem
    await page.evaluate(QUIET);
    // a tela de entrar é a primeira visita: fria, como o Lighthouse mede por padrão
    for (const r of routes.filter((x) => !x.session)) {
      results[r.key] = await runs(`${ctx.appUrl}${r.path}`, r.key, ctx.reportsDir, {
        warm: false,
      });
    }
    await signInPage(page, ctx.appUrl, ctx.email, ctx.password);
    // o aparelho puxa as viagens do lab-a antes de medir (a primeira abertura é do sync, não da tela)
    await page.goto(`${ctx.appUrl}/viagens/${trip}/detalhes`);
    await page.getByRole('heading', { name: 'Laboratório · estrada' }).waitFor({ timeout: 30_000 });
    install = await installability(context, page);
    // as telas de quem entrou: com o service worker e o precache, que é como elas abrem de verdade
    // (só se chega a elas depois de entrar, e entrar já instalou o app); a meta vale aqui
    const session = routes.filter((x) => x.session);
    for (const r of session) {
      results[r.key] = await runs(`${ctx.appUrl}${r.path}`, r.key, ctx.reportsDir, { warm: true });
    }
    // e frias, uma vez cada, só para registro: o reset tira o service worker (D162)
    for (const r of session) {
      cold[r.key] = await runs(`${ctx.appUrl}${r.path}`, r.key, ctx.reportsDir, {
        warm: false,
        count: 1,
      });
    }
  } catch (err) {
    failure = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? 'falhou';
  } finally {
    await context?.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  const scores = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.scores]));
  const below = belowTarget(scores);
  // a máquina do dia: a mediana do índice de CPU de todas as execuções que contam para a meta
  const benchmarks = Object.values(results).flatMap((r) => r.benchmarks);
  const benchmark = benchmarks.length > 0 ? median(benchmarks) : null;
  const problems = [
    ...(failure ? [failure] : []),
    ...(install && install.errors.length > 0 ? [`instalação: ${install.errors.join(', ')}`] : []),
    ...(install && !install.manifest ? ['o manifest tem erro'] : []),
    ...(install && !install.service_worker ? ['o service worker não assumiu a página'] : []),
  ];
  const range = (c: Category) => {
    const v = Object.values(scores).map((s) => s[c]);
    return v.length ? `${String(Math.min(...v))}–${String(Math.max(...v))}` : '?';
  };
  const result = verdict({
    below,
    benchmark,
    problems,
    ok: `Mediana de ${String(LIGHTHOUSE_RUNS)} no celular (entrar fria; as de dentro com o app instalado): desempenho ${range('performance')}, acessibilidade ${range('accessibility')}, boas práticas ${range('best-practices')}; instalável`,
  });
  return {
    scenario: 'lighthouse',
    status: result.status,
    latency_ms: Date.now() - startedAt,
    detail: result.detail.slice(0, 900),
    data: {
      versao: '13.5.0',
      indice_cpu: benchmark,
      rotas: results,
      frias: Object.fromEntries(
        Object.entries(cold).map(([k, v]) => [
          k,
          { ...v.scores, lcp_ms: v.lcp_ms, tbt_ms: v.tbt_ms },
        ]),
      ),
      instalacao: install,
    },
  };
}
