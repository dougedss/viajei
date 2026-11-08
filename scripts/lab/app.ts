import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  chromium,
  devices,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Worker,
} from '@playwright/test';
import { ROLAGEM_LATERAL } from '../../src/features/lab/guards.ts';
import type { LabScenario } from '../../src/features/lab/scenarios.ts';
import type { Check } from './evaluate.ts';

/**
 * O teste manual, simulado num navegador de verdade (Chromium, perfil de Android) contra o app
 * publicado. Duas peças são substituídas, porque não existem num robô:
 *  - o registro no serviço de push do navegador (FCM): `PushManager.subscribe` devolve uma assinatura
 *    que aponta para o receptor do laboratório, com chaves que o executor guarda. Todo o resto é o
 *    código real: a folha "Avisos da viagem", `subscribePush`, a linha em `push_subscriptions`;
 *  - o dedo na notificação: o evento `notificationclick` é disparado dentro do service worker de
 *    verdade, com a notificação que ele mesmo mostrou.
 * A mensagem que chega ao service worker é a que o servidor de verdade mandou, já decifrada, entregue
 * pelo DevTools Protocol (`ServiceWorker.deliverPushMessage`), como o navegador entregaria.
 * Os trechos que rodam no navegador são strings: o tsconfig dos scripts não tem a lib DOM.
 */
export type AppTarget = {
  appUrl: string;
  email: string;
  password: string;
  tripId: string;
  originName: string;
  destinationName: string;
  departureTime: string;
  destination: { latitude: number; longitude: number };
  subscription: { endpoint: string; p256dh: string; auth: string };
  artifactsDir: string;
  /**
   * O segredo do "Protection Bypass for Automation" da Vercel, só para testar o preview de uma
   * branch. Vai uma vez, na primeira navegação de cada contexto, como parâmetro: a Vercel grava um
   * cookie e o resto (inclusive o service worker) entra por ele. Nunca como cabeçalho extra, que
   * iria também para o Supabase e cairia no CORS.
   */
  bypass: string | null;
};

export type App = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  target: AppTarget;
  cdp: CDPSession | null;
  registrationId: string | null;
  /** os erros que a página do app soltou até agora (exceções e `console.error`) */
  errors: () => string[];
};

type Step = { step: string; ok: boolean; ms: number; detail?: string };

/**
 * As tarefas longas da thread principal (50 ms ou mais), desde que a página abriu: é o que diz se o
 * app estava ocupado enquanto um passo esperava (fase 13). Entra como script de início do contexto;
 * `longTasksAround` resume em volta de um instante.
 */
export const LONG_TASKS_INIT = `(() => {
  const tasks = [];
  globalThis.__viajeiLongTasks = tasks;
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        tasks.push([Math.round(performance.timeOrigin + e.startTime), Math.round(e.duration)]);
        if (tasks.length > 3000) tasks.shift();
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();`;

export function longTasksAround(tasks: readonly [number, number][], at: number) {
  const sum = (xs: readonly [number, number][]) => ({
    quantas: xs.length,
    total_ms: xs.reduce((acc, [, d]) => acc + d, 0),
    maior_ms: xs.reduce((acc, [, d]) => Math.max(acc, d), 0),
  });
  const rel = (t: number) => {
    const sec = ((t - at) / 1000).toFixed(1);
    return sec.startsWith('-') ? `${sec}s` : `+${sec}s`;
  };
  return {
    antes: sum(tasks.filter(([t, d]) => t + d <= at)),
    depois: sum(tasks.filter(([t, d]) => t + d > at)),
    maiores: [...tasks]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, d]) => `${rel(t)} ${String(d)} ms`),
  };
}

/** Os erros da página (exceções e `console.error`), para a falha dizer o que o app disse. */
export function watchErrors(page: Page): () => string[] {
  const errors: string[] = [];
  const push = (text: string) => {
    errors.push(text.split('\n')[0]?.slice(0, 300) ?? '');
    if (errors.length > 20) errors.shift();
  };
  page.on('pageerror', (err) => push(`erro: ${err.message}`));
  page.on('console', (msg) => {
    // a barra da Vercel bloqueada pelo próprio laboratório (D106) não é erro do app
    if (msg.type() === 'error' && !msg.text().includes('ERR_BLOCKED_BY_CLIENT')) {
      push(`console: ${msg.text()}`);
    }
  });
  return () => [...errors];
}

