import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage, TIMEOUT } from './app.ts';
import { syncPush } from './client.ts';
import type { Check } from './evaluate.ts';
import { clean } from './road.ts';
import { kindsOnly, sleep, type Session } from './session.ts';

/**
 * Os cenários da fase 11 no navegador (D151), contra o app publicado (o preview da branch ou a
 * produção), com os serviços de verdade:
 *  - `app_mapa`: uma viagem fixa de hoje com três paradas reais na serra; o mapa abre com os tiles do
 *    OSM, num viewport de celular e num zoom só, sem arrastar (umas dezenas de tiles, dentro da
 *    política); confere os pinos, a rota real (`route-day`), a atribuição visível, pelo menos um tile
 *    no cache `osm-tiles` com status 200 e, sem rede, depois de recarregar, os tiles do cache e o aviso;
 *  - `app_clima`: a mesma viagem na visão geral, com o Open-Meteo de verdade pelo navegador: a faixa
 *    tem os números de hoje; sem rede, depois de recarregar, aparece o "atualizado às".
 * A viagem segue a D53: id fixo, paradas novas a cada execução, avisos desligados.
 */
export type MapContext = {
  appUrl: string;
  bypass: string | null;
  a: Session;
  email: string;
  password: string;
  artifactsDir: string;
};

export const LAB_MAP = {
  name: 'Laboratório · mapa e clima',
  stops: [
    {
      kind: 'origin',
      name: 'Saída do laboratório no mapa',
      time: '08:00',
      lat: -29.37929,
      lng: -50.8737,
    },
    {
      kind: 'nature',
      name: 'Cascata do laboratório no mapa',
      time: '09:30',
      lat: -29.31295,
      lng: -50.85197,
    },
    {
      kind: 'city',
      name: 'Lago do laboratório no mapa',
      time: '15:00',
      lat: -29.39206,
      lng: -50.88049,
    },
  ],
} as const;

async function prepareMap(a: Session, today: string): Promise<{ trip: string; day: string }> {
  const trip = await uuidV5(a.uid, 'lab:mapa');
  const day = await uuidV5(trip, today);
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: LAB_MAP.name,
        start_date: today,
        end_date: today,
        budget: null,
        deleted_at: null,
      },
    },
    {
      table: 'notification_prefs',
      id: await uuidV5(a.uid, trip),
      op: 'upsert',
      values: {
        user_id: a.uid,
        trip_id: trip,
        enabled: false,
        lead_minutes: 15,
        morning_time: '07:00',
        kinds: kindsOnly(),
      },
    },
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date: today, title: null, notes: null, deleted_at: null },
    },
  ]);
  await clean(a, [trip], [day]);
  await syncPush(
    a.client,
    LAB_MAP.stops.map((s, i) => ({
      table: 'stops',
      id: randomUUID(),
      op: 'upsert' as const,
      values: {
        trip_id: trip,
        trip_day_id: day,
        position: `a${String(i)}`,
        kind: s.kind,
        name: s.name,
        time: s.time,
        lat: s.lat,
        lng: s.lng,
        travel_minutes_to_next: null,
        departed_at: null,
        done_at: null,
        done_by: null,
        skipped: false,
        deleted_at: null,
      },
    })),
  );
  return { trip, day };
}

/** O que o Cache Storage `osm-tiles` guardou: quantos tiles e os status das respostas. */
const CACHED = `caches.open('osm-tiles').then(async (c) => {
  const keys = await c.keys();
  const statuses = await Promise.all(keys.map(async (k) => (await c.match(k))?.status ?? -1));
  return { count: keys.length, statuses: [...new Set(statuses)] };
})`;

/** A atribuição visível e por cima de tudo no canto dela (nada a cobre). */
const ATTRIBUTION_ON_TOP = `(() => {
  const el = document.querySelector('.leaflet-control-attribution');
  if (!el || !/OpenStreetMap/.test(el.textContent || '')) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  return [[r.left + 4, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]]
    .every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
})()`;

