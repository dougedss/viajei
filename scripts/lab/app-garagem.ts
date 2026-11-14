import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import type { ProgressContext } from './app-progress.ts';
import { must, syncPush, type Op } from './client.ts';
import type { Check } from './evaluate.ts';
import { ensureTeamMember, kindsOnly, sleep, type Session } from './session.ts';

/**
 * `app_garagem` (fase 16): o carro é da pessoa, e o do outro chega pelo perfil dele. Numa viagem
 * fixa só deste cenário (`v5(lab-a, 'lab:garagem')`, com o lab-b no time e os avisos desligados),
 * os dois carros começam no padrão; o lab-b abre Membros e vê o hatch do lab-a; o lab-a abre a
 * garagem do perfil e escolhe o SUV Céu; sem recarregar, Membros do lab-b passa a mostrar o SUV Céu
 * do lab-a (o perfil pelo sync: o aviso do Realtime nas viagens dela, ou o ciclo de 60 s). É o
 * comboio dos dois aparelhos: o carro de cada um, de onde ele chega. No fim, o carro do lab-a volta
 * ao padrão (D53: tudo em repouso entre execuções).
 */
export type GaragemContext = Pick<
  ProgressContext,
  'appUrl' | 'bypass' | 'a' | 'b' | 'emails' | 'passwords' | 'artifactsDir'
>;

const NAME = 'Laboratório · garagem';
const SLOW = 90_000;

/** O carro padrão no perfil (hatch Pôr do sol, liso, roda clássica, nada no teto), pela outbox. */
function plainCar(uid: string): Op {
  return {
    table: 'profiles',
    id: uid,
    op: 'patch',
    values: {
      car_model: 'hatch',
      car_color: 'sunset',
      car_accessories: [],
      car_finish: 'solid',
      car_wheels: 'classic',
    },
  };
}

async function prepareGaragem(a: Session, b: Session, today: string): Promise<string> {
  const trip = await uuidV5(a.uid, 'lab:garagem');
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: NAME,
        start_date: today,
        end_date: today,
        budget: null,
        deleted_at: null,
      },
    },
  ]);
  const prefsOff = async (s: Session): Promise<Op> => ({
    table: 'notification_prefs',
    id: await uuidV5(s.uid, trip),
    op: 'upsert',
    values: {
      user_id: s.uid,
      trip_id: trip,
      enabled: false,
      lead_minutes: 15,
      morning_time: '07:00',
      kinds: kindsOnly(),
    },
  });
  await syncPush(a.client, [await prefsOff(a)]);
  await ensureTeamMember(a, b, trip);
  await syncPush(b.client, [await prefsOff(b)]);
  await syncPush(a.client, [plainCar(a.uid)]);
  await syncPush(b.client, [plainCar(b.uid)]);
  return trip;
}

async function open(
  browser: Browser,
  ctx: GaragemContext,
  who: 'a' | 'b',
  path: string,
): Promise<Page> {
  const context = await browser.newContext({ ...DEVICE, permissions: [] });
  await context.addInitScript({ content: QUIET });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  await enterPreview(page, ctx.appUrl, ctx.bypass);
  await signInPage(page, ctx.appUrl, ctx.emails[who], ctx.passwords[who]);
  await page.goto(`${ctx.appUrl}${path}`);
  return page;
}

export async function appGaragem(ctx: GaragemContext, today: string): Promise<Check> {
  const startedAt = Date.now();
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; ms: number; detail?: string }[] = [];
  let browser: Browser | null = null;
  const pages: Page[] = [];
  const box: { trip: string | null } = { trip: null };
  const step = async (name: string, run: () => Promise<void>) => {
    if (steps.some((s) => !s.ok)) return;
    const t0 = Date.now();
    try {
      await run();
      steps.push({ step: name, ok: true, ms: Date.now() - t0 });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      steps.push({ step: name, ok: false, ms: Date.now() - t0, detail: message.slice(0, 600) });
      for (const [i, p] of pages.entries()) {
        await p
          .screenshot({
            path: join(ctx.artifactsDir, `app_garagem-${i === 0 ? 'b' : 'a'}.png`),
            fullPage: true,
          })
          .catch(() => undefined);
      }
    }
  };
  const carOfA = async () =>
    must(
      await ctx.a.client.from('profiles').select('car_model, car_color').eq('id', ctx.a.uid),
      'o carro de A',
    )[0];

  try {
    await step('preparo: a viagem com o lab-b no time e os dois carros no padrão', async () => {
      box.trip = await prepareGaragem(ctx.a, ctx.b, today);
    });
    const trip = box.trip;
    if (!trip) throw new Error('sem viagem');
    browser = await chromium.launch({ channel: 'chromium' });
    const b0 = browser;
    const pagesBox: { A: Page | null; B: Page | null } = { A: null, B: null };
    const carroDeA = (p: Page) => p.locator(`[data-member-car="${ctx.a.uid}"] svg`);

    await step('B abre Membros e vê o hatch de A', async () => {
      pagesBox.B = await open(b0, ctx, 'b', `/viagens/${trip}/membros`);
      pages.push(pagesBox.B);
      await carroDeA(pagesBox.B)
        .and(pagesBox.B.locator('[data-car-model="hatch"]'))
        .waitFor({ timeout: SLOW });
    });

    await step('A escolhe o SUV Céu na garagem do perfil', async () => {
      pagesBox.A = await open(b0, ctx, 'a', '/perfil/garagem?render=list');
      pages.push(pagesBox.A);
      const pa = pagesBox.A;
      await pa.locator('[data-garage="svg"]').waitFor({ timeout: SLOW });
      await pa.getByRole('region', { name: 'Modelo' }).getByRole('button', { name: 'SUV' }).click();
      await pa
        .getByRole('region', { name: 'Pintura' })
        .getByRole('button', { name: 'Céu', exact: true })
        .click();
      const t0 = Date.now();
      for (;;) {
        const car = await carOfA();
        if (car?.car_model === 'suv' && car.car_color === 'sky') break;
        if (Date.now() - t0 > 30_000)
          throw new Error(`o carro não chegou ao servidor (${JSON.stringify(car)})`);
        await sleep(500);
      }
      data.servidor_ms = Date.now() - t0;
    });

    await step('sem recarregar, Membros de B mostra o SUV Céu de A', async () => {
      const pb = pagesBox.B;
      if (!pb) throw new Error('sem o navegador de B');
      const t0 = Date.now();
      await carroDeA(pb)
        .and(pb.locator('[data-car-model="suv"][data-car-color="sky"]'))
        .waitFor({ timeout: SLOW });
      data.ate_b_ms = Date.now() - t0;
    });
  } finally {
    await browser?.close().catch(() => undefined);
    // o carro de A volta ao padrão: a progressão e a garagem do dia seguinte começam iguais
    await syncPush(ctx.a.client, [plainCar(ctx.a.uid)]).catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  const ms = typeof data.ate_b_ms === 'number' ? `${(data.ate_b_ms / 1000).toFixed(1)} s` : '?';
  return {
    scenario: 'app_garagem',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `A trocou o carro na garagem do perfil; Membros de B mostrou o SUV Céu de A em ${ms}, sem recarregar`,
    data: { ...data, passos: steps },
  };
}
