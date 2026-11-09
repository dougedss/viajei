import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  FORGED,
  forgedPoint,
  forgedReverse,
  forgedRouteDay,
  postoFix,
} from '../src/features/lab/forged-stop.ts';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir, linhas } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';

/**
 * A parada que se registra sozinha com o mapa aberto (fase 15). Montado como o `gps.spec` da
 * leitura única, que é como o laboratório monta o navegador: o Chromium inteiro (canal `chromium`),
 * a posição posta ao abrir e sem permissão, a permissão dada só antes do toque em "Usar posição". O
 * detector lê as posições do `watchPosition`; o relógio é o de mentira do Playwright, andando por
 * `runFor` (o `fastForward` pausaria o relógio e o Dexie reexecuta as leituras vivas por timer).
 * A estrada, o posto e a resposta do Nominatim são os forjados de `src/features/lab/forged-stop.ts`:
 * a `route-day` e o `/reverse` respondidos aqui, nada vai à rede de fora.
 */
const SAIDA = 'Saída da estrada';
const PARQUE = 'Parque da serra';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

/** A viagem de hoje: a saída deixada há 30 min, o parque a 20 km; o posto fica no meio, fora dela. */
async function viagemDeHoje(userId: string): Promise<{ tripId: string }> {
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const left = new Date(Date.now() - 30 * 60_000).toISOString();
  const today = dateInSaoPaulo(0);
  await inserir('trips', [
    {
      id: tripId,
      owner_id: userId,
      name: `Posto ${String(Date.now())}`,
      start_date: today,
      end_date: today,
      updated_at: now,
    },
  ]);
  const day = uuidV5(tripId, today);
  await inserir('trip_days', [{ id: day, trip_id: tripId, date: today, updated_at: now }]);
  const saida = forgedPoint(FORGED.originX);
  const parque = forgedPoint(FORGED.parkX);
  const base = { trip_id: tripId, trip_day_id: day, travel_minutes_to_next: null, updated_at: now };
  await inserir('stops', [
    {
      ...base,
      id: uuidV4(),
      position: 'a0',
      kind: 'origin',
      name: SAIDA,
      time: '07:00',
      lat: saida.latitude,
      lng: saida.longitude,
      done_at: left,
      done_by: userId,
      departed_at: left,
    },
    {
      ...base,
      id: uuidV4(),
      position: 'a1',
      kind: 'nature',
      name: PARQUE,
      time: '18:00',
      lat: parque.latitude,
      lng: parque.longitude,
      // as mesmas chaves da saída: o PostgREST exige num insert de várias linhas
      done_at: null,
      done_by: null,
      departed_at: null,
    },
  ]);
  return { tripId };
}

/** A rota do dia e o Nominatim, forjados; conta as chamadas ao `/reverse`. */
async function mundoForjado(context: BrowserContext): Promise<{ reverse: () => number }> {
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
  return { reverse: () => calls };
}

type Aberto = { browser: Browser; context: BrowserContext; page: Page; reverse: () => number };

/** O navegador como o do laboratório, já na tela da viagem, com a posição permitida e acompanhada. */
async function abrir(email: string): Promise<Aberto> {
  const use = test.info().project.use;
  const browser = await chromium.launch({ ...use.launchOptions, channel: 'chromium' });
  const context = await browser.newContext({
    ...use,
    geolocation: forgedPoint(6_000),
    permissions: [],
  });
  const { reverse } = await mundoForjado(context);
  const page = await context.newPage();
  // a lista no lugar da maquete: o detector é da tela, não da maquete
  await page.addInitScript(() => localStorage.setItem('viajei:world:render', 'list'));
  await page.clock.install();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: PARQUE })).toBeVisible({ timeout: 15_000 });
  await context.grantPermissions(['geolocation'], { origin: new URL(page.url()).origin });
  await page.getByRole('button', { name: 'Usar posição' }).click();
  await expect(page.locator('[data-gps][data-fix-at]')).toBeAttached({ timeout: 15_000 });
  return { browser, context, page, reverse };
}

/**
 * O carro anda pela estrada, sai dela e fica parado no posto, a 80 m da linha: uma leitura por
 * minuto, com o tremor do GPS. Na 9ª leitura (8 min depois da primeira) a parada se registra; o
 * teste para aí, com o relógio andando sozinho, para o registro (o Dexie e o `/reverse`, com o prazo
 * de 6 s) não ser atropelado por um `runFor` de um minuto.
 */
async function pararNoPosto({ context, page }: Aberto): Promise<void> {
  for (const x of [6_500, 7_000, 7_500, 7_900]) {
    await context.setGeolocation(forgedPoint(x));
    await page.clock.runFor(5_000);
  }
  for (let i = 0; i <= 8; i++) {
    await context.setGeolocation(postoFix(i));
    if (i < 8) await page.clock.runFor('01:00');
  }
}

/** Os nomes da lista do dia, em ordem. */
const ordem = (page: Page) => page.locator('[data-stop-row]').allInnerTexts();

async function semRolagem(page: Page, onde: string): Promise<void> {
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde}: rolagem lateral`).toEqual([]);
  const size = page.viewportSize();
  if (!size) return;
  await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde} a 360 px`).toEqual([]);
  await page.setViewportSize(size);
}

const autoNoServidor = (tripId: string) =>
  linhas(
    'stops',
    `trip_id=eq.${tripId}&source=eq.auto&select=name,kind,done_at,departed_at,deleted_at`,
  );

