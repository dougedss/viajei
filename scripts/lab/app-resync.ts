import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { addDays } from './arm.ts';
import { must, syncPush } from './client.ts';
import type { Check } from './evaluate.ts';
import { clean } from './road.ts';
import { sleep, type Session } from './session.ts';

/**
 * `app_resync` (fase 12): o aparelho atrasado, provado na produção sem mexer no horizonte de verdade.
 * Numa viagem fixa só do lab-a (40 dias à frente, sem avisos), o navegador puxa a viagem e perde o
 * sinal; o laboratório forja o aparelho que não puxa há meses, direto no IndexedDB: uma parada que o
 * servidor não tem (a fantasma, como uma lápide expurgada que ele nunca viu) e o cursor da viagem em
 * janeiro. Sem sinal, a pessoa marca um item e cria outro (duas operações na outbox). O
 * `lab_mark_horizon` marca o horizonte só desta viagem de laboratório; a rede volta. O `resync` tem
 * de tirar a fantasma e manter as duas edições, que sobem: nada pendente se perde.
 */
export type ResyncContext = {
  appUrl: string;
  bypass: string | null;
  a: Session;
  email: string;
  password: string;
  artifactsDir: string;
};

const GHOST = 'Fantasma do laboratório';
const ITEM = 'Revisar o estepe';
const NEW_ITEM = 'Calibrar sem sinal';

async function prepareResync(a: Session, today: string) {
  const trip = await uuidV5(a.uid, 'lab:resync');
  const date = addDays(today, 40);
  const day = await uuidV5(trip, date);
  const stops = [await uuidV5(trip, 'stop:a'), await uuidV5(trip, 'stop:b')];
  const item = await uuidV5(trip, 'item:estepe');
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: 'Laboratório · resync',
        start_date: date,
        end_date: date,
        origin: 'Papanduva/SC',
        car_model: 'hatch',
        car_color: 'sunset',
        car_accessories: [],
        deleted_at: null,
      },
    },
  ]);
  // os itens criados pela execução anterior saem; as duas paradas e o item fixos voltam ao começo
  await clean(a, [trip], [day]);
  await syncPush(a.client, [
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date, title: null, notes: null, deleted_at: null },
    },
    ...['Saída do laboratório', 'Cascata do laboratório'].map((name, i) => ({
      table: 'stops',
      id: stops[i] ?? '',
      op: 'upsert' as const,
      values: {
        trip_id: trip,
        trip_day_id: day,
        position: `a${String(i)}`,
        kind: i === 0 ? 'origin' : 'nature',
        name,
        time: i === 0 ? '07:00' : '10:00',
        notes: null,
        done_at: null,
        done_by: null,
        departed_at: null,
        skipped: false,
        deleted_at: null,
      },
    })),
    {
      table: 'checklist_items',
      id: item,
      op: 'upsert',
      values: {
        trip_id: trip,
        kind: 'before',
        text: ITEM,
        position: 'a0',
        created_by: a.uid,
        status: 'active',
        done_at: null,
        done_by: null,
        deleted_at: null,
      },
    },
  ]);
  return { trip, day, stops, item };
}

/** Forja o aparelho atrasado no IndexedDB do app (o Dexie `viajei`): a fantasma e o cursor velho. */
const FORGE = `async ({ realStop, ghostId, ghostName, cursorKey, cursor }) => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['stops', 'sync_state'], 'readwrite');
    const stops = tx.objectStore('stops');
    const get = stops.get(realStop);
    get.onsuccess = () => {
      const row = get.result;
      stops.put({ ...row, id: ghostId, name: ghostName, position: 'a9', time: '15:00' });
      tx.objectStore('sync_state').put({ key: cursorKey, value: cursor });
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}`;

const GHOST_IN_DB = `async (ghostId) => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const found = await new Promise((resolve) => {
    const get = db.transaction('stops').objectStore('stops').get(ghostId);
    get.onsuccess = () => resolve(get.result !== undefined);
    get.onerror = () => resolve(false);
  });
  db.close();
  return found;
}`;