/** O que a página do app estava fazendo num instante: as tarefas longas, os toasts e os erros. */
const PAGE_DIAG = `(() => ({
  tasks: globalThis.__viajeiLongTasks || [],
  toasts: [...document.querySelectorAll('[role=status]')].map((el) => (el.textContent || '').trim().slice(0, 80)),
  permissao: typeof Notification === 'undefined' ? 'sem Notification' : Notification.permission,
  visibilidade: document.visibilityState,
}))()`;

type PageDiag = {
  tasks: [number, number][];
  toasts: string[];
  permissao: string;
  visibilidade: string;
};

/** Um diagnóstico curto da página em volta de `at`, para a mensagem da falha. */
export async function pageDiagnosis(app: App, at: number): Promise<string> {
  const d = await app.page.evaluate<PageDiag>(PAGE_DIAG).catch(() => null);
  if (!d) return JSON.stringify({ erros: app.errors() });
  return JSON.stringify({
    tarefas_longas: longTasksAround(d.tasks, at),
    toasts: d.toasts,
    permissao: d.permissao,
    visibilidade: d.visibilidade,
    erros: app.errors().slice(-5),
  });
}
export const TIMEOUT = 20_000;

/**
 * Por que a folha "Avisos da viagem" não apareceu (fase 13): o que a regra `shouldOfferPush` olha,
 * lido do app na hora da falha (o service worker, a permissão, as marcas de primeira abertura e de
 * "já perguntei" no `sync_state`, os diálogos abertos). Sem valores de linha.
 */
const PUSH_ASK_DIAG = `(async () => {
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const rows = await new Promise((resolve) => {
    const all = db.transaction('sync_state').objectStore('sync_state').getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => resolve([]);
  });
  db.close();
  const titles = [...document.querySelectorAll('[role=dialog]')].map((d) => {
    const id = d.getAttribute('aria-labelledby');
    return (id && document.getElementById(id)?.textContent) || d.getAttribute('aria-label') || '?';
  });
  return {
    sw: !!reg,
    controlado: !!navigator.serviceWorker.controller,
    permissao: typeof Notification === 'undefined' ? 'sem Notification' : Notification.permission,
    chaves: rows.map((r) => r.key).filter((k) => k.startsWith('app:') || k.startsWith('push:')),
    dialogos: titles,
    standalone: matchMedia('(display-mode: standalone)').matches,
  };
})()`;

/** O perfil de aparelho dos dois contextos: Pixel 7, pt-BR, fuso de São Paulo. */
export const DEVICE = {
  ...devices['Pixel 7'],
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
} as const;

/** De onde vem a barra de ferramentas que a Vercel injeta nos previews. */
const VERCEL_TOOLBAR = 'https://vercel.live/**';

/**
 * A primeira navegação de um contexto no preview de uma branch. O segredo do bypass vai como
 * parâmetro, e a Vercel grava um cookie. A barra de ferramentas da Vercel flutua na borda direita,
 * por cima de botões do app, e por isso o script dela fica bloqueado no contexto. O cabeçalho
 * `x-vercel-skip-toolbar` da documentação não serve: iria também ao Supabase, e o `index.html`
 * guardado pelo service worker já viria com a barra.
 */
export async function enterPreview(
  page: Page,
  appUrl: string,
  bypass: string | null,
): Promise<void> {
  if (!bypass) return;
  await page.context().route(VERCEL_TOOLBAR, (route) => route.abort('blockedbyclient'));
  const url = new URL(appUrl);
  url.searchParams.set('x-vercel-protection-bypass', bypass);
  url.searchParams.set('x-vercel-set-bypass-cookie', 'true');
  await page.goto(url.toString());
}

