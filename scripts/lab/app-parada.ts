import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import {
  FORGED,
  forgedPoint,
  forgedReverse,
  forgedRouteDay,
  postoFix,
} from '../../src/features/lab/forged-stop.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import type { ProgressContext } from './app-progress.ts';
import { must, syncPush, type Op } from './client.ts';
import type { Check } from './evaluate.ts';
import { clean } from './road.ts';
import { ensureTeamMember, kindsOnly, sleep, type Session } from './session.ts';

/**
 * `app_parada_auto` (fase 15): a parada que se registra sozinha, na produção, com dois celulares no
 * mesmo carro. Numa viagem fixa só deste cenário (`v5(lab-a, 'lab:parada')`, de hoje, com o lab-b
 * no time e os avisos desligados), o lab-a e o lab-b abrem a tela da viagem, permitem a posição e
 * recebem a mesma trilha forjada do e2e (`src/features/lab/forged-stop.ts`): a estrada, a saída
 * dela e 9 min a 80 m, no posto. A `route-day` e o `/reverse` do Nominatim são respondidos aqui (o
 * Nominatim não entra no teste diário). O relógio de cada aparelho é o do Playwright, posto 15 min
 * antes do de verdade e andando por `runFor`: os 9 min passam em segundos, e nenhuma hora gravada
 * fica no futuro do servidor. Confere a parada no lab-a, uma só no servidor (o id determinístico e
 * o sync), a mesma no lab-b, e a saída medida.
 */
export type ParadaContext = Pick<
  ProgressContext,
  'appUrl' | 'bypass' | 'a' | 'b' | 'emails' | 'passwords' | 'artifactsDir'
>;

const NAME = 'Laboratório · parada automática';
const SAIDA = 'Saída da estrada do laboratório';
const PARQUE = 'Parque do laboratório';
const CLOCK_BEHIND_MS = 15 * 60_000;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

async function prepareParada(a: Session, b: Session, today: string) {
  const trip = await uuidV5(a.uid, 'lab:parada');
  const day = await uuidV5(trip, today);
  const stops = {
    saida: await uuidV5(trip, 'stop:saida'),
    parque: await uuidV5(trip, 'stop:parque'),
  };
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
  // avisos desligados antes de qualquer parada existir (sem linha, o padrão é tudo ligado)
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
  // a parada automática da execução anterior sai; as duas do roteiro voltam ao começo
  await clean(a, [trip], [day]);
  const left = new Date(Date.now() - CLOCK_BEHIND_MS - 30 * 60_000).toISOString();
  const saida = forgedPoint(FORGED.originX);
  const parque = forgedPoint(FORGED.parkX);
  const stop = (id: string, values: Record<string, unknown>): Op => ({
    table: 'stops',
    id,
    op: 'upsert',
    values: {
      trip_id: trip,
      trip_day_id: day,
      travel_minutes_to_next: null,
      skipped: false,
      deleted_at: null,
      ...values,
    },
  });
  await syncPush(a.client, [
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date: today, title: 'Laboratório', deleted_at: null },
    },
    stop(stops.saida, {
      position: 'a0',
      kind: 'origin',
      name: SAIDA,
      time: '07:00',
      lat: saida.latitude,
      lng: saida.longitude,
      done_at: left,
      done_by: a.uid,
      departed_at: left,
    }),
    stop(stops.parque, {
      position: 'a1',
      kind: 'nature',
      name: PARQUE,
      time: '23:30',
      lat: parque.latitude,
      lng: parque.longitude,
      done_at: null,
      done_by: null,
      departed_at: null,
    }),
  ]);
  return { trip, day };
}

