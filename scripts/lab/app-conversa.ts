import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { ImportStop } from '../../supabase/functions/_shared/import-schema.ts';
import { aiPlan } from '../../e2e/helpers/import.ts';
import { INTAKE_LABEL } from '../../src/features/intake/start.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { must } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { Check } from './evaluate.ts';
import type { ImportContext } from './app-import.ts';
import { sleep } from './session.ts';

/**
 * `app_conversa` (fase 17): "quero sair hoje", na produção ou no preview, sem leitura real da IA (a
 * `plan-trip` respondida no próprio navegador, como no e2e), e com o mapa de verdade: o lab-a, com a
 * posição em Canela permitida no mapa, escreve no campo, responde a pergunta de alcance, e o roteiro
 * proposto (dois lugares que existem e um inventado) passa pela conferência no Overpass e no
 * Nominatim de verdade, do navegador, dentro da política deles (uma consulta ao Overpass, poucas
 * buscas, uma por vez). O inventado sai; a viagem de hoje nasce e abre no mapa; no fim, o expurgo do
 * laboratório a tira. Guarda em `data` o que foi para a IA (sem texto da pessoa: o lab-a), os tempos
 * e as contagens das consultas.
 */
const CANELA = { latitude: -29.3655, longitude: -50.8128 };
const REAIS = ['Cascata do Caracol', 'Lago Negro'] as const;
const INVENTADO = 'Mirante Inventado do Laboratório';
const CHECK_TIMEOUT = 90_000;

const stop = (
  kind: ImportStop['kind'],
  name: string,
  address: string,
  time: string,
): ImportStop => ({
  time,
  kind,
  name,
  address,
  closes_at: null,
  travel_minutes_to_next: null,
  notes: null,
  url: null,
  lat: null,
  lng: null,
});

