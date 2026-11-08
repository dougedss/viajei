import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { LabScenario } from '../../src/features/lab/scenarios.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { wallToInstant } from '../../src/lib/time/zone.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { addDays } from './arm.ts';
import { must, ok, syncPush, type Op } from './client.ts';
import { wall, type Check } from './evaluate.ts';
import { makePng } from './files.ts';
import { clean } from './road.ts';
import { ensureTeamMember, log, sleep, type Session } from './session.ts';

/**
 * Os cenários da fase 9 no navegador, na produção (D91, D125):
 *  - `app_progressao`: a progressão de A e B zerada e nenhuma parada concluída viva de A (conquista
 *    não se apaga e o laboratório roda todo dia); A conclui a primeira parada, o cartão do "Primeiro
 *    pé na estrada" aparece na visão geral, "Usar no carro" põe o rack, o servidor tem o XP de A e,
 *    depois que o navegador de B abre, o de B, e a garagem de B mostra o rack;
 *  - `app_retrospectiva`: uma viagem fixa do lab-b que terminou ontem, com paradas concluídas, uma
 *    memória com foto e um gasto; o filme chega ao card final com os números certos, o card exportado
 *    tem 1080 × 1920 e o vídeo exportado tem 15 s e 1080 × 1920, conferido por um `<video>`. No canal
 *    `chrome` (com H.264): é o caminho do iPhone, MP4. A CI cobre o caminho de reserva (WebM).
 */
export type ProgressContext = {
  appUrl: string;
  /** o segredo do bypass da Vercel, quando o navegador abre o preview da branch (D106) */
  bypass: string | null;
  a: Session;
  b: Session;
  passwords: { a: string; b: string };
  emails: { a: string; b: string };
  artifactsDir: string;
};

const SLOW = 90_000;

/**
 * A fila do aparelho (a outbox do Dexie `viajei`), para a falha dizer por que algo não subiu: a
 * tabela, o estado, as tentativas, quando volta a tentar e o último erro do servidor. Sem valores.
 */
const OUTBOX = `async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const rows = await new Promise((resolve) => {
    const all = db.transaction('outbox').objectStore('outbox').getAll();
    all.onsuccess = () => resolve(all.result);
    all.onerror = () => resolve([]);
  });
  db.close();
  return rows.map((o) => [o.table, o.op, o.state, o.attempts, Math.round((o.next_at - Date.now()) / 1000) + 's', o.last_error].join(' '));
}`;
const removedAt = () => new Date().toISOString();
const tomb =
  (table: string) =>
  (row: { id: string }): Op => ({
    table,
    id: row.id,
    op: 'patch',
    values: { deleted_at: removedAt() },
  });

async function until<T>(
  read: () => Promise<T>,
  okv: (v: T) => boolean,
  what: string,
  timeout = SLOW,
): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (okv(v)) return v;
    if (Date.now() > end) throw new Error(`${what} (último: ${JSON.stringify(v).slice(0, 200)})`);
    await sleep(2_000);
  }
}

type Step = { step: string; ok: boolean; detail?: string };