/** Um aparelho: o contexto com a posição forjada, a rota e o Nominatim respondidos, e o relógio atrás. */
async function device(
  browser: Browser,
  ctx: ParadaContext,
  who: 'a' | 'b',
  tripUrl: string,
): Promise<{ context: BrowserContext; page: Page; reverse: () => number }> {
  const context = await browser.newContext({
    ...DEVICE,
    geolocation: forgedPoint(6_000),
    permissions: [],
  });
  await context.addInitScript({ content: QUIET });
  await context.addInitScript({
    content: `localStorage.setItem('viajei:world:render', 'list');`,
  });
  let calls = 0;
  await context.route('**/functions/v1/route-day', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as { waypoints: [number, number][] };
    await route.fulfill({ json: forgedRouteDay(body.waypoints), headers: CORS });
  });
  await context.route('https://nominatim.openstreetmap.org/reverse**', async (route) => {
    calls += 1;
    await route.fulfill({ json: forgedReverse(), headers: { 'access-control-allow-origin': '*' } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);
  await page.clock.install({ time: new Date(Date.now() - CLOCK_BEHIND_MS) });
  await enterPreview(page, ctx.appUrl, ctx.bypass);
  await signInPage(page, ctx.appUrl, ctx.emails[who], ctx.passwords[who]);
  await page.goto(tripUrl);
  await page.getByRole('button', { name: PARQUE }).waitFor({ timeout: 45_000 });
  await context.grantPermissions(['geolocation'], { origin: new URL(ctx.appUrl).origin });
  await page.getByRole('button', { name: 'Usar posição' }).click();
  await page.locator('[data-gps][data-fix-at]').waitFor({ state: 'attached', timeout: 30_000 });
  return { context, page, reverse: () => calls };
}

type Device = Awaited<ReturnType<typeof device>>;

const order = (page: Page) => page.locator('[data-stop-row]').allInnerTexts();

async function until<T>(
  read: () => Promise<T>,
  ok: (v: T) => boolean,
  what: string,
  timeout = 30_000,
) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`${what} (último: ${JSON.stringify(v).slice(0, 300)})`);
    await sleep(1_000);
  }
}