type Step = { step: string; ok: boolean; detail?: string };

/** Os passos de um cenário: param no primeiro que falha, com um print da página. */
class Steps {
  readonly list: Step[] = [];
  /** quando o primeiro passo começou: a duração do cenário */
  startedAt: number | null = null;
  readonly #page: () => Page | null;
  readonly #shot: string;
  constructor(page: () => Page | null, shot: string) {
    this.#page = page;
    this.#shot = shot;
  }
  get failed(): Step | undefined {
    return this.list.find((s) => !s.ok);
  }
  passed(name: string): boolean {
    return this.list.some((s) => s.step === name && s.ok);
  }
  async run(name: string, fn: () => Promise<void>): Promise<void> {
    if (this.failed) return;
    this.startedAt ??= Date.now();
    try {
      await fn();
      this.list.push({ step: name, ok: true });
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
      this.list.push({ step: name, ok: false, detail: message.slice(0, 300) });
      await this.#page()
        ?.screenshot({ path: this.#shot, fullPage: true })
        .catch(() => undefined);
    }
  }
}

function check(
  scenario: 'app_mapa' | 'app_clima',
  steps: Steps,
  okText: string,
  data: object,
): Check {
  const failed = steps.failed;
  return {
    scenario,
    status: failed ? 'fail' : 'pass',
    latency_ms: steps.startedAt === null ? null : Date.now() - steps.startedAt,
    detail: failed ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}` : okText,
    data: { ...data, passos: steps.list },
  };
}

export async function appMapaClima(ctx: MapContext, today: string): Promise<Check[]> {
  const { a, appUrl } = ctx;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let trip = '';
  let day = '';
  const map = new Steps(() => page, join(ctx.artifactsDir, 'app_mapa.png'));
  const clima = new Steps(() => page, join(ctx.artifactsDir, 'app_clima.png'));
  const mapData: {
    primeiro_quadro_ms?: number;
    tiles_na_tela?: number;
    tiles_no_cache?: number;
    tiles_sem_rede?: number;
  } = {};
  const climaData: { hoje?: { max: string; min: string }; atualizado?: string } = {};
  const ENTER = 'A entra e o service worker assume';
  try {
    await map.run('preparo da viagem do mapa', async () => {
      ({ trip, day } = await prepareMap(a, today));
    });
    browser = await chromium.launch({ channel: 'chromium' });
    context = await browser.newContext({ ...DEVICE, permissions: [], serviceWorkers: 'allow' });
    await context.addInitScript({ content: QUIET });
    page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT);
    const p = page;
    const c = context;
    await enterPreview(p, appUrl, ctx.bypass);

    await map.run(ENTER, async () => {
      await signInPage(p, appUrl, ctx.email, ctx.password);
      await p.evaluate('navigator.serviceWorker.ready.then(() => true)');
      await p.reload();
      for (let i = 0; i < 20; i++) {
        if (await p.evaluate('navigator.serviceWorker.controller !== null')) return;
        await sleep(500);
      }
      throw new Error('o service worker não assumiu a página');
    });
    await map.run('o mapa abre com os pinos, a rota real e os tiles', async () => {
      const t0 = Date.now();
      await p.goto(`${appUrl}/viagens/${trip}/mapa?dia=${day}`);
      const frame = p.locator(`[data-map="${day}"]`);
      await frame.locator('[data-map-pin]').nth(2).waitFor({ timeout: 30_000 });
      if ((await frame.locator('[data-map-pin]').count()) !== 3) throw new Error('não são 3 pinos');
      await frame.locator('[data-map-route="route"]').nth(1).waitFor({ timeout: 60_000 });
      await frame.locator('img.leaflet-tile-loaded').first().waitFor({ timeout: 30_000 });
      mapData.primeiro_quadro_ms = Date.now() - t0;
      await sleep(2_000);
      mapData.tiles_na_tela = await frame.locator('img.leaflet-tile-loaded').count();
    });
    await map.run('a atribuição está visível e nada a cobre', async () => {
      if (!(await p.evaluate(ATTRIBUTION_ON_TOP)))
        throw new Error('a atribuição está coberta ou some');
    });
    await map.run('os tiles vistos estão no cache, com status 200', async () => {
      let cached = { count: 0, statuses: [] as number[] };
      for (let i = 0; i < 20 && cached.count === 0; i++) {
        cached = await p.evaluate<typeof cached>(CACHED);
        if (cached.count === 0) await sleep(500);
      }
      mapData.tiles_no_cache = cached.count;
      if (cached.count === 0) throw new Error('nenhum tile no cache osm-tiles');
      if (cached.statuses.some((s) => s !== 200)) {
        throw new Error(`status no cache: ${cached.statuses.join(', ')}`);
      }
    });
    await map.run('sem rede, recarrega: os tiles do cache e o aviso', async () => {
      await c.setOffline(true);
      await p.reload();
      const frame = p.locator(`[data-map="${day}"]`);
      await frame
        .locator('[data-map-offline]')
        .filter({ hasText: 'Sem internet: o mapa mostra só as áreas já vistas neste aparelho' })
        .waitFor({ timeout: 20_000 });
      await frame.locator('[data-map-pin]').nth(2).waitFor();
      await frame.locator('[data-map-route="route"]').nth(1).waitFor();
      await frame.locator('img.leaflet-tile-loaded').first().waitFor({ timeout: 20_000 });
      await sleep(1_500);
      mapData.tiles_sem_rede = await frame.locator('img.leaflet-tile-loaded').count();
      await c.setOffline(false);
    });

    // o clima não depende do mapa: só da viagem preparada e de A ter entrado
    if (!map.passed(ENTER)) {
      clima.list.push({ step: 'A entra', ok: false, detail: 'o preparo ou a entrada falharam' });
    }
    await clima.run('a faixa da visão geral tem os números de hoje', async () => {
      await c.setOffline(false);
      await p.goto(`${appUrl}/viagens/${trip}`);
      const tile = p.locator(`[data-weather-strip] [data-weather-day="${today}"]`);
      await tile.locator('[data-weather-max]').waitFor({ timeout: 30_000 });
      const max = (await tile.locator('[data-weather-max]').textContent()) ?? '';
      const min = (await tile.locator('[data-weather-min]').textContent()) ?? '';
      climaData.hoje = { max, min };
      if (!/^-?\d+°$/.test(max) || !/^-?\d+°$/.test(min)) throw new Error(`números: ${max} ${min}`);
      const link = p.locator('[data-weather-strip]').getByRole('link', {
        name: 'Dados do tempo: Open-Meteo.com',
      });
      if ((await link.getAttribute('href')) !== 'https://open-meteo.com/') {
        throw new Error('sem a atribuição do Open-Meteo');
      }
    });
    await clima.run('sem rede, recarrega: o "atualizado às"', async () => {
      await c.setOffline(true);
      await p.reload();
      const updated = p.locator('[data-weather-strip] [data-weather-updated]');
      await updated.waitFor({ timeout: 20_000 });
      const text = (await updated.textContent()) ?? '';
      climaData.atualizado = text;
      if (!/^Sem internet · atualizado (às|ontem às|em \d\d\/\d\d às) \d\d:\d\d$/.test(text)) {
        throw new Error(`"${text}"`);
      }
      await c.setOffline(false);
    });
  } finally {
    await context?.setOffline(false).catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
  return [
    check(
      'app_mapa',
      map,
      `Pinos, rota real e atribuição; ${String(mapData.tiles_no_cache ?? '?')} tiles no cache (200) e ${String(mapData.tiles_sem_rede ?? '?')} na tela sem rede`,
      mapData,
    ),
    check(
      'app_clima',
      clima,
      `Hoje ${climaData.hoje?.max ?? '?'} / ${climaData.hoje?.min ?? '?'} pelo Open-Meteo; sem rede, "${climaData.atualizado ?? ''}"`,
      climaData,
    ),
  ];
}