async function runSteps(
  scenario: LabScenario,
  okText: string,
  pages: () => readonly (Page | null)[],
  dir: string,
  steps: [string, () => Promise<void>][],
  data: Record<string, unknown>,
): Promise<Check> {
  const startedAt = Date.now();
  const done: Step[] = [];
  for (const [step, fn] of steps) {
    try {
      await fn();
      done.push({ step, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      done.push({ step, ok: false, detail: message.slice(0, 600) });
      let i = 0;
      for (const page of pages()) {
        i++;
        await page
          ?.screenshot({ path: join(dir, `${scenario}-${i}.png`), fullPage: true })
          .catch(() => undefined);
      }
      break;
    }
  }
  const failed = done.find((s) => !s.ok);
  return {
    scenario,
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}` : okText,
    data: { ...data, passos: done },
  };
}

async function newContext(
  browser: Browser,
  target: Pick<ProgressContext, 'appUrl' | 'bypass'>,
  celebrations: boolean,
  downloads = false,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...DEVICE,
    permissions: [],
    acceptDownloads: downloads,
  });
  await context.addInitScript({
    content: celebrations ? `localStorage.setItem('viajei:celebrations', 'on');` : QUIET,
  });
  // sem folha de compartilhar: o card e o vídeo viram download, como num computador
  await context.addInitScript({
    content: `Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });`,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  await enterPreview(page, target.appUrl, target.bypass);
  return { context, page };
}

// ------------------------------------------------------------------ progressão
/** Nenhuma parada concluída viva de A, e a progressão dos dois zerada: o primeiro desbloqueio é de novo. */
async function resetProgress(a: Session, b: Session): Promise<number> {
  const trips = must(
    await a.client
      .from('trip_members')
      .select('trip_id')
      .eq('user_id', a.uid)
      .eq('status', 'accepted')
      .is('deleted_at', null),
    'viagens de A',
  ).map((m) => m.trip_id);
  const done = must(
    await a.client
      .from('stops')
      .select('id')
      .in('trip_id', trips)
      .not('done_at', 'is', null)
      .is('deleted_at', null),
    'paradas concluídas de A',
  );
  await syncPush(a.client, done.map(tomb('stops')));
  ok(await a.client.rpc('lab_reset_progress'), 'zerar a progressão de A');
  ok(await b.client.rpc('lab_reset_progress'), 'zerar a progressão de B');
  return done.length;
}

async function prepareProgress(a: Session, b: Session, today: string, now: Date) {
  const trip = await uuidV5(a.uid, 'lab:progressao');
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: 'Laboratório · progressão',
        start_date: today,
        end_date: today,
        car_model: 'hatch',
        car_color: 'sunset',
        car_accessories: [],
        deleted_at: null,
      },
    },
  ]);
  await ensureTeamMember(a, b, trip);
  const day = await uuidV5(trip, today);
  await clean(a, [trip], [day]);
  const origin = randomUUID();
  const later = (min: number) => wall(new Date(now.getTime() + min * 60_000)).hhmm;
  await syncPush(a.client, [
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date: today, title: 'Laboratório', deleted_at: null },
    },
    {
      table: 'stops',
      id: origin,
      op: 'upsert',
      values: {
        trip_id: trip,
        trip_day_id: day,
        position: 'a0',
        kind: 'origin',
        name: 'Saída do laboratório',
        time: later(20),
        travel_minutes_to_next: 30,
        departed_at: null,
        done_at: null,
        done_by: null,
        skipped: false,
        deleted_at: null,
      },
    },
    {
      table: 'stops',
      id: randomUUID(),
      op: 'upsert',
      values: {
        trip_id: trip,
        trip_day_id: day,
        position: 'a1',
        kind: 'nature',
        name: 'Mirante do laboratório',
        time: later(120),
        departed_at: null,
        done_at: null,
        done_by: null,
        skipped: false,
        deleted_at: null,
      },
    },
  ]);
  // nenhum aviso desta viagem: as caixas dos outros cenários ficam limpas
  for (const who of [a, b]) {
    await syncPush(who.client, [
      {
        table: 'notification_prefs',
        id: await uuidV5(who.uid, trip),
        op: 'upsert',
        values: {
          user_id: who.uid,
          trip_id: trip,
          enabled: false,
          lead_minutes: 15,
          morning_time: '07:00',
          kinds: {},
        },
      },
    ]);
  }
  return { trip, origin };
}

export async function appProgressao(ctx: ProgressContext, today: string): Promise<Check> {
  const { a, b, appUrl } = ctx;
  let browser: Browser | null = null;
  let pageA: Page | null = null;
  let pageB: Page | null = null;
  const data: Record<string, unknown> = {};
  let prepared: { trip: string; origin: string };
  try {
    data.paradasSoltas = await resetProgress(a, b);
    prepared = await prepareProgress(a, b, today, new Date());
  } catch (err) {
    return {
      scenario: 'app_progressao',
      status: 'fail',
      latency_ms: null,
      detail: `Preparo da progressão: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        900,
      ),
      data,
    };
  }
  const { trip, origin } = prepared;
  const url = (path = '') => `${appUrl}/viagens/${trip}${path}`;
  try {
    browser = await chromium.launch({ channel: 'chromium' });
    const A = await newContext(browser, ctx, true);
    pageA = A.page;
    const pa = A.page;
    return await runSteps(
      'app_progressao',
      'A concluiu a primeira parada, o cartão apareceu, "Usar no carro" pôs o rack; o servidor tem o XP de A e de B, e a garagem de B mostra o rack',
      () => [pageA, pageB],
      ctx.artifactsDir,
      [
        ['A entra', () => signInPage(pa, appUrl, ctx.emails.a, ctx.passwords.a)],
        [
          'A abre o "Agora" e toca Partiu!',
          async () => {
            await pa.goto(url('/viagem?render=list'));
            await pa.getByRole('button', { name: 'Partiu!' }).click({ timeout: SLOW });
            await pa.getByText('Saímos: Saída do laboratório', { exact: true }).waitFor();
          },
        ],
        [
          'o servidor tem a conquista e o XP de A',
          async () => {
            await until(
              async () =>
                must(
                  await a.client
                    .from('achievements')
                    .select('key, unlocked_at')
                    .eq('user_id', a.uid)
                    .eq('key', 'first_stop'),
                  'conquista de A',
                ),
              (rows) => rows.length === 1,
              'o "Primeiro pé na estrada" de A não chegou ao servidor',
            );
            await until(
              async () =>
                must(
                  await a.client
                    .from('xp_events')
                    .select('points')
                    .eq('user_id', a.uid)
                    .eq('kind', 'stop_done')
                    .eq('ref_id', origin),
                  'XP de A',
                ),
              (rows) => rows.length === 1,
              'o XP da parada de A não chegou ao servidor',
            );
          },
        ],
        [
          'o cartão aparece na visão geral',
          async () => {
            await pa.goto(url());
            const card = pa.getByRole('dialog', { name: 'Primeiro pé na estrada' });
            // de madrugada o Madrugador vem junto, na frente: "Agora não" nos outros
            for (let i = 0; i < 6 && !(await card.isVisible()); i++) {
              const other = pa.locator('[role=dialog]:has([data-unlock])');
              if (await other.isVisible()) {
                data.cartoesAntes = Number(data.cartoesAntes ?? 0) + 1;
                await other.getByRole('button', { name: /Agora não|Fechar/ }).click();
                await other.waitFor({ state: 'detached' });
              }
              await sleep(700);
            }
            await card.waitFor({ timeout: SLOW });
            await card.getByText('Rack de teto').waitFor();
          },
        ],
        [
          '"Usar no carro" põe o rack no carro da viagem',
          async () => {
            const card = pa.getByRole('dialog', { name: 'Primeiro pé na estrada' });
            await card.getByRole('button', { name: 'Usar no carro' }).click();
            await card.waitFor({ state: 'detached' });
            try {
              await until(
                async () =>
                  must(
                    await a.client.from('trips').select('car_accessories').eq('id', trip),
                    'carro da viagem',
                  )[0]?.car_accessories ?? [],
                (acc) => acc.includes('rack'),
                'o rack não chegou ao carro no servidor',
              );
            } catch (err) {
              const fila: unknown = await pa.evaluate(`(${OUTBOX})()`).catch(() => null);
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(`${message}; a fila do aparelho: ${JSON.stringify(fila)}`, {
                cause: err,
              });
            }
          },
        ],
        [
          'B abre a viagem e o servidor tem o XP de B',
          async () => {
            if (!browser) throw new Error('sem navegador');
            const B = await newContext(browser, ctx, false);
            pageB = B.page;
            await signInPage(B.page, appUrl, ctx.emails.b, ctx.passwords.b);
            await B.page.goto(url());
            await until(
              async () =>
                must(
                  await b.client
                    .from('xp_events')
                    .select('points')
                    .eq('user_id', b.uid)
                    .eq('kind', 'stop_done')
                    .eq('ref_id', origin),
                  'XP de B',
                ),
              (rows) => rows.length === 1,
              'o XP da parada de B não chegou ao servidor',
            );
          },
        ],
        [
          'a garagem de B mostra o rack',
          async () => {
            if (!pageB) throw new Error('sem o navegador de B');
            await pageB.goto(url('/garagem?render=list'));
            await pageB
              .getByRole('img', { name: /com rack/ })
              .first()
              .waitFor({ timeout: SLOW });
          },
        ],
      ],
      data,
    );
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

// ------------------------------------------------------------------ retrospectiva
/** Largura e altura de um JPEG, pelo primeiro marcador SOF. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/** As paradas da viagem fixa da retrospectiva: coordenadas reais, para a rota e o cenário. */
const RETRO_STOPS = [
  {
    day: 0,
    kind: 'nature',
    name: 'Cascata do laboratório',
    time: '10:00',
    done: '10:15',
    lat: -29.3108,
    lng: -50.8536,
  },
  {
    day: 0,
    kind: 'winery',
    name: 'Vinícola do laboratório',
    time: '15:00',
    done: '15:10',
    lat: -29.1921,
    lng: -51.5236,
  },
  {
    day: 1,
    kind: 'city',
    name: 'Cidade do laboratório',
    time: '11:00',
    done: '11:20',
    lat: -29.3747,
    lng: -50.8764,
  },
] as const;
export const RETRO_EXPECTED = {
  days: '2 dias',
  stops: '3 paradas',
  budget: 'R$ 120 de R$ 500 · dentro do orçamento',
} as const;

async function prepareRetro(b: Session, now: Date): Promise<string> {
  const trip = await uuidV5(b.uid, 'lab:retrospectiva');
  const end = addDays(wall(now).date, -1);
  const start = addDays(end, -1);
  await syncPush(b.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: b.uid,
        name: 'Laboratório · retrospectiva',
        start_date: start,
        end_date: end,
        budget: 500,
        deleted_at: null,
      },
    },
    {
      table: 'notification_prefs',
      id: await uuidV5(b.uid, trip),
      op: 'upsert',
      values: {
        user_id: b.uid,
        trip_id: trip,
        enabled: false,
        lead_minutes: 15,
        morning_time: '07:00',
        kinds: {},
      },
    },
  ]);
  const days = [await uuidV5(trip, start), await uuidV5(trip, end)];
  await clean(b, [trip], days);
  const dates = [start, end];
  const stopIds = RETRO_STOPS.map(() => randomUUID());
  await syncPush(b.client, [
    ...days.map((id, i): Op => ({
      table: 'trip_days',
      id,
      op: 'upsert',
      values: { trip_id: trip, date: dates[i], title: 'Laboratório', deleted_at: null },
    })),
    ...RETRO_STOPS.map((s, i): Op => ({
      table: 'stops',
      id: stopIds[i] ?? randomUUID(),
      op: 'upsert',
      values: {
        trip_id: trip,
        trip_day_id: days[s.day],
        position: `a${i}`,
        kind: s.kind,
        name: s.name,
        time: s.time,
        lat: s.lat,
        lng: s.lng,
        departed_at: null,
        done_at: new Date(wallToInstant(dates[s.day] ?? end, s.done)).toISOString(),
        done_by: b.uid,
        skipped: false,
        deleted_at: null,
      },
    })),
    {
      table: 'expenses',
      id: randomUUID(),
      op: 'upsert',
      values: {
        trip_id: trip,
        stop_id: null,
        reservation_id: null,
        amount: 120,
        category: 'food',
        date: start,
        paid_by: b.uid,
        created_by: b.uid,
        notes: null,
        deleted_at: null,
      },
    },
  ]);
  // a memória com foto da cascata: o arquivo sobe antes da linha (D78), como o app faz
  const cascata = stopIds[0] ?? '';
  const att = randomUUID();
  const png = makePng(640, 480);
  const path = `${trip}/${att}.png`;
  ok(
    await b.client.storage.from('attachments').upload(path, png, {
      contentType: 'image/png',
      upsert: false,
    }),
    'foto da retrospectiva',
  );
  await syncPush(b.client, [
    {
      table: 'stop_memories',
      id: await uuidV5(cascata, b.uid),
      op: 'upsert',
      values: {
        trip_id: trip,
        stop_id: cascata,
        user_id: b.uid,
        rating: 5,
        memo: 'Laboratório',
        deleted_at: null,
      },
    },
    {
      table: 'attachments',
      id: att,
      op: 'upsert',
      values: {
        trip_id: trip,
        stop_id: cascata,
        reservation_id: null,
        kind: 'photo',
        storage_path: path,
        filename: 'cascata.png',
        mime: 'image/png',
        size_bytes: png.length,
        width: 640,
        height: 480,
        placeholder: null,
        created_by: b.uid,
        deleted_at: null,
      },
    },
  ]);
  return trip;
}