export async function appResync(ctx: ResyncContext, today: string): Promise<Check> {
  const { a, appUrl } = ctx;
  const startedAt = Date.now();
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  // mudam dentro dos passos (closures): numa caixa, para o TypeScript não estreitar
  const box: { ids: Awaited<ReturnType<typeof prepareResync>> | null; skip: string | null } = {
    ids: null,
    skip: null,
  };
  const step = async (name: string, run: () => Promise<void>) => {
    if (box.skip || steps.some((s) => !s.ok)) return;
    try {
      await run();
      steps.push({ step: name, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      steps.push({ step: name, ok: false, detail: message.slice(0, 300) });
      await page
        ?.screenshot({ path: join(ctx.artifactsDir, 'app_resync.png'), fullPage: true })
        .catch(() => undefined);
    }
  };

  try {
    await step('preparo da viagem', async () => {
      box.ids = await prepareResync(a, today);
    });
    const v = box.ids;
    if (!v) throw new Error('sem viagem');
    const dayUrl = `${appUrl}/viagens/${v.trip}/roteiro/${v.day}`;
    const ghostId = await uuidV5(v.trip, 'stop:fantasma');
    browser = await chromium.launch({ channel: 'chromium' });
    const context = await browser.newContext({ ...DEVICE, permissions: [] });
    await context.addInitScript({ content: QUIET });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    await enterPreview(p, appUrl, ctx.bypass);

    await step('A entra e o aparelho puxa a viagem', async () => {
      await signInPage(p, appUrl, ctx.email, ctx.password);
      await p.goto(dayUrl);
      await p.getByRole('group', { name: 'Cascata do laboratório' }).waitFor({ timeout: 30_000 });
      await p.evaluate('navigator.serviceWorker.ready.then(() => true)');
      await p.reload();
      for (let i = 0; i < 30; i++) {
        if (await p.evaluate('navigator.serviceWorker.controller !== null')) break;
        await sleep(500);
      }
    });
    await step(
      'sem sinal, o aparelho vira o atrasado: uma fantasma e o cursor em janeiro',
      async () => {
        await context.setOffline(true);
        await p.evaluate(
          `(${FORGE})(${JSON.stringify({
            realStop: v.stops[1],
            ghostId,
            ghostName: GHOST,
            cursorKey: `cursor:trip:${v.trip}`,
            cursor: '2026-01-01T00:00:00.000Z',
          })})`,
        );
        await p.reload();
        await p.getByRole('group', { name: GHOST }).waitFor({ timeout: 15_000 });
      },
    );
    await step('sem sinal, marca um item e cria outro', async () => {
      await p.goto(`${appUrl}/viagens/${v.trip}/checklists?aba=antes`);
      const checkbox = p.getByRole('checkbox', { name: new RegExp(`^${ITEM}`) });
      await checkbox.click();
      const input = p.getByLabel('Novo item de antes de viajar');
      await input.fill(NEW_ITEM);
      await input.press('Enter');
      await p.getByRole('checkbox', { name: new RegExp(`^${NEW_ITEM}`) }).waitFor();
    });
    await step('o horizonte desta viagem de laboratório', async () => {
      const { error } = await a.client.rpc('lab_mark_horizon', { p_trip_id: v.trip });
      if (error?.code === 'PGRST202') box.skip = 'O lab_mark_horizon (0012) ainda não está no ar.';
      else if (error) throw new Error(`lab_mark_horizon: ${error.message}`);
    });
    await step('a rede volta: a fantasma sai e as edições ficam', async () => {
      await p.goto(dayUrl);
      await p.getByRole('group', { name: GHOST }).waitFor({ timeout: 15_000 });
      const t0 = Date.now();
      await context.setOffline(false);
      await p.getByRole('group', { name: GHOST }).waitFor({ state: 'detached', timeout: 60_000 });
      data.fantasma_saiu_ms = Date.now() - t0;
      if (await p.evaluate(`(${GHOST_IN_DB})(${JSON.stringify(ghostId)})`)) {
        throw new Error('a fantasma continua no IndexedDB');
      }
      await p.getByRole('group', { name: 'Cascata do laboratório' }).waitFor();
      await p.getByRole('group', { name: 'Saída do laboratório' }).waitFor();
    });
    await step('o servidor recebeu as duas edições feitas sem sinal', async () => {
      const end = Date.now() + 45_000;
      let items: { text: string; done_at: string | null }[] = [];
      while (Date.now() < end) {
        items = must(
          await a.client
            .from('checklist_items')
            .select('text, done_at')
            .eq('trip_id', v.trip)
            .is('deleted_at', null),
          'itens da viagem',
        );
        const marked = items.find((i) => i.text === ITEM)?.done_at;
        if (marked && items.some((i) => i.text === NEW_ITEM)) break;
        await sleep(2_000);
      }
      if (!items.find((i) => i.text === ITEM)?.done_at) throw new Error('a marcação não subiu');
      if (!items.some((i) => i.text === NEW_ITEM)) throw new Error('o item novo não subiu');
    });
  } catch (err) {
    if (steps.length === 0) {
      steps.push({
        step: 'preparo',
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  return {
    scenario: 'app_resync',
    status: box.skip ? 'skip' : failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail:
      box.skip ??
      (failed
        ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
        : `O aparelho atrasado recebeu o resync: a fantasma saiu em ${((data.fantasma_saiu_ms as number) / 1000).toFixed(1)} s, a marcação e o item novo feitos sem sinal subiram`),
    data: { ...data, passos: steps },
  };
}
