import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { aiSse } from '../../e2e/helpers/import.ts';
import {
  achados,
  lugarGoogle,
  passeio,
  passo,
  planejadorSse,
  rodada,
} from '../../e2e/helpers/planner.ts';
import { INTAKE_LABEL } from '../../src/features/intake/start.ts';
import { forgedDriveTimes } from '../../src/features/lab/forged-stop.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { must } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { Check } from './evaluate.ts';
import type { ImportContext } from './app-import.ts';
import { sleep } from './session.ts';

/**
 * `app_conversa` (fase 17; refeito na fase 24; o planejador na fase 27): "quero sair hoje para um café
 * colonial", na produção ou no preview, sem leitura real da IA e sem o Google de verdade (o planejador
 * `plan-search` e a escrita `plan-trip` respondidos no próprio navegador, como no e2e, com candidatos
 * inventados perto de Canela) e com o mapa de verdade nas sugestões: o lab-a, com a posição em Canela
 * permitida no mapa, escreve no campo, responde a pergunta de alcance, vê os candidatos do passo, toca
 * no primeiro, traça o caminho (a `route-day` e o corredor dela, **as sugestões do mapa de verdade** pela
 * `find-places`, pela Geoapify), vê a revisão com as sugestões desligadas e cria a viagem com exatamente
 * o escolhido; no fim, o expurgo do laboratório a tira. Sem a chave da Geoapify (`no_source` nas
 * sugestões), o cenário é pulado com o motivo. Em `data`, só contagens, formas e tempos: nunca o pedido.
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

/** O planejador do laboratório: um passo com dois candidatos inventados perto de Canela. */
function planejado(): string {
  return planejadorSse(
    rodada(
      achados([
        lugarGoogle('lab-cafe-1', 'Café Colonial do Laboratório', -29.3605, -50.8205, 'Canela'),
        lugarGoogle('lab-cafe-2', 'Cuca & Café do Laboratório', -29.37, -50.8, 'Canela', {
          rating: 4.3,
          user_rating_count: 40,
        }),
      ]),
      passeio([passo(1, 'café colonial', ['p1', 'p2'], { relacao: 'perto_de_casa', cidade: '' })]),
    ),
  );
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
  const data: Record<string, unknown> = { fonte: 'planejador de mentira; sugestões pela geoapify' };
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
    // o planejador respondido aqui (fase 27): nenhuma IA e nenhum Google de verdade
    await context.route('**/functions/v1/plan-search', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        kind: string;
        passo_a_passo?: boolean;
        context: Record<string, unknown>;
        reference: unknown;
      };
      data.planejador = {
        tipo: body.kind,
        // o passo a passo (fase 26): o app diz que procura os passos seguintes
        passo_a_passo: body.passo_a_passo ?? false,
        posicao: body.context.position,
        referencia: body.reference,
        alcance: body.context.reach,
      };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: planejado(),
      });
    });
    const counts = { busca: 0, google: 0, rota: 0, nominatim: 0, semFonte: 0, medidas: 0 };
    // o tempo de carro respondido aqui (D310): nenhum `app_*` chama o Google; a estrada reta forjada
    await context.route('**/functions/v1/drive-times', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
        });
        return;
      }
      const body = route.request().postDataJSON() as {
        pairs: Parameters<typeof forgedDriveTimes>[0];
      };
      counts.medidas += 1;
      await route.fulfill({
        json: forgedDriveTimes(body.pairs),
        headers: { 'access-control-allow-origin': '*' },
      });
    });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    p.on('request', (r) => {
      const url = r.url();
      if (r.method() === 'OPTIONS') return;
      if (url.includes('/functions/v1/find-places')) {
        counts.busca += 1;
        // nenhum `app_*` chama o Google (a armadilha da fase 26): um passo só, e a busca por tipo
        const body = r.postData() ?? '';
        if (body.includes('"provider":"google"')) counts.google += 1;
      }
      if (url.includes('/functions/v1/route-day')) counts.rota += 1;
      if (url.startsWith('https://nominatim.openstreetmap.org/')) counts.nominatim += 1;
    });
    // a Geoapify sem chave responde no_source (503) às buscas das sugestões
    p.on('response', (r) => {
      if (r.url().includes('/functions/v1/find-places') && r.status() === 503) counts.semFonte += 1;
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
    await step('o dia: os candidatos do passo do planejador', async () => {
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
      if (status !== 'ok') throw new Error(`o passo do planejador: ${String(status)}`);
      if ((data.opcoes as number) !== 2) throw new Error('os dois candidatos não vieram à tela');
      // os cartões do Google: a nota com as avaliações e a fonte no pé
      const card = (await p.locator('[data-option]').first().textContent()) ?? '';
      if (!card.includes('avaliações')) throw new Error('o cartão sem a nota do Google');
      const foot = (await p.locator('[data-map-attribution]').textContent()) ?? '';
      if (!foot.includes('Dados do Google Maps')) throw new Error('o pé sem a fonte do Google');
    });
    await step('o primeiro: o caminho, as sugestões do mapa de verdade desligadas', async () => {
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
      data.google_chamadas = counts.google;
      if (counts.google > 0) throw new Error('o app chamou o Google de verdade no laboratório');
      data.rota_chamadas = counts.rota;
      // as medições de tempo de carro que o app pediu (respondidas aqui, sem o Google)
      data.medidas_chamadas = counts.medidas;
      data.nominatim_buscas = counts.nominatim;
      if (counts.semFonte > 0) {
        skip.reason =
          'As buscas das sugestões responderam no_source: a chave da Geoapify ainda não existe nos secrets.';
        return;
      }
      if ((data.sugestoes as number) < 1) throw new Error('nenhuma sugestão do mapa de verdade');
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
      : `Saída de hoje pelo planejador (de mentira): ${String(data.opcoes)} candidatos em ${typeof data.busca_ms === 'number' ? `${(data.busca_ms / 1000).toFixed(1)} s` : '?'}, ${String(data.sugestoes)} sugestões do mapa de verdade desligadas, a viagem com exatamente o escolhido`,
    data: { ...data, passos: steps },
  };
}