test('9 min parado a 80 m da estrada: a parada se registra sozinha como Posto, na ordem, e o Desfazer apaga', async () => {
  test.setTimeout(180_000);
  const user = await criarUsuario('Posto');
  const { tripId } = await viagemDeHoje(user.id);
  const aberto = await abrir(user.email);
  const { page } = aberto;

  await test.step('para no posto: o toast com o nome do OSM e o Desfazer', async () => {
    await pararNoPosto(aberto);
    await expect(
      page.getByText(`Parada registrada: ${FORGED.postoName}`, { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'Desfazer' })).toBeVisible();
    // uma chamada ao OSM por parada
    expect(aberto.reverse()).toBe(1);
    // na lista do dia, entre a saída e o parque (a ordem do horário), e nada de "+10" (ninguém tocou)
    await expect.poll(() => ordem(page)).toEqual([SAIDA, FORGED.postoName, PARQUE]);
    await expect(page.locator('[data-xp-gain]')).toHaveCount(0);
  });

  await test.step('o Desfazer apaga a parada, no aparelho e no servidor', async () => {
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect.poll(() => ordem(page), { timeout: 10_000 }).toEqual([SAIDA, PARQUE]);
    await expect
      .poll(async () => (await autoNoServidor(tripId)).map((s) => s.deleted_at !== null), {
        timeout: 20_000,
      })
      .toEqual([true]);
  });

  await test.step('desfeita, não volta: o carro sai, volta ao mesmo posto e nada se registra em 2 h', async () => {
    for (const x of [8_300, 8_800, 8_300]) {
      await aberto.context.setGeolocation(forgedPoint(x));
      await page.clock.runFor(5_000);
    }
    for (let i = 20; i <= 29; i++) {
      await aberto.context.setGeolocation(postoFix(i));
      await page.clock.runFor('01:00');
    }
    // nenhuma parada nova: nem na lista, nem no servidor, nem outra chamada ao OSM (o toast de antes
    // pode continuar no DOM: com o relógio de mentira, a animação de saída dele não termina)
    expect(await ordem(page)).toEqual([SAIDA, PARQUE]);
    expect((await autoNoServidor(tripId)).map((s) => s.deleted_at !== null)).toEqual([true]);
    expect(aberto.reverse()).toBe(1);
  });

  await aberto.context.close();
  await aberto.browser.close();
});

test('sem rede no posto: "Parada às …" com as coordenadas, e o nome do OSM quando a rede volta', async () => {
  test.setTimeout(180_000);
  const user = await criarUsuario('Posto');
  const { tripId } = await viagemDeHoje(user.id);
  const aberto = await abrir(user.email);
  const { page, context } = aberto;

  await test.step('sem sinal, a parada nasce com o nome pela hora medida da chegada', async () => {
    await context.setOffline(true);
    await pararNoPosto(aberto);
    const toast = page.getByText(/^Parada registrada: Parada às \d\dh\d\d$/);
    await expect(toast).toBeVisible({ timeout: 20_000 });
    expect(aberto.reverse()).toBe(0);
    await expect
      .poll(async () => (await ordem(page)).join(' › '))
      .toMatch(new RegExp(`^${SAIDA} › Parada às \\d\\dh\\d\\d › ${PARQUE}$`));
  });

  await test.step('a rede volta: o nome do OSM chega pela outbox, uma chamada só', async () => {
    await context.setOffline(false);
    await expect
      .poll(() => ordem(page), { timeout: 30_000 })
      .toEqual([SAIDA, FORGED.postoName, PARQUE]);
    expect(aberto.reverse()).toBe(1);
    await expect
      .poll(
        async () =>
          (await autoNoServidor(tripId)).map((s) => `${String(s.name)}|${String(s.kind)}`),
        {
          timeout: 20_000,
        },
      )
      .toEqual([`${FORGED.postoName}|fuel`]);
  });

  await test.step('o nome comprido do OSM cabe na tela, na lista e na folha da parada', async () => {
    await semRolagem(page, 'a lista do dia');
    // o "Como foi?" do posto, com o nome comprido em três linhas, cobre a lista a 659 px de altura
    // (o limite da D177: o cartão da vez cobre o pé do palco até ser dispensado); como o app_maquete
    const comoFoi = page.getByRole('region', { name: `Como foi ${FORGED.postoName}?` });
    await comoFoi.getByRole('button', { name: 'Dispensar' }).click();
    await expect(comoFoi).toHaveCount(0);
    await page.getByRole('button', { name: FORGED.postoName, exact: true }).click();
    const folha = page.getByRole('dialog', { name: FORGED.postoName });
    await expect(folha).toBeVisible();
    await expect(folha.locator('[data-auto-stop]')).toContainText('Registrada sozinha pelo GPS');
    await expect(folha.locator('[data-osm-credit]')).toContainText('OpenStreetMap');
    await expect(folha).toContainText('Posto');
    await semRolagem(page, 'a folha da parada');
    await page.keyboard.press('Escape');
    await expect(folha).toHaveCount(0);
  });

  await test.step('o carro volta à estrada: a saída medida fecha a parada', async () => {
    for (const x of [8_200, 8_600, 9_000, 9_500]) {
      await context.setGeolocation(forgedPoint(x));
      await page.clock.runFor(5_000);
    }
    await expect
      .poll(async () => (await autoNoServidor(tripId)).map((s) => s.departed_at !== null), {
        timeout: 20_000,
      })
      .toEqual([true]);
  });

  await context.close();
  await aberto.browser.close();
});