/** O roteiro que a "IA" do laboratório propõe: a saída de hoje em Canela, com um lugar inventado. */
function proposal(today: string): string {
  return aiPlan(
    {
      days: [
        {
          date: today,
          title: 'Laboratório · tarde na serra',
          stops: [
            stop('origin', 'Saída de Canela', 'Canela, RS', '14:00'),
            stop('nature', REAIS[0], 'Canela, RS', '14:20'),
            stop('nature', INVENTADO, 'Canela, RS', '15:30'),
            stop('nature', REAIS[1], 'Gramado, RS', '17:00'),
          ],
        },
      ],
      reservations: [],
      contacts: [],
      checklist_before: [],
      checklist_pack: [],
      quests: [],
      unclassified: [],
    },
    {
      name: 'Laboratório · saída de hoje',
      start_date: today,
      end_date: today,
      origin: 'Canela, RS',
      budget: null,
    },
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
  const data: Record<string, unknown> = {};
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  let browser: Browser | null = null;
  let page: Page | null = null;
  let trip = '';
  const outage: { reason: string | null } = { reason: null };
  // como o Overpass respondeu: no preview da fase 17 ele não ajudou, e só a contagem não dizia por quê
  const overpassHttp: { status: number | 'sem resposta' | null } = { status: null };
  const step = async (name: string, run: () => Promise<void>) => {
    if (steps.some((s) => !s.ok) || outage.reason) return;
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
      const body = route.request().postDataJSON() as {
        step: string;
        kind: string;
        context: Record<string, unknown>;
      };
      data.pedido = {
        passo: body.step,
        tipo: body.kind,
        posicao: body.context.position,
        lugar: body.context.place,
        tempo: body.context.weather !== null,
        alcance: body.context.reach,
      };
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: proposal(today),
      });
    });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    const counts = { overpass: 0, nominatim: 0 };
    p.on('request', (r) => {
      if (r.url().startsWith('https://overpass-api.de/')) counts.overpass += 1;
      if (r.url().startsWith('https://nominatim.openstreetmap.org/')) counts.nominatim += 1;
    });
    p.on('response', (r) => {
      if (r.url().startsWith('https://overpass-api.de/')) overpassHttp.status = r.status();
    });
    p.on('requestfailed', (r) => {
      if (r.url().startsWith('https://overpass-api.de/')) overpassHttp.status = 'sem resposta';
    });
    await enterPreview(p, appUrl, ctx.bypass);

    await step('A entra, com a posição permitida no mapa', async () => {
      await signInPage(p, appUrl, ctx.email, ctx.password);
      await p.evaluate(GEO_CONSENT);
    });
    await step('"quero sair hoje" no campo: a pergunta de alcance, dita antes', async () => {
      await p.goto(`${appUrl}/viagens`);
      await p.getByRole('textbox', { name: INTAKE_LABEL }).fill('quero sair hoje');
      const t0 = Date.now();
      await p.getByRole('button', { name: 'Montar a viagem' }).click();
      // com a posição, só o alcance; sem ela, a origem também (e aí a posição não chegou)
      await p.getByText(/^Tenho \d perguntas? antes de montar\.$/).waitFor({ timeout: 30_000 });
      data.perguntas_ms = Date.now() - t0;
      const lead =
        (await p.getByText(/^Tenho \d perguntas? antes de montar\.$/).textContent()) ?? '';
      if (!lead.startsWith('Tenho 1 pergunta')) throw new Error(`a posição não entrou: "${lead}"`);
    });
    await step('o dia: o roteiro conferido no mapa de verdade, e o inventado sai', async () => {
      await p.getByRole('button', { name: 'O dia' }).click();
      const t0 = Date.now();
      await p.getByRole('button', { name: 'Montar a viagem' }).click();
      await p
        .getByRole('heading', { name: 'Revisar a viagem', exact: true })
        .waitFor({ timeout: CHECK_TIMEOUT });
      data.conferencia_ms = Date.now() - t0;
      data.overpass_consultas = counts.overpass;
      data.overpass_http = overpassHttp.status;
      const notice = (await p.locator('[data-checked]').first().textContent()) ?? '';
      data.aviso = notice.slice(0, 300);
      const confirmados: string[] = [];
      for (const name of REAIS) {
        if ((await p.getByRole('checkbox', { name }).count()) > 0) confirmados.push(name);
      }
      data.confirmados = confirmados;
      data.nominatim_buscas = counts.nominatim;
      if (counts.overpass > 1) throw new Error(`${String(counts.overpass)} consultas ao Overpass`);
      // o mapa fora do ar: não é defeito do app (o Overpass e o Nominatim são serviços públicos)
      if (notice.includes('o mapa não respondeu') && confirmados.length === 0) {
        outage.reason = 'O Overpass e o Nominatim não responderam: nenhum lugar deu para conferir.';
        return;
      }
      if ((await p.getByRole('checkbox', { name: INVENTADO }).count()) > 0) {
        throw new Error('o lugar inventado passou pela conferência');
      }
      if (!notice.includes(INVENTADO)) throw new Error('a revisão não disse que o inventado saiu');
      // os dois existem: o Lago Negro saía como "não encontrado" (a classe `water` do Nominatim)
      const faltam = REAIS.filter((name) => !confirmados.includes(name));
      if (faltam.length > 0) throw new Error(`${faltam.join(' e ')}: não se confirmou no mapa`);
    });
    await step('a viagem de hoje nasce e abre no mapa', async () => {
      await p.getByRole('button', { name: 'Criar a viagem' }).click();
      await p.waitForURL(/\/viagens\/[0-9a-f-]{36}$/);
      trip = new URL(p.url()).pathname.split('/')[2] ?? '';
      await p.getByRole('region', { name: 'Agora' }).waitFor({ timeout: 30_000 });
    });
    await step(
      'no servidor: a viagem de hoje, as paradas da IA, com os lugares do mapa',
      async () => {
        const end = Date.now() + 60_000;
        let stops: { name: string; lat: number | null; source: string }[] = [];
        while (Date.now() < end) {
          stops = must(
            await a.client.from('stops').select('name, lat, source').eq('trip_id', trip),
            'as paradas da saída de hoje',
          );
          // a saída e os dois lugares reais
          if (stops.length >= 1 + REAIS.length) break;
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
        if (stops.some((s) => s.name === INVENTADO))
          throw new Error('o inventado chegou ao servidor');
        for (const name of REAIS) {
          if (stops.find((s) => s.name === name)?.lat == null)
            throw new Error(`${name} chegou sem o lugar do mapa`);
        }
        if (!stops.every((s) => s.source === 'ai')) throw new Error('parada sem a origem ai');
      },
    );
  } finally {
    await browser?.close().catch(() => undefined);
    if (trip) await dropLabTrip(a, trip).catch(() => undefined);
  }

  const failed = steps.find((s) => !s.ok);
  if (!failed && outage.reason) {
    return {
      scenario: 'app_conversa',
      status: 'skip',
      latency_ms: Date.now() - startedAt,
      detail: outage.reason,
      data: { ...data, passos: steps },
    };
  }
  return {
    scenario: 'app_conversa',
    status: failed ? 'fail' : 'pass',
    latency_ms: Date.now() - startedAt,
    detail: failed
      ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}`
      : `Saída de hoje montada e conferida no mapa em ${typeof data.conferencia_ms === 'number' ? `${(data.conferencia_ms / 1000).toFixed(1)} s` : '?'}: ${(data.confirmados as string[]).join(' e ')} confirmados, o inventado saiu (Overpass ${String(overpassHttp.status ?? '?')})`,
    data: { ...data, passos: steps },
  };
}