/** A hora de parede de São Paulo agora, "HH:MM". */
function wallNow(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

export async function appParadaAuto(ctx: ParadaContext, today: string): Promise<Check> {
  const startedAt = Date.now();
  // com o relógio do aparelho 15 min atrás, logo depois da meia-noite ele estaria em ontem, e a
  // viagem de hoje não estaria em andamento para ele
  if (wallNow() < '00:30') {
    return {
      scenario: 'app_parada_auto',
      status: 'skip',
      latency_ms: null,
      detail: 'Perto da meia-noite: o relógio do aparelho, 15 min atrás, ainda estaria em ontem.',
      data: {},
    };
  }
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; ms: number; detail?: string }[] = [];
  let browser: Browser | null = null;
  const pages: Page[] = [];
  const box: { ids: Awaited<ReturnType<typeof prepareParada>> | null } = { ids: null };
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
            path: join(ctx.artifactsDir, `app_parada_auto-${i === 0 ? 'a' : 'b'}.png`),
            fullPage: true,
          })
          .catch(() => undefined);
      }
    }
  };
  const autoStops = async () => {
    const trip = box.ids?.trip ?? '';
    return must(
      await ctx.a.client
        .from('stops')
        .select('id, name, kind, done_at, departed_at, done_by, source')
        .eq('trip_id', trip)
        .eq('source', 'auto')
        .is('deleted_at', null),
      'paradas automáticas',
    );
  };

  try {
    await step('preparo da viagem, com o lab-b no time', async () => {
      box.ids = await prepareParada(ctx.a, ctx.b, today);
    });
    const ids = box.ids;
    if (!ids) throw new Error('sem viagem');
    const tripUrl = `${ctx.appUrl}/viagens/${ids.trip}?render=list`;
    browser = await chromium.launch({ channel: 'chromium' });
    const b0 = browser;
    const box2: { A: Device | null; B: Device | null } = { A: null, B: null };

    await step('A e B abrem a tela da viagem e permitem a posição', async () => {
      box2.A = await device(b0, ctx, 'a', tripUrl);
      pages.push(box2.A.page);
      box2.B = await device(b0, ctx, 'b', tripUrl);
      pages.push(box2.B.page);
    });
    const A = box2.A;
    const B = box2.B;
    if (!A || !B) throw new Error('sem aparelhos');
    const both = async (fn: (d: Device) => Promise<void>) => {
      await fn(A);
      await fn(B);
    };

    await step('os dois saem da estrada e ficam 8 min no posto: A registra a parada', async () => {
      for (const x of [6_500, 7_000, 7_500, 7_900]) {
        await both(async (d) => {
          await d.context.setGeolocation(forgedPoint(x));
          await d.page.clock.runFor(5_000);
        });
      }
      for (let i = 0; i <= 8; i++) {
        await both(async (d) => {
          await d.context.setGeolocation(postoFix(i));
          if (i < 8) await d.page.clock.runFor('01:00');
        });
      }
      const t0 = Date.now();
      await A.page
        .getByText(`Parada registrada: ${FORGED.postoName}`, { exact: true })
        .waitFor({ timeout: 30_000 });
      data.registro_ms = Date.now() - t0;
      data.chamadas_osm_a = A.reverse();
    });

    await step('no servidor, uma parada só: Posto, com o nome do OSM e a hora medida', async () => {
      const rows = await until(
        autoStops,
        (r) => r.length === 1 && r[0]?.kind === 'fuel' && r[0].name === FORGED.postoName,
        'a parada não chegou ao servidor como uma só',
      );
      const row = rows[0];
      data.quem_detectou =
        row?.done_by === ctx.a.uid ? 'a' : row?.done_by === ctx.b.uid ? 'b' : '?';
      // a chegada é a da primeira leitura no posto: uns 8 min antes do registro, no relógio do
      // aparelho (o de mentira, que os `runFor` adiantaram), e nunca no futuro do servidor
      const arrived = Date.parse(row?.done_at ?? '');
      const deviceNow = await A.page.evaluate(() => Date.now());
      data.chegada_antes_do_registro_s = Math.round((deviceNow - arrived) / 1000);
      if (!(deviceNow - arrived > 7.5 * 60_000 && deviceNow - arrived < 20 * 60_000)) {
        throw new Error(`a chegada gravada não é a medida (${String(row?.done_at)})`);
      }
      if (arrived > Date.now()) throw new Error('a chegada ficou no futuro do servidor');
    });

    await step('B tem a mesma parada, uma só, entre a saída e o parque', async () => {
      await until(
        () => order(B.page),
        (names) => names.join(' › ') === [SAIDA, FORGED.postoName, PARQUE].join(' › '),
        'a lista de B não tem a parada uma vez só',
      );
      await until(
        () => order(A.page),
        (names) => names.join(' › ') === [SAIDA, FORGED.postoName, PARQUE].join(' › '),
        'a lista de A não tem a parada uma vez só',
      );
      data.chamadas_osm_b = B.reverse();
      // nada de segunda linha no servidor depois de os dois sincronizarem
      if ((await autoStops()).length !== 1) throw new Error('virou duas no servidor');
    });

    await step('o carro volta à estrada: a saída medida fecha a parada', async () => {
      for (const x of [8_200, 8_600, 9_000, 9_500]) {
        await both(async (d) => {
          await d.context.setGeolocation(forgedPoint(x));
          await d.page.clock.runFor(5_000);
        });
      }
      await until(
        autoStops,
        (r) => r.length === 1 && r[0]?.departed_at != null,
        'a saída não chegou ao servidor',
      );
    });
  } finally {
    await browser?.close().catch(() => undefined);
    // a viagem fica sem a parada concluída: a progressão de A começa do zero na próxima (D125)
    if (box.ids) await clean(ctx.a, [box.ids.trip], [box.ids.day]).catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  return {
    scenario: 'app_parada_auto',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `A e B no posto: uma parada só, Posto, "${FORGED.postoName}", com a chegada e a saída medidas`,
    data: { ...data, passos: steps },
  };
}
