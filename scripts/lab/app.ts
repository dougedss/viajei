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
};

export type App = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  target: AppTarget;
  cdp: CDPSession | null;
  registrationId: string | null;
};

type Step = { step: string; ok: boolean; detail?: string };
const TIMEOUT = 20_000;

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
    ...devices['Pixel 7'],
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    geolocation: target.destination,
    permissions: ['notifications', 'geolocation'],
    acceptDownloads: true,
  });
  await context.addInitScript({ content: initScript(target.subscription) });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  return { browser, context, page, target, cdp: null, registrationId: null };
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
async function runSteps(
  app: App,
  scenario: LabScenario,
  ok: string,
  steps: [string, () => Promise<void>][],
): Promise<Check> {
  const startedAt = Date.now();
  const done: Step[] = [];
  for (const [step, run] of steps) {
    try {
      await run();
      done.push({ step, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      done.push({ step, ok: false, detail: message.slice(0, 300) });
      await app.page
        .screenshot({ path: join(app.target.artifactsDir, `${scenario}.png`), fullPage: true })
        .catch(() => undefined);
      break;
    }
  }
  return result(scenario, done, ok, startedAt);
}

const tripUrl = (t: AppTarget, path = 'viagem') => `${t.appUrl}/viagens/${t.tripId}/${path}`;

/** Entrar, abrir o "Agora", a folha de avisos na segunda abertura, ativar e conferir em /avisos. */
export function appAvisos(app: App): Promise<Check> {
  const { page, target } = app;
  return runSteps(
    app,
    'app_avisos',
    'Entrou, viu o "Agora", ativou os avisos pela folha e /avisos diz "Avisos ligados"',
    [
      [
        'entrar',
        async () => {
          await page.goto(`${target.appUrl}/entrar`);
          await page.getByLabel('E-mail').fill(target.email);
          await page.getByLabel('Senha', { exact: true }).fill(target.password);
          await page.getByRole('button', { name: 'Entrar' }).click();
          await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
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
          await sheet.waitFor();
          await sheet.getByRole('button', { name: 'Ativar avisos' }).click();
          await page.getByText('Avisos ativados').waitFor();
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
  );
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

/** Ao reabrir: "Desde a última vez" mostra a saída; com a posição na parada, Chegamos! sozinho. */
export function appReabrir(app: App, serverMarked: () => Promise<void>): Promise<Check> {
  const { page, target } = app;
  return runSteps(
    app,
    'app_reabrir',
    '"Desde a última vez" mostrou a saída e a posição marcou Chegamos! no destino',
    [
      [
        'reabrir o "Agora"',
        async () => {
          await page.goto(tripUrl(target));
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
          await page.getByRole('button', { name: 'Usar posição' }).click();
          await page.getByText(`Chegamos: ${target.destinationName}`).first().waitFor();
        },
      ],
      ['o servidor recebeu a chegada', serverMarked],
    ],
  );
}

/** Modo painel liga e desliga; o dia sai como .ics. */
export function appExtras(app: App): Promise<Check> {
  const { page, target } = app;
  return runSteps(
    app,
    'app_extras',
    'Modo painel ligou e desligou; o .ics do dia baixou com o destino',
    [
      [
        'abrir o "Agora"',
        async () => {
          if (!page.url().startsWith(tripUrl(target))) await page.goto(tripUrl(target));
          await page.getByRole('heading', { name: 'Agora' }).waitFor();
        },
      ],
      [
        'ligar o modo painel',
        async () => {
          await page.getByRole('button', { name: 'Modo painel' }).click();
          await page.getByRole('status').filter({ hasText: 'Painel ligado' }).waitFor();
        },
      ],
      [
        'desligar o modo painel',
        async () => {
          await page.getByRole('button', { name: 'Desligar o modo painel' }).click();
          await page
            .getByRole('status')
            .filter({ hasText: 'Painel ligado' })
            .waitFor({ state: 'detached' });
        },
      ],
      [
        'exportar o dia (.ics)',
        async () => {
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
    ],
  );
}