/** Entrar pela tela de entrar, como uma pessoa. */
export async function signInPage(
  page: Page,
  appUrl: string,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${appUrl}/entrar`);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
}

/**
 * Um segundo aparelho no mesmo navegador (o lab-b): outro contexto, outro Dexie, outra sessão. Sem
 * push nem posição: ele só olha o que o sync trouxe.
 */
export async function openPeer(
  browser: Browser,
  appUrl: string,
  bypass: string | null,
  email: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...DEVICE, permissions: [] });
  await context.addInitScript({ content: QUIET });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  await enterPreview(page, appUrl, bypass);
  await signInPage(page, appUrl, email, password);
  return { context, page };
}

/**
 * Os cartões de conquista (fase 9) desligados neste aparelho: os cenários das fases anteriores
 * passam por telas calmas (a visão geral, a garagem) e um cartão modal cobriria o botão do passo
 * seguinte. Só o cenário da progressão liga (`app-progress.ts`).
 */
export const QUIET = `localStorage.setItem('viajei:celebrations', 'off');`;

/** O `PushManager` do app passa a falar com o receptor do laboratório; a folha de compartilhar some (o .ics vira download). */
function initScript(sub: AppTarget['subscription']): string {
  return `(() => {
    const KEY = 'viajei-lab:push';
    const sub = ${JSON.stringify(sub)};
    const make = () => ({
      endpoint: sub.endpoint,
      expirationTime: null,
      options: { userVisibleOnly: true, applicationServerKey: null },
      getKey: () => null,
      toJSON: () => ({ endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.p256dh, auth: sub.auth } }),
      unsubscribe: () => { localStorage.removeItem(KEY); return Promise.resolve(true); },
    });
    if (typeof PushManager !== 'undefined') {
      PushManager.prototype.subscribe = function () { localStorage.setItem(KEY, '1'); return Promise.resolve(make()); };
      PushManager.prototype.getSubscription = function () { return Promise.resolve(localStorage.getItem(KEY) ? make() : null); };
    }
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  })();`;
}

export async function openApp(target: AppTarget): Promise<App> {
  await mkdir(target.artifactsDir, { recursive: true });
  // canal "chromium": o headless novo, o Chrome inteiro (o headless shell não tem notificações)
  const browser = await chromium.launch({ channel: 'chromium' });
  const context = await browser.newContext({
    ...DEVICE,
    geolocation: target.destination,
    // nenhuma permissão de saída: como num aparelho de verdade, elas só existem depois do toque
    permissions: [],
    acceptDownloads: true,
  });
  await context.addInitScript({ content: initScript(target.subscription) });
  await context.addInitScript({ content: QUIET });
  await context.addInitScript({ content: LONG_TASKS_INIT });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  const errors = watchErrors(page);
  // o Chromium sem tela responde "negado" a notificações que ninguém concedeu; num aparelho de
  // verdade o estado é "ainda não perguntado" (prompt), e é ele que faz a folha de avisos aparecer
  const session = await context.newCDPSession(page);
  const { targetInfo } = await session.send('Target.getTargetInfo');
  await session.send('Browser.setPermission', {
    permission: { name: 'notifications' },
    setting: 'prompt',
    origin: new URL(target.appUrl).origin,
    ...(targetInfo.browserContextId ? { browserContextId: targetInfo.browserContextId } : {}),
  });
  await session.detach();
  await enterPreview(page, target.appUrl, target.bypass);
  return { browser, context, page, target, cdp: null, registrationId: null, errors };
}

export async function closeApp(app: App): Promise<void> {
  await app.context.close().catch(() => undefined);
  await app.browser.close().catch(() => undefined);
}

function result(scenario: LabScenario, steps: Step[], ok: string, startedAt: number): Check {
  const failed = steps.find((s) => !s.ok);
  return {
    scenario,
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}` : ok,
    data: { passos: steps },
  };
}

