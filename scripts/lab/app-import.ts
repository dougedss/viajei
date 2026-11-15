import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { INTAKE_LABEL } from '../../src/features/intake/start.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { addDays } from './arm.ts';
import { must } from './client.ts';
import { dropLabTrip, retireFixedImportTrip } from './drop.ts';
import type { Check } from './evaluate.ts';
import { costUsd, LAB_IMPORT_EXPECT, LAB_IMPORT_TEXT } from './import-lab.ts';
import { sleep, type Session } from './session.ts';

/**
 * `app_importar` (fase 10, D139; pelo campo desde a fase 17), na produção: o lab-a cola o texto fixo
 * do laboratório no campo da lista de viagens, a IA lê de verdade (uma chamada por dia, numa viagem
 * que ainda não existe), a revisão pergunta a data que o texto não dá, escolhe o local quando há
 * escolha, e "Criar a viagem" a faz nascer. Confere no servidor as paradas, a reserva e o contato; a
 * parada sem horário no texto continua sem horário; o telefone em E.164 e o código exato; o registro
 * da leitura sem viagem. Guarda em `data` o tempo até a primeira parada, os tokens e o custo, lidos
 * da linha de `ai_imports`. No fim, a viagem sai pelo expurgo do laboratório (`dropLabTrip`).
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

export async function appImportar(ctx: ImportContext, today: string): Promise<Check> {
  const { a, appUrl } = ctx;
  const startedAt = Date.now();
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  let trip = '';
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
    // a viagem fixa de antes da fase 17 sai uma vez; daqui em diante, cada execução cria a sua
    await step('a viagem fixa de antes sai', () => retireFixedImportTrip(a));
    browser = await chromium.launch({ channel: 'chromium' });
    const context = await browser.newContext({ ...DEVICE, permissions: [] });
    await context.addInitScript({ content: QUIET });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    await enterPreview(p, appUrl, ctx.bypass);

    await step('A entra', () => signInPage(p, appUrl, ctx.email, ctx.password));
    await step('cola o texto no campo e lê', async () => {
      await p.goto(`${appUrl}/viagens`);
      await p.getByRole('textbox', { name: INTAKE_LABEL }).fill(LAB_IMPORT_TEXT);
      since = new Date(Date.now() - 5_000).toISOString();
      const t0 = Date.now();
      await p.getByRole('button', { name: 'Montar a viagem' }).click();
      // a primeira parada que aparece no preview, ou a revisão, se tudo chegou de uma vez; o limite
      // do dia do lab-a (D24) aparece na tela da viagem nova
      const firstStop = p.getByRole('list', { name: 'Dias que chegaram' }).locator('li li');
      const review = p.getByRole('heading', { name: 'Revisar a viagem', exact: true });
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
    await step('a data que o texto não dá: a viagem começa daqui a 30 dias', async () => {
      // o texto diz "primeiro dia" e "segundo dia": a revisão pergunta quando, com amanhã proposto
      data.datas_perguntadas = (await p.locator('[data-asked]').textContent())?.includes(
        'as datas',
      );
      const start = p.getByLabel(/começa em$/i);
      if (!(await start.isVisible())) await p.getByRole('button', { name: 'Mudar a data' }).click();
      // 30 dias à frente (D33): a abertura do app nunca cai nela
      await start.fill(addDays(today, 30));
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
    await step('cria a viagem', async () => {
      await p.getByRole('button', { name: 'Criar a viagem' }).click();
      await p.waitForURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
      trip = new URL(p.url()).pathname.split('/')[2] ?? '';
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
      const [row] = must(
        await a.client.from('trips').select('start_date, end_date').eq('id', trip),
        'a viagem nova',
      );
      if (row?.start_date !== addDays(today, 30) || row.end_date !== addDays(today, 31)) {
        throw new Error(`a viagem nasceu de ${String(row?.start_date)} a ${String(row?.end_date)}`);
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
          .select(
            'status, kind, trip_id, model, input_tokens, output_tokens, created_at, finished_at',
          )
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
      // a leitura aconteceu antes de a viagem existir (fase 17): sem viagem, e como importação
      if (row.kind !== 'import' || row.trip_id !== null) {
        throw new Error(`o registro veio como ${row.kind}, viagem ${String(row.trip_id)}`);
      }
    });
  } finally {
    await browser?.close().catch(() => undefined);
    // a viagem sai pelo expurgo do laboratório: a progressão do dia seguinte não a vê
    if (trip) await dropLabTrip(a, trip).catch(() => undefined);
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
      : `Leu pelo campo, revisou e criou a viagem com ${String(data.paradas)} paradas; a primeira apareceu em ${typeof first === 'number' ? `${(first / 1000).toFixed(1)} s` : '?'}, custo US$ ${typeof data.custo_usd === 'number' ? data.custo_usd.toFixed(3) : '?'}`,
    data: { ...data, passos: steps },
  };
}
