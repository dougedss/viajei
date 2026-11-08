import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { addDays } from './arm.ts';
import { must, syncPush } from './client.ts';
import type { Check } from './evaluate.ts';
import { costUsd, LAB_IMPORT_EXPECT, LAB_IMPORT_TEXT } from './import-lab.ts';
import { clean } from './road.ts';
import { sleep, type Session } from './session.ts';

/**
 * `app_importar` (fase 10, D139), na produção: o lab-a, numa viagem fixa esvaziada a cada execução,
 * cola o texto fixo do laboratório, lê com a IA de verdade (uma chamada por dia), revisa o preview,
 * escolhe o local quando há escolha e salva. Confere no servidor as paradas, a reserva e o contato;
 * a parada sem horário no texto continua sem horário; o telefone em E.164 e o código exato. Guarda em
 * `data` o tempo até a primeira parada, os tokens e o custo, lidos da linha de `ai_imports`. No fim,
 * a viagem volta a ficar vazia: a progressão do dia seguinte começa sem parada importada viva (D125).
 */
export type ImportContext = {
  appUrl: string;
  /** o segredo do bypass da Vercel, quando o navegador abre o preview da branch (D106) */
  bypass: string | null;
  a: Session;
  email: string;
  password: string;
  artifactsDir: string;
};

const READ_TIMEOUT = 170_000;

async function prepareImport(a: Session, today: string) {
  const trip = await uuidV5(a.uid, 'lab:importar');
  const start = addDays(today, 30);
  const end = addDays(today, 31);
  const days = [await uuidV5(trip, start), await uuidV5(trip, end)];
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: 'Laboratório · importação',
        start_date: start,
        end_date: end,
        origin: 'Papanduva/SC',
        car_model: 'hatch',
        car_color: 'sunset',
        car_accessories: [],
        deleted_at: null,
      },
    },
  ]);
  await clean(a, [trip], days);
  await syncPush(
    a.client,
    [start, end].map((date, i) => ({
      table: 'trip_days',
      id: days[i] ?? '',
      op: 'upsert' as const,
      values: { trip_id: trip, date, title: null, notes: null, deleted_at: null },
    })),
  );
  return { trip, days };
}

