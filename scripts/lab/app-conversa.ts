import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { aiSse } from '../../e2e/helpers/import.ts';
import { INTAKE_LABEL } from '../../src/features/intake/start.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { must } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { Check } from './evaluate.ts';
import type { ImportContext } from './app-import.ts';
import { sleep } from './session.ts';

/**
 * `app_conversa` (fase 17; refeito na fase 24): "quero sair hoje para um café colonial", na produção
 * ou no preview, sem leitura real da IA (a `plan-trip` respondida no próprio navegador, como no e2e) e
 * com o mapa de verdade: o lab-a, com a posição em Canela permitida no mapa, escreve no campo,
 * responde a pergunta de alcance, vê **as opções do mapa de verdade** (a `find-places`, pela Geoapify:
 * pelo menos uma), toca na mais perto, traça o caminho (a `route-day` e o corredor dela), vê a
 * revisão com as sugestões desligadas e cria a viagem com exatamente o escolhido; no fim, o expurgo do
 * laboratório a tira. Sem a chave da Geoapify (`no_source`), o cenário é pulado com o motivo. Em
 * `data`, só contagens, formas e tempos: nunca o pedido nem os nomes.
 */
const CANELA = { latitude: -29.3655, longitude: -50.8128 };
const TEXTO = 'quero sair hoje para um café colonial';
const CHECK_TIMEOUT = 90_000;

/** A escrita da "IA" do laboratório: só textos, sobre a escolha e as sugestões (as referências). */
function escrita(today: string): string {
  const data = {
    trip: { name: 'Laboratório · café de hoje', start_date: today, end_date: today },
    days: [
      { date: today, title: 'Laboratório · café', start: null, stops: [{ ref: 'e1', note: null }] },
    ],
    suggestions: ['s1', 's2', 's3', 's4', 's5', 's6'].map((ref) => ({ ref, note: null })),
    quests: [],
    checklist_before: [],
    checklist_pack: [],
  };
  return aiSse(JSON.stringify(data), { data });
}

/** A posição já permitida no mapa (D176): a pergunta do app, no Dexie do aparelho. */
const GEO_CONSENT = `new Promise((resolve, reject) => {
  const req = indexedDB.open('viajei');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const tx = db.transaction('sync_state', 'readwrite');
    tx.objectStore('sync_state').put({ key: 'geo:asked', value: 'granted' });
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => reject(tx.error);
  };
})`;