/** O Chrome de verdade (com H.264), o do caminho do iPhone; sem ele, o Chromium (caminho WebM). */
async function launchChrome(): Promise<{ browser: Browser; channel: string }> {
  try {
    return { browser: await chromium.launch({ channel: 'chrome' }), channel: 'chrome' };
  } catch (err) {
    log(
      `retrospectiva: sem o Chrome (${err instanceof Error ? err.message.split('\n')[0] : ''}); vai o Chromium`,
    );
    return { browser: await chromium.launch({ channel: 'chromium' }), channel: 'chromium' };
  }
}

export async function appRetrospectiva(ctx: ProgressContext): Promise<Check> {
  const { b, appUrl } = ctx;
  const data: Record<string, unknown> = {};
  let trip: string;
  try {
    trip = await prepareRetro(b, new Date());
  } catch (err) {
    return {
      scenario: 'app_retrospectiva',
      status: 'fail',
      latency_ms: null,
      detail: `Preparo da retrospectiva: ${err instanceof Error ? err.message : String(err)}`.slice(
        0,
        900,
      ),
      data,
    };
  }
  const launched = await launchChrome();
  data.canal = launched.channel;
  const { context, page } = await newContext(launched.browser, ctx, false, true);
  // o runner desenha o 3D por software: a qualidade Leve (a mesma de um celular modesto)
  await context.addInitScript({
    content: `localStorage.setItem('viajei:world:quality', JSON.stringify({ mode: 'leve' }));`,
  });
  try {
    return await runSteps(
      'app_retrospectiva',
      'O filme chegou ao card final com os números certos; o card tem 1080 × 1920 e o vídeo, 15 s em 1080 × 1920',
      () => [page],
      ctx.artifactsDir,
      [
        ['B entra', () => signInPage(page, appUrl, ctx.emails.b, ctx.passwords.b)],
        [
          'o filme monta e toca',
          async () => {
            await page.goto(`${appUrl}/viagens/${trip}/retrospectiva`);
            await page.locator('[data-film="playing"]').waitFor({ timeout: 180_000 });
            data.modo = await page.locator('[data-film]').getAttribute('data-film-mode');
          },
        ],
        [
          'o filme chega ao card final com os números certos',
          async () => {
            await page.locator('[data-film="ended"]').waitFor({ timeout: SLOW });
            const final = page.locator('[data-final-card]');
            const stats = await final.locator('[data-stat]').allTextContents();
            const budget = (await final.locator('[data-budget]').textContent()) ?? '';
            data.numeros = { stats, budget };
            const problems = [
              stats.includes(RETRO_EXPECTED.days) ? null : `dias: ${stats.join(' · ')}`,
              stats.includes(RETRO_EXPECTED.stops) ? null : `paradas: ${stats.join(' · ')}`,
              budget === RETRO_EXPECTED.budget ? null : `gasto: "${budget}"`,
            ].filter((p): p is string => p !== null);
            if (problems.length > 0) throw new Error(problems.join('; '));
          },
        ],
        [
          'o card exportado tem 1080 × 1920',
          async () => {
            await page.getByRole('button', { name: 'Cards' }).click();
            const sheet = page.getByRole('dialog', { name: 'Compartilhar a viagem' });
            for (const name of ['Números', 'Conquistas', 'Fotos']) {
              await sheet.getByRole('checkbox', { name }).uncheck();
            }
            const [download] = await Promise.all([
              page.waitForEvent('download'),
              sheet.getByRole('button', { name: 'Compartilhar 1 imagem' }).click(),
            ]);
            const size = jpegSize(await readFile(await download.path()));
            data.card = size;
            if (size?.width !== 1080 || size.height !== 1920) {
              throw new Error(`o card saiu com ${JSON.stringify(size)}`);
            }
          },
        ],
        [
          'o vídeo exportado tem 15 s e 1080 × 1920',
          async () => {
            const sheet = page.getByRole('dialog', { name: 'Compartilhar a viagem' });
            const info = sheet.locator('[data-export-path]');
            await until(
              async () => (await info.getAttribute('data-export-path')) ?? 'pending',
              (v) => v !== 'pending',
              'a detecção do vídeo não terminou',
              20_000,
            );
            data.caminho = await info.textContent();
            if ((await info.getAttribute('data-export-path')) === 'none') {
              throw new Error('este navegador não grava vídeo');
            }
            const t0 = Date.now();
            await sheet.getByRole('button', { name: 'Gerar vídeo' }).click();
            // o Chrome da máquina do GitHub exporta em WebM · VP9 (sem H.264), por software: de 3 a
            // 13 min em 07/11, e uma execução a 70% nos 15 min; 25 min de prazo (D151)
            await sheet.locator('[data-export-state="done"]').waitFor({ timeout: 25 * 60_000 });
            data.exportacao_ms = Date.now() - t0;
            const meta = await page.evaluate<{ duration: number; width: number; height: number }>(`
              new Promise((resolve, reject) => {
                const v = document.querySelector('[data-export-video]');
                if (!v) return reject(new Error('sem vídeo'));
                const done = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
                if (v.readyState >= 1) done();
                else v.addEventListener('loadedmetadata', done, { once: true });
                v.addEventListener('error', () => reject(new Error('o vídeo não abre')), { once: true });
              })
            `);
            data.video = meta;
            if (meta.width !== 1080 || meta.height !== 1920 || Math.abs(meta.duration - 15) > 0.5) {
              throw new Error(`o vídeo saiu com ${JSON.stringify(meta)}`);
            }
          },
        ],
      ],
      data,
    );
  } finally {
    await context.close().catch(() => undefined);
    await launched.browser.close().catch(() => undefined);
  }
}