/** Roda os passos em ordem; o primeiro que falha para o cenário e deixa um print. */
export async function runSteps(
  app: App,
  scenario: LabScenario,
  ok: string,
  steps: [string, () => Promise<void>][],
): Promise<Check> {
  const startedAt = Date.now();
  const done: Step[] = [];
  for (const [step, run] of steps) {
    const t0 = Date.now();
    try {
      await run();
      done.push({ step, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      done.push({ step, ok: false, ms: Date.now() - t0, detail: message.slice(0, 900) });
      await app.page
        .screenshot({ path: join(app.target.artifactsDir, `${scenario}.png`), fullPage: true })
        .catch(() => undefined);
      break;
    }
  }
  return result(scenario, done, ok, startedAt);
}

/** A tela da viagem (`/viagens/:id`, o mapa desde a fase 14), ou uma tela de detalhe dela. */
const tripUrl = (t: AppTarget, path = '') =>
  `${t.appUrl}/viagens/${t.tripId}${path && !path.startsWith('?') ? `/${path}` : path}`;
/**
 * A tela da viagem sem a maquete. Desde a D61 quem conta o que aconteceu é um só: com maquete, o replay;
 * sem ela (ou com "reduzir movimento"), o card "Desde a última vez". Os cenários do card abrem assim;
 * a maquete tem o cenário dela (`appMaquete`).
 */
const listUrl = (t: AppTarget) => `${tripUrl(t)}?render=list`;

/** Entrar, abrir o "Agora", a folha de avisos na segunda abertura, ativar e conferir em /avisos. */
export function appAvisos(app: App): Promise<Check> {
  const { page, target } = app;
  const info: Record<string, unknown> = {};
  return runSteps(
    app,
    'app_avisos',
    'Entrou, viu o "Agora", ativou os avisos pela folha e /avisos diz "Avisos ligados"',
    [
      [
        'entrar',
        async () => {
          await signInPage(page, target.appUrl, target.email, target.password);
        },
      ],
      [
        'service worker ativo',
        async () => {
          await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
        },
      ],
      [
        'abrir o "Agora" (segunda abertura do app)',
        async () => {
          await page.goto(tripUrl(target));
          await page.getByRole('heading', { name: 'Agora' }).waitFor();
          await page.getByText(target.originName).first().waitFor();
          await page
            .getByText(new RegExp(`sair às\\s*${target.departureTime}`))
            .first()
            .waitFor();
        },
      ],
      [
        'folha "Avisos da viagem"',
        async () => {
          const sheet = page.getByRole('dialog', { name: 'Avisos da viagem' });
          try {
            await sheet.waitFor();
          } catch (err) {
            const diag: unknown = await page.evaluate(PUSH_ASK_DIAG).catch(() => null);
            const message = err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
            throw new Error(`${message}; o app: ${JSON.stringify(diag)}`, { cause: err });
          }
          // o "Permitir" do navegador, no toque em "Ativar avisos"
          await app.context.grantPermissions(['notifications'], { origin: target.appUrl });
          await sheet.getByRole('button', { name: 'Ativar avisos' }).click();
          const clickedAt = Date.now();
          // a ativação se prova pelo que fica: a folha fecha quando termina e /avisos diz "Avisos
          // ligados" no passo seguinte (e o push de verdade usa a assinatura logo depois). O toast é
          // efêmero: em WebGL por software, a maquete trava a thread por uns 6 s logo depois do
          // toque, e o toast de 4 s nasce e morre dentro do congelamento, invisível (fase 13)
          const toast = page
            .getByText('Avisos ativados')
            .waitFor()
            .then(() => 'o toast "Avisos ativados"');
          const closed = sheet.waitFor({ state: 'hidden' }).then(() => 'a folha fechou');
          toast.catch(() => undefined);
          closed.catch(() => undefined);
          try {
            info.ativacao = await Promise.race([toast, closed]);
          } catch (err) {
            const message = err instanceof Error ? (err.message.split('\n')[0] ?? '') : String(err);
            throw new Error(
              `${message} (nem o toast nem a folha fechada depois do toque); a página: ${await pageDiagnosis(app, clickedAt)}`,
              { cause: err },
            );
          }
        },
      ],
      [
        '/avisos mostra "Avisos ligados"',
        async () => {
          await page.goto(tripUrl(target, 'avisos'));
          await page.getByText('Avisos ligados').waitFor();
        },
      ],
      [
        'voltar ao "Agora" e deixar aberto',
        async () => {
          await page.goto(tripUrl(target));
          await page.getByRole('heading', { name: 'Agora' }).waitFor();
          // o travel_state é salvo a cada 30 s visível; a CDP fica pronta antes de "fechar o app"
          app.cdp = await app.context.newCDPSession(page);
          const registered = new Promise<string>((resolve) => {
            app.cdp?.on('ServiceWorker.workerRegistrationUpdated', (e) => {
              const r = e.registrations.find(
                (x) => x.scopeURL.startsWith(target.appUrl) && !x.isDeleted,
              );
              if (r) resolve(r.registrationId);
            });
          });
          await app.cdp.send('ServiceWorker.enable');
          app.registrationId = await Promise.race([
            registered,
            new Promise<string>((_, reject) =>
              setTimeout(
                () => reject(new Error('registro do service worker não apareceu')),
                TIMEOUT,
              ),
            ),
          ]);
        },
      ],
    ],
  ).then((check) => ({ ...check, data: { ...check.data, ...info } }));
}

async function serviceWorker(app: App): Promise<Worker> {
  const running = app.context.serviceWorkers().find((w) => w.url().startsWith(app.target.appUrl));
  return running ?? app.context.waitForEvent('serviceworker', { timeout: TIMEOUT });
}

type Shown = { title: string; body: string; tag: string; actions: string[] };

async function notifications(sw: Worker): Promise<Shown[]> {
  return sw.evaluate(
    `self.registration.getNotifications().then((ns) => ns.map((n) => ({ title: n.title, body: n.body, tag: n.tag, actions: (n.actions || []).map((a) => a.action) })))`,
  );
}

async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, what: string): Promise<T> {
  const end = Date.now() + TIMEOUT;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`${what} (último: ${JSON.stringify(v).slice(0, 200)})`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Com o app fechado: o push que o servidor mandou chega ao service worker, que mostra "Hora de sair"
 * com Partiu!; o toque em Partiu! grava pela mutate e envia a fila sem abrir o app. Quem confere o
 * servidor é o executor (`serverMarked`).
 */
export function appNotificacao(
  app: App,
  payloadJson: string | null,
  tag: string,
  serverMarked: () => Promise<void>,
): Promise<Check> {
  const { page, target } = app;
  let sw: Worker | null = null;
  return runSteps(
    app,
    'app_notificacao',
    '"Hora de sair" com Partiu! no aparelho; o toque marcou a saída com o app fechado',
    [
      [
        'o push do servidor chegou ao aparelho',
        async () => {
          if (!payloadJson)
            throw new Error('o servidor não mandou o "hora de sair" para a assinatura do app');
          if (!app.cdp || !app.registrationId) throw new Error('sem a sessão do DevTools');
          await page.goto('about:blank'); // o app fecha
          await app.cdp.send('ServiceWorker.deliverPushMessage', {
            origin: new URL(target.appUrl).origin,
            registrationId: app.registrationId,
            data: payloadJson,
          });
        },
      ],
      [
        'notificação "Hora de sair" com Partiu!',
        async () => {
          sw = await serviceWorker(app);
          const worker = sw;
          await until(
            () => notifications(worker),
            (ns) =>
              ns.some(
                (n) =>
                  n.tag === tag && n.title === 'Hora de sair' && n.actions.includes('departed'),
              ),
            'a notificação não apareceu como esperado',
          );
        },
      ],
      [
        'tocar em Partiu! com o app fechado',
        async () => {
          const worker = sw ?? (await serviceWorker(app));
          // o NotificationEvent é o de verdade, com a notificação que o próprio service worker mostrou
          await worker.evaluate(
            `self.registration.getNotifications({ tag: ${JSON.stringify(tag)} }).then(([n]) => { self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n, action: 'departed' })); return true; })`,
          );
          await until(
            () => notifications(worker),
            (ns) =>
              ns.some(
                (n) =>
                  n.tag === tag && n.title.startsWith('Saímos') && n.body.startsWith('Marcado às'),
              ),
            'a confirmação "Saímos … · Marcado às" não substituiu o aviso',
          );
        },
      ],
      ['o servidor recebeu a saída', serverMarked],
    ],
  );
}

/**
 * Ao reabrir, na lista: "Desde a última vez" mostra a saída; com a posição na parada, Chegamos!
 * sozinho, e a pergunta "Como foi?" vira o card discreto, sem abrir a folha (D83).
 */
export function appReabrir(app: App, serverMarked: () => Promise<void>): Promise<Check> {
  const { page, target } = app;
  return runSteps(
    app,
    'app_reabrir',
    '"Desde a última vez" mostrou a saída; a posição marcou Chegamos! e o "Como foi?" veio como card',
    [
      [
        'reabrir o "Agora" na lista',
        async () => {
          await page.goto(listUrl(target));
          await page.getByRole('heading', { name: 'Agora' }).waitFor();
        },
      ],
      [
        '"Desde a última vez" mostra a saída',
        async () => {
          await page.getByRole('heading', { name: 'Desde a última vez' }).waitFor();
          await page
            .getByText(new RegExp(`Saímos: ${target.originName}`))
            .first()
            .waitFor();
        },
      ],
      [
        'usar a posição: Chegamos! no destino',
        async () => {
          // o "Permitir" da localização, no toque em "Usar posição"
          await app.context.grantPermissions(['geolocation'], { origin: target.appUrl });
          await page.getByRole('button', { name: 'Usar posição' }).click();
          await page.getByText(`Chegamos: ${target.destinationName}`).first().waitFor();
        },
      ],
      ['o servidor recebeu a chegada', serverMarked],
      [
        'o "Como foi?" vem como card, sem abrir a folha',
        async () => {
          const question = `Como foi ${target.destinationName}?`;
          await page.getByRole('region', { name: question }).waitFor();
          if ((await page.getByRole('dialog', { name: question }).count()) > 0) {
            throw new Error('a folha abriu sozinha numa chegada pela posição');
          }
        },
      ],
    ],
  );
}

/** Modo painel liga e desliga; o dia sai como .ics. */
/**
 * As telas da viagem do laboratório que a guarda da rolagem lateral confere todo dia na produção
 * (fase 13): as mesmas rotas da suíte e2e, com as viagens do lab-a, no perfil de Pixel 7 (412 px).
 */
const TELAS_DA_VIAGEM = [
  '?render=list',
  '',
  'detalhes',
  'roteiro',
  'reservas',
  'checklists?aba=antes',
  'checklists?aba=missoes',
  'contatos',
  'gastos',
  'mapa',
  'diario',
  'avisos',
  'membros',
  'garagem?render=list',
] as const;

export function appExtras(app: App): Promise<Check> {
  const { page, target } = app;
  return runSteps(
    app,
    'app_extras',
    'Modo painel ligou e desligou; o .ics do dia baixou com o destino; nenhuma tela rola para o lado',
    [
      [
        'abrir o "Agora"',
        async () => {
          if (new URL(page.url()).pathname !== new URL(tripUrl(target)).pathname) {
            await page.goto(listUrl(target));
          }
          await page.getByRole('heading', { name: 'Agora' }).waitFor();
        },
      ],
      [
        'ligar o modo painel',
        async () => {
          const toggle = page.getByRole('button', { name: 'Modo painel' });
          await toggle.click();
          await until(
            () => toggle.getAttribute('aria-pressed'),
            (v) => v === 'true',
            'o botão não ficou ligado',
          );
          // ligado, a barra do "Agora" diz que a posição está sendo acompanhada
          await page.locator('[data-gps]').waitFor();
        },
      ],
      [
        'desligar o modo painel',
        async () => {
          await page.getByRole('button', { name: 'Modo painel' }).click();
          await page.locator('[data-gps]').waitFor({ state: 'detached' });
        },
      ],
      [
        'exportar o dia (.ics), em Detalhes',
        async () => {
          await page.goto(tripUrl(target, 'detalhes'));
          const download = page.waitForEvent('download');
          await page.getByRole('button', { name: 'Exportar o dia' }).click();
          const file = await download;
          const path = join(target.artifactsDir, file.suggestedFilename());
          await file.saveAs(path);
          const text = await readFile(path, 'utf8');
          if (!text.startsWith('BEGIN:VCALENDAR')) throw new Error('o arquivo não é um VCALENDAR');
          if (!text.includes(`SUMMARY:${target.destinationName}`))
            throw new Error('o destino não está no .ics');
        },
      ],
      [
        'nenhuma tela rola para o lado',
        async () => {
          const achados: string[] = [];
          for (const path of TELAS_DA_VIAGEM) {
            await page.goto(tripUrl(target, path));
            await page.locator('h1').first().waitFor();
            // o roteiro do dia: pela lista, porque o id do dia é de quem preparou a viagem
            for (const a of await page.evaluate<string[]>(ROLAGEM_LATERAL)) {
              achados.push(`/${path}: ${a}`);
            }
          }
          await page.goto(`${target.appUrl}/viagens`);
          await page.locator('h1').first().waitFor();
          for (const a of await page.evaluate<string[]>(ROLAGEM_LATERAL))
            achados.push(`/viagens: ${a}`);
          if (achados.length > 0) throw new Error(achados.join(' || '));
        },
      ],
    ],
  );
}

/** O SwiftShader do Chromium sem tela compila os shaders da cena devagar (o e2e espera 60 s). */
const WORLD_TIMEOUT = 90_000;

/**
 * A maquete, sem prender o laboratório a fps: monta com um motor de verdade (WebGPU ou WebGL2), as
 * pílulas aparecem por cima, e o "Rever o dia" anda até o fim. O movimento é medido pelo relógio,
 * não por quadros: o "Pular" aparecer prova que o laço de quadros começou o movimento, e o "Rever o
 * dia" voltar prova que ele terminou. O replay ao abrir não serve aqui: o `app_reabrir` já mostrou os
 * eventos pelo card. Motor e tempos ficam em `data`, só como informação.
 */
export function appMaquete(app: App): Promise<Check> {
  const { page, target } = app;
  const info: Record<string, unknown> = {};
  const world = page.locator('[data-world="webgl2"], [data-world="webgpu"]');
  const hud = page.locator('[data-world-hud]');
  return runSteps(app, 'app_maquete', 'A maquete montou com as pílulas e o "Rever o dia" andou', [
    [
      'abrir o "Agora" com a maquete',
      async () => {
        await page.goto(tripUrl(target));
        await page.getByRole('heading', { name: 'Agora' }).waitFor();
      },
    ],
    [
      'a maquete monta com um motor de verdade',
      async () => {
        const t0 = Date.now();
        await world.waitFor({ timeout: WORLD_TIMEOUT });
        await page
          .getByText('Montando a maquete…')
          .waitFor({ state: 'hidden', timeout: WORLD_TIMEOUT });
        info.motor = await world.getAttribute('data-world');
        info.primeiro_quadro_ms = Date.now() - t0;
      },
    ],
    [
      'as pílulas das paradas por cima da cena',
      async () => {
        await hud.getByText(target.originName).first().waitFor();
        await hud.getByText(target.destinationName).first().waitFor();
      },
    ],
    [
      '"Rever o dia" começa e anda até o fim',
      async () => {
        const review = page.getByRole('button', { name: 'Rever o dia', exact: true });
        // um replay ao abrir, se houver, termina antes de o botão aparecer
        await review.waitFor({ timeout: WORLD_TIMEOUT });
        await review.click();
        const t0 = Date.now();
        // o "Pular" do replay mora na faixa de cima do palco (fase 14), no lugar do "Rever o dia"
        await page
          .getByRole('button', { name: 'Pular', exact: true })
          .waitFor({ timeout: WORLD_TIMEOUT });
        await review.waitFor({ timeout: WORLD_TIMEOUT });
        info.rever_ms = Date.now() - t0;
      },
    ],
  ]).then((check) => ({ ...check, data: { ...check.data, ...info } }));
}
