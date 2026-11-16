import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { forgedPoint, forgedRouteDay } from '../src/features/lab/forged-stop.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir, linhas } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { andar, posicionar, redeDa, type Rede } from './helpers/relogio.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';

/**
 * Uma ida e volta pela mesma estrada (fase 24), o teste realista de 15/11 em miniatura: a saída de
 * casa, um parque a 10 km e a chegada em casa, com a mesma coordenada da saída. O molde é o
 * `parada-auto.spec`: o Chromium inteiro, a `route-day` respondida aqui (a estrada forjada, que vai e
 * volta pela mesma linha), a posição forjada andando por ela e o relógio do Playwright para as regras
 * de 3 min. O que se prova: ao sair de casa ninguém pergunta pela chegada; sair do parque não conclui
 * o dia; a porcentagem do caminho nunca anda para trás na volta; chegar em casa dispara o Chegamos!
 * sozinho, e só aí o dia se conclui.
 */
const CASA = 'Saída de casa';
const PARQUE = 'Parque da ida e volta';
const CHEGADA = 'Chegada em casa';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

async function viagemDeHoje(
  userId: string,
): Promise<{ tripId: string; ids: Record<string, string> }> {
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const left = new Date(Date.now() - 10 * 60_000).toISOString();
  const today = dateInSaoPaulo(0);
  await inserir('trips', [
    {
      id: tripId,
      owner_id: userId,
      name: `Ida e volta ${String(Date.now())}`,
      start_date: today,
      end_date: today,
      updated_at: now,
    },
  ]);
  const day = uuidV5(tripId, today);
  await inserir('trip_days', [{ id: day, trip_id: tripId, date: today, updated_at: now }]);
  const casa = forgedPoint(0);
  const parque = forgedPoint(10_000);
  const ids = { casa: uuidV4(), parque: uuidV4(), chegada: uuidV4() };
  const base = { trip_id: tripId, trip_day_id: day, travel_minutes_to_next: null, updated_at: now };
  const row = (
    id: string,
    position: string,
    kind: string,
    name: string,
    time: string,
    p: typeof casa,
  ) => ({
    ...base,
    id,
    position,
    kind,
    name,
    time,
    lat: p.latitude,
    lng: p.longitude,
    done_at: null as string | null,
    done_by: null as string | null,
    departed_at: null as string | null,
  });
  await inserir('stops', [
    // a saída de casa já foi deixada há 10 min
    {
      ...row(ids.casa, 'a0', 'origin', CASA, '07:00', casa),
      done_at: left,
      done_by: userId,
      departed_at: left,
    },
    row(ids.parque, 'a1', 'nature', PARQUE, '13:00', parque),
    // a chegada em casa é escrita como a IA, a importação e o pedido para outras IAs escrevem
    row(ids.chegada, 'a2', 'origin', CHEGADA, '18:00', casa),
  ]);
  return { tripId, ids };
}

type Aberto = { context: BrowserContext; page: Page; rede: Rede; close: () => Promise<void> };

async function abrir(email: string): Promise<Aberto> {
  const use = test.info().project.use;
  const browser = await chromium.launch({ ...use.launchOptions, channel: 'chromium' });
  const context = await browser.newContext({
    ...use,
    geolocation: forgedPoint(600),
    permissions: [],
  });
  await context.route('**/functions/v1/route-day', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as { waypoints: [number, number][] };
    await route.fulfill({ json: forgedRouteDay(body.waypoints), headers: CORS });
  });
  // a parada automática pergunta o lugar ao Nominatim: nada vai à rede de fora
  await context.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: {}, headers: { 'access-control-allow-origin': '*' } }),
  );
  const page = await context.newPage();
  const rede = redeDa(page);
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
  return { context, page, rede, close: () => browser.close() };
}

/** "37% do caminho do dia": a fração que o "Agora" mostra, ou null sem ela. */
async function fracao(page: Page): Promise<number | null> {
  const text =
    (await page
      .getByText(/% do caminho do dia/)
      .first()
      .textContent()
      .catch(() => null)) ?? '';
  const m = /(\d+)% do caminho do dia/.exec(text);
  return m ? Number(m[1]) : null;
}

/** O carro em `x` metros da estrada forjada, com a leitura entregue e o relógio andando um pouco. */
async function em({ context, page, rede }: Aberto, x: number, ms = 5_000): Promise<void> {
  await posicionar(context, page, forgedPoint(x));
  await andar(page, rede, ms);
}

/** Parado num ponto por 4 min, uma leitura por minuto com o tremor do GPS: a presença de 3 min. */
async function parado(a: Aberto, x: number): Promise<void> {
  for (let i = 0; i <= 4; i++) await em(a, x + (i % 2 === 0 ? 6 : -6), 60_000);
}

const doServidor = async (tripId: string) =>
  Object.fromEntries(
    (await linhas('stops', `trip_id=eq.${tripId}&select=name,done_at,departed_at`)).map((s) => [
      s.name as string,
      { done: s.done_at !== null, departed: s.departed_at !== null },
    ]),
  );

test('ida e volta pela mesma estrada: a chegada em casa é um nó de chegada, e a fração não volta', async () => {
  test.setTimeout(240_000);
  const user = await criarUsuario('IdaVolta');
  const { tripId } = await viagemDeHoje(user.id);
  const a = await abrir(user.email);
  const { page } = a;
  try {
    // a ida: a fração anda, e ninguém pergunta "Vocês passaram por Chegada em casa?" ao sair de casa
    const ida: number[] = [];
    for (const x of [1_000, 3_000, 6_000]) {
      await em(a, x);
      await expect.poll(() => fracao(page), { timeout: 15_000 }).not.toBeNull();
      ida.push((await fracao(page)) ?? -1);
    }
    expect(ida[0]).toBeLessThan(ida[2] ?? 0);
    expect(ida[2]).toBeLessThan(50);
    await expect(page.getByLabel(`Vocês passaram por ${CHEGADA}`)).toHaveCount(0);

    // no parque, a presença de 3 min: o Chegamos! sozinho
    await parado(a, 10_000);
    await expect
      .poll(async () => (await doServidor(tripId))[PARQUE]?.done, { timeout: 30_000 })
      .toBe(true);

    // sair do parque: o Partiu! sozinho grava a saída dele, e o dia NÃO se conclui (o defeito de 15/11)
    await em(a, 9_500);
    await em(a, 9_000);
    await expect
      .poll(async () => (await doServidor(tripId))[PARQUE]?.departed, { timeout: 30_000 })
      .toBe(true);
    await expect(page.getByText('Dia concluído')).toHaveCount(0);
    expect((await doServidor(tripId))[CHEGADA]).toEqual({ done: false, departed: false });
    await expect(page.getByText(/chega às/).first()).toBeVisible();

    // a volta pela mesma estrada: a fração nunca anda para trás (46% → 28% → 11% em 15/11)
    const volta: number[] = [];
    for (const x of [7_000, 5_000, 3_000, 1_000]) {
      await em(a, x);
      volta.push((await fracao(page)) ?? -1);
    }
    for (let i = 1; i < volta.length; i++) expect(volta[i]).toBeGreaterThan(volta[i - 1] ?? 101);
    expect(volta[0]).toBeGreaterThan(50);

    // em casa, a presença de 3 min: o Chegamos! sozinho, e só aí o dia se conclui
    await parado(a, 0);
    await expect
      .poll(async () => (await doServidor(tripId))[CHEGADA]?.done, { timeout: 30_000 })
      .toBe(true);
    await expect(page.getByText('Dia concluído').first()).toBeVisible({ timeout: 15_000 });
  } finally {
    await a.close();
  }
});