export async function appConversa(ctx: ImportContext, today: string): Promise<Check> {
  const { a, appUrl } = ctx;
  const startedAt = Date.now();
  const data: Record<string, unknown> = { fonte: 'geoapify' };
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  let trip = '';
  const skip: { reason: string | null } = { reason: null };
  const step = async (name: string, run: () => Promise<void>) => {
    if (steps.some((x) => !x.ok) || skip.reason) return;
    try {
      await run();
      steps.push({ step: name, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      steps.push({ step: name, ok: false, detail: message.slice(0, 300) });
      await page
        ?.screenshot({ path: join(ctx.artifactsDir, 'app_conversa.png'), fullPage: true })
        .catch(() => undefined);
    }
  };

  try {
    browser = await chromium.launch({ channel: 'chromium' });
    const context = await browser.newContext({
      ...DEVICE,
      geolocation: CANELA,
      permissions: ['geolocation'],
    });
    await context.addInitScript({ content: QUIET });
    // a IA respondida aqui: nenhuma leitura real (a do dia é a do `app_importar`)
    await context.route('**/functions/v1/plan-trip', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        step: string;
        kind: string;
        context: Record<string, unknown>;
        places?: { chosen: unknown[]; suggestions: unknown[] };
      };
      data.pedido = {
        passo: body.step,
        tipo: body.kind,
        posicao: body.context.position,
        tempo: body.context.weather !== null,
        alcance: body.context.reach,
        escolhas: body.places?.chosen.length ?? 0,
        sugestoes: body.places?.suggestions.length ?? 0,
      };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: escrita(today),
      });
    });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    const counts = { busca: 0, rota: 0, nominatim: 0 };
    p.on('request', (r) => {
      const url = r.url();
      if (r.method() === 'OPTIONS') return;
      if (url.includes('/functions/v1/find-places')) counts.busca += 1;
      if (url.includes('/functions/v1/route-day')) counts.rota += 1;
      if (url.startsWith('https://nominatim.openstreetmap.org/')) counts.nominatim += 1;
    });
    await enterPreview(p, appUrl, ctx.bypass);

    await step('A entra, com a posição permitida no mapa', async () => {
      await signInPage(p, appUrl, ctx.email, ctx.password);
      await p.evaluate(GEO_CONSENT);
    });
    await step(
      'o pedido de um tipo de lugar no campo: a pergunta de alcance, dita antes',
      async () => {
        await p.goto(`${appUrl}/viagens`);
        await p.getByRole('textbox', { name: INTAKE_LABEL }).fill(TEXTO);
        const t0 = Date.now();
        await p.getByRole('button', { name: 'Montar a viagem' }).click();
        // com a posição, só o alcance; sem ela, a origem também (e aí a posição não chegou)
        await p.getByText(/^Tenho \d perguntas? antes de montar\.$/).waitFor({ timeout: 30_000 });
        data.perguntas_ms = Date.now() - t0;
        const lead =
          (await p.getByText(/^Tenho \d perguntas? antes de montar\.$/).textContent()) ?? '';
        if (!lead.startsWith('Tenho 1 pergunta'))
          throw new Error(`a posição não entrou: "${lead}"`);
      },
    );
    await step('o dia: as opções do mapa de verdade, pelo menos uma', async () => {
      // as opções do alcance mudam com a hora (fase 25, D275): a primeira que o app oferece
      await p
        .getByRole('group', { name: 'Quanto tempo vocês têm?' })
        .getByRole('button')
        .first()
        .click();
      const t0 = Date.now();
      await p.getByRole('button', { name: 'Procurar no mapa' }).click();
      await p
        .locator('[data-options], [data-options="nowhere"]')
        .first()
        .waitFor({ timeout: CHECK_TIMEOUT });
      await p.locator('[data-option-group]').first().waitFor({ timeout: CHECK_TIMEOUT });
      data.busca_ms = Date.now() - t0;
      const status = await p
        .locator('[data-option-group]')
        .first()
        .getAttribute('data-option-group');
      data.busca_estado = status;
      data.opcoes = await p.locator('[data-option]').count();
      if (status === 'no_source') {
        skip.reason =
          'A busca no mapa respondeu no_source: a chave da Geoapify ainda não existe nos secrets.';
        return;
      }
      if (status !== 'ok') throw new Error(`a busca no mapa: ${String(status)}`);
      if ((data.opcoes as number) < 1) throw new Error('nenhuma opção na tela');
    });
    await step('a mais perto: o caminho, a revisão com as sugestões desligadas', async () => {
      await p.locator('[data-option]').first().click();
      const t0 = Date.now();
      await p.getByRole('button', { name: /^Traçar o caminho/ }).click();
      await p
        .getByRole('heading', { name: 'Revisar a viagem', exact: true })
        .waitFor({ timeout: CHECK_TIMEOUT });
      data.caminho_ms = Date.now() - t0;
      const sugestoes = p.getByRole('checkbox', { name: /, sugestão no caminho$/ });
      data.sugestoes = await sugestoes.count();
      for (let i = 0; i < (data.sugestoes as number); i++) {
        if ((await sugestoes.nth(i).getAttribute('aria-checked')) !== 'false') {
          throw new Error('uma sugestão nasceu ligada');
        }
      }
      data.busca_chamadas = counts.busca;
      data.rota_chamadas = counts.rota;
      data.nominatim_buscas = counts.nominatim;
    });
    await step('a viagem de hoje nasce e abre no mapa', async () => {
      await p.getByRole('button', { name: 'Criar a viagem' }).click();
      await p.waitForURL(/\/viagens\/[0-9a-f-]{36}$/);
      trip = new URL(p.url()).pathname.split('/')[2] ?? '';
      await p.getByRole('region', { name: 'Agora' }).waitFor({ timeout: 30_000 });
    });
    await step(
      'no servidor: exatamente a saída, o escolhido e a chegada, com o lugar do mapa',
      async () => {
        const end = Date.now() + 60_000;
        let stops: { kind: string; lat: number | null; source: string }[] = [];
        while (Date.now() < end) {
          stops = must(
            await a.client.from('stops').select('kind, lat, source').eq('trip_id', trip),
            'as paradas da saída de hoje',
          );
          if (stops.length >= 3) break;
          await sleep(2_000);
        }
        const [row] = must(
          await a.client.from('trips').select('start_date, end_date').eq('id', trip),
          'a viagem de hoje',
        );
        if (row?.start_date !== today || row.end_date !== today) {
          throw new Error(`a viagem não é de hoje: ${String(row?.start_date)}`);
        }
        data.paradas = stops.length;
        // a saída, a escolha e a chegada: nenhuma sugestão entrou sozinha
        if (stops.length !== 3) throw new Error(`${String(stops.length)} paradas (eram 3)`);
        if (stops.filter((x) => x.kind === 'origin').length !== 2)
          throw new Error('sem a saída e a chegada');
        if (stops.some((x) => x.lat === null))
          throw new Error('uma parada chegou sem o lugar do mapa');
        if (!stops.every((x) => x.source === 'ai')) throw new Error('parada sem a origem ai');
      },
    );
  } finally {
    await browser?.close().catch(() => undefined);
    if (trip) await dropLabTrip(a, trip).catch(() => undefined);
  }

  const failed = steps.find((x) => !x.ok);
  if (!failed && skip.reason) {
    return {
      scenario: 'app_conversa',
      status: 'skip',
      latency_ms: Date.now() - startedAt,
      detail: skip.reason,
      data: { ...data, passos: steps },
    };
  }
  return {
    scenario: 'app_conversa',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `Saída de hoje pelas opções do mapa: ${String(data.opcoes)} opções em ${typeof data.busca_ms === 'number' ? `${(data.busca_ms / 1000).toFixed(1)} s` : '?'}, ${String(data.sugestoes)} sugestões desligadas, a viagem com exatamente o escolhido`,
    data: { ...data, passos: steps },
  };
}