export async function appImportar(ctx: ImportContext, today: string): Promise<Check> {
  const { a, appUrl } = ctx;
  const startedAt = Date.now();
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  let trip = '';
  let keepDays: string[] = [];
  let since = new Date().toISOString();
  // o limite diário de leituras do lab-a (D24), gasto pelo próprio laboratório num dia de muitas
  // execuções: o app mostra o aviso certo, e a leitura fica para depois (não é defeito do app)
  const quota: { message: string | null } = { message: null };
  const step = async (name: string, run: () => Promise<void>) => {
    if (steps.some((s) => !s.ok) || quota.message) return;
    try {
      await run();
      steps.push({ step: name, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      steps.push({ step: name, ok: false, detail: message.slice(0, 300) });
      await page
        ?.screenshot({ path: join(ctx.artifactsDir, 'app_importar.png'), fullPage: true })
        .catch(() => undefined);
    }
  };

  try {
    await step('preparo da viagem vazia', async () => {
      ({ trip, days: keepDays } = await prepareImport(a, today));
    });
    browser = await chromium.launch({ channel: 'chromium' });
    const context = await browser.newContext({ ...DEVICE, permissions: [] });
    await context.addInitScript({ content: QUIET });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    await enterPreview(p, appUrl, ctx.bypass);

    await step('A entra', () => signInPage(p, appUrl, ctx.email, ctx.password));
    await step('cola o texto e lê', async () => {
      await p.goto(`${appUrl}/viagens/${trip}/importar`);
      await p.getByRole('textbox', { name: 'Roteiro' }).fill(LAB_IMPORT_TEXT);
      // o app já sabe a cota ao abrir: sem leituras, o botão fica desligado com o aviso embaixo
      const read = p.getByRole('button', { name: 'Ler o roteiro' });
      const exhausted = p.getByText('As leituras de hoje acabaram.', { exact: true });
      const opened = Date.now();
      while (!(await read.isEnabled())) {
        if (await exhausted.isVisible()) {
          quota.message = 'As leituras de hoje acabaram.';
          return;
        }
        if (Date.now() - opened > TIMEOUT) throw new Error('o botão "Ler o roteiro" não ligou');
        await sleep(200);
      }
      since = new Date(Date.now() - 5_000).toISOString();
      const t0 = Date.now();
      // a cota chega do servidor depois que a tela abre: o botão pode ligar e desligar de novo entre
      // a conferência de cima e o toque; se foi isso, é o mesmo skip (fase 13)
      try {
        await read.click({ timeout: 5_000 });
      } catch (err) {
        if (await exhausted.isVisible()) {
          quota.message = 'As leituras de hoje acabaram.';
          return;
        }
        throw err;
      }
      // a primeira parada que aparece no preview, ou a revisão, se tudo chegou de uma vez
      const firstStop = p.getByRole('list', { name: 'Dias que chegaram' }).locator('li li');
      const review = p.getByRole('heading', { name: 'Revisar o roteiro', exact: true });
      const limit = p.getByText(/^Você já leu \d+ roteiros nas últimas 24 horas/);
      for (;;) {
        if ((await firstStop.count()) > 0 || (await review.isVisible())) break;
        if (await limit.isVisible()) {
          quota.message = (await limit.textContent())?.trim() ?? 'limite do dia';
          return;
        }
        if (Date.now() - t0 > READ_TIMEOUT) throw new Error('nenhuma parada chegou');
        await sleep(200);
      }
      data.primeira_parada_ms = Date.now() - t0;
      await review.waitFor({ timeout: READ_TIMEOUT });
      data.leitura_ms = Date.now() - t0;
    });
    await step('revisa: escolhe os locais e decide os não classificados', async () => {
      // a busca de lugar anda sozinha (1 por segundo); uma escolha pendente vira a primeira opção
      await sleep(8_000);
      const choices = p.getByRole('button', { name: /^Escolher o local/ });
      data.escolhas = await choices.count();
      for (let i = 0; i < 6 && (await choices.count()) > 0; i++) {
        await choices.first().click();
        await p.getByRole('list', { name: 'Opções de local' }).getByRole('button').first().click();
      }
      const selects = p.getByRole('combobox', { name: /^Destino de/ });
      data.nao_classificados = await selects.count();
      for (let i = 0; i < (data.nao_classificados as number); i++) {
        await selects.nth(i).selectOption('discard');
      }
    });
    await step('salva na viagem', async () => {
      await p.getByRole('button', { name: 'Salvar na viagem' }).click();
      await p.waitForURL(`${appUrl}/viagens/${trip}`);
    });
    await step('o servidor tem as paradas, a reserva e o contato', async () => {
      const end = Date.now() + 60_000;
      let stops: { name: string; time: string | null; source: string }[] = [];
      while (Date.now() < end) {
        stops = must(
          await a.client
            .from('stops')
            .select('name, time, source')
            .eq('trip_id', trip)
            .is('deleted_at', null),
          'paradas importadas',
        );
        if (stops.length >= LAB_IMPORT_EXPECT.minStops) break;
        await sleep(2_000);
      }
      data.paradas = stops.length;
      if (stops.length < LAB_IMPORT_EXPECT.minStops) {
        throw new Error(`${stops.length} paradas no servidor`);
      }
      if (!stops.every((s) => s.source === 'ai')) throw new Error('parada sem a origem ai');
      const untimed = stops.find((s) => LAB_IMPORT_EXPECT.untimedStop.test(s.name));
      if (!untimed) throw new Error('a cascata não chegou');
      if (untimed.time !== null) throw new Error(`a parada sem horário ganhou ${untimed.time}`);
      const reservations = must(
        await a.client
          .from('reservations')
          .select('confirmation_code, phone')
          .eq('trip_id', trip)
          .is('deleted_at', null),
        'reserva importada',
      );
      if (!reservations.some((r) => r.confirmation_code === LAB_IMPORT_EXPECT.code)) {
        throw new Error('o código da reserva não chegou exato');
      }
      const contacts = must(
        await a.client.from('contacts').select('phone').eq('trip_id', trip).is('deleted_at', null),
        'contato importado',
      );
      if (!contacts.some((c) => c.phone === LAB_IMPORT_EXPECT.phone)) {
        throw new Error('o telefone não chegou em E.164');
      }
    });
    await step('o registro da leitura: estado, tokens e custo', async () => {
      const rows = must(
        await a.client
          .from('ai_imports')
          .select('status, model, input_tokens, output_tokens, created_at, finished_at')
          .eq('user_id', a.uid)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1),
        'ai_imports',
      );
      const row = rows[0];
      if (!row) throw new Error('nenhum registro em ai_imports');
      data.status = row.status;
      data.modelo = row.model;
      data.tokens = { entrada: row.input_tokens, saida: row.output_tokens };
      data.custo_usd = costUsd(row.model, {
        input_tokens: row.input_tokens ?? 0,
        output_tokens: row.output_tokens ?? 0,
      });
      if (row.status !== 'succeeded') throw new Error(`a leitura terminou como ${row.status}`);
    });
  } finally {
    await browser?.close().catch(() => undefined);
    // a viagem volta a ficar vazia (a progressão do dia seguinte não vê parada importada viva)
    if (trip) await clean(a, [trip], keepDays).catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  const first = data.primeira_parada_ms;
  if (!failed && quota.message) {
    return {
      scenario: 'app_importar',
      status: 'skip',
      latency_ms: Date.now() - startedAt,
      detail: `O lab-a gastou as leituras do dia (D24) nas execuções de hoje; o app mostrou o limite: "${quota.message}"`,
      data: { ...data, limite: quota.message, passos: steps },
    };
  }
  return {
    scenario: 'app_importar',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `Leu, revisou e salvou ${String(data.paradas)} paradas; a primeira apareceu em ${typeof first === 'number' ? `${(first / 1000).toFixed(1)} s` : '?'}, custo US$ ${typeof data.custo_usd === 'number' ? data.custo_usd.toFixed(3) : '?'}`,
    data: { ...data, passos: steps },
  };
}
