import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { forgedRouteDay } from '../src/features/lab/forged-stop.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir, linhas } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { posicionar } from './helpers/relogio.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { fakeOpenMeteo } from './helpers/world.ts';

/**
 * O mapa por trechos (fase 28), na maquete de verdade (o SwiftShader da CI): uma ida e volta com o
 * objetivo marcado, como a conversa grava o destino dito. A estrada passa pelo centro de Major Vieira
 * (o caso da ideia; o centro é o do IBGE, do dado embutido), a casa fica 6 km a oeste e o parque 4 km a
 * leste, e a `route-day` é a estrada forjada, respondida aqui. O que se prova: sair de casa mostra a ida
 * (o trecho 1 de 2, a casa uma vez, o objetivo em cima), a linha fala do trecho, a cidade que a estrada
 * atravessa aparece uma vez; o Chegamos! no objetivo abre o "Como foi?" e a maquete segura o trecho até
 * ele fechar; aí vem a volta (o parque embaixo, a casa em cima); o indicador espia a ida e volta; a
 * linha diz "da volta"; e a chegada em casa conclui o dia. O relógio do Playwright anda como o de
 * verdade, a partir do meio-dia (de noite o texto cresce e o enquadramento muda, D237).
 */
const CASA = 'Saída de casa';
const PARQUE = 'Parque dos trechos';
const CHEGADA = 'Chegada em casa';
const CIDADE = 'Major Vieira';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};

// o centro de Major Vieira (SC) no dado do IBGE embutido no app, e a estrada reta por ele, de oeste a leste
const CENTRO = { lng: -50.327, lat: -26.371 };
const M_LNG = 111_320 * Math.cos((CENTRO.lat * Math.PI) / 180);
/** O ponto a `x` metros da casa, para leste, pela estrada que passa pelo centro da cidade. */
const ponto = (x: number) => ({
  latitude: CENTRO.lat,
  longitude: CENTRO.lng + (x - 6_000) / M_LNG,
});

async function viagemDeHoje(
  userId: string,
): Promise<{ tripId: string; ids: Record<'casa' | 'parque' | 'chegada', string> }> {
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const left = new Date(Date.now() - 10 * 60_000).toISOString();
  const today = dateInSaoPaulo(0);
  await inserir('trips', [
    {
      id: tripId,
      owner_id: userId,
      name: `Trechos ${String(Date.now())}`,
      start_date: today,
      end_date: today,
      updated_at: now,
    },
  ]);
  const day = uuidV5(tripId, today);
  await inserir('trip_days', [{ id: day, trip_id: tripId, date: today, updated_at: now }]);
  const ids = { casa: uuidV4(), parque: uuidV4(), chegada: uuidV4() };
  const base = { trip_id: tripId, trip_day_id: day, travel_minutes_to_next: null, updated_at: now };
  const row = (
    id: string,
    position: string,
    kind: string,
    name: string,
    time: string,
    x: number,
  ) => ({
    ...base,
    id,
    position,
    kind,
    name,
    time,
    lat: ponto(x).latitude,
    lng: ponto(x).longitude,
    objective: false,
    done_at: null as string | null,
    done_by: null as string | null,
    departed_at: null as string | null,
  });
  await inserir('stops', [
    // a saída de casa já foi deixada há 10 min
    {
      ...row(ids.casa, 'a0', 'origin', CASA, '07:00', 0),
      done_at: left,
      done_by: userId,
      departed_at: left,
    },
    // o destino dito na conversa: o objetivo do trecho (D318)
    { ...row(ids.parque, 'a1', 'nature', PARQUE, '13:00', 10_000), objective: true },
    row(ids.chegada, 'a2', 'origin', CHEGADA, '18:00', 0),
  ]);
  return { tripId, ids };
}

type Aberto = { context: BrowserContext; page: Page; close: () => Promise<void> };

async function abrir(email: string, tripId: string): Promise<Aberto> {
  const use = test.info().project.use;
  const browser = await chromium.launch({ ...use.launchOptions, channel: 'chromium' });
  const context = await browser.newContext({ ...use, geolocation: ponto(600), permissions: [] });
  await context.route('**/functions/v1/route-day', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const body = route.request().postDataJSON() as { waypoints: [number, number][] };
    await route.fulfill({ json: forgedRouteDay(body.waypoints), headers: CORS });
  });
  await context.route('https://nominatim.openstreetmap.org/**', (route) =>
    route.fulfill({ json: {}, headers: { 'access-control-allow-origin': '*' } }),
  );
  await fakeOpenMeteo(context);
  const page = await context.newPage();
  // o relógio anda como o de verdade, a partir do meio-dia de São Paulo de hoje
  await page.clock.install({ time: new Date(`${dateInSaoPaulo(0)}T15:00:00.000Z`) });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible({
    timeout: 20_000,
  });
  // as paradas chegam pelo sync ao abrir; a maquete monta no SwiftShader devagar
  await page.goto(`/viagens/${tripId}`);
  await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
  await context.grantPermissions(['geolocation'], { origin: new URL(page.url()).origin });
  await page.getByRole('button', { name: 'Usar posição' }).click();
  await expect(page.locator('[data-gps][data-fix-at]')).toBeAttached({ timeout: 15_000 });
  return { context, page, close: () => browser.close() };
}

const palco = (page: Page) => page.locator('[data-world="webgl2"], [data-world="webgpu"]');

/**
 * O topo da pílula de uma parada na tela (px do palco), ou null fora de cena. Uma expressão em texto,
 * como as do `maquete.spec` (o `page.evaluate` com texto só avalia a expressão); o id é um uuid.
 */
const topoDaPilula = (page: Page, stopId: string) =>
  page.evaluate<number | null>(`(() => {
    const el = document.querySelector('[data-pill="${stopId}"]');
    if (!el || el.hidden || !el.dataset.placed) return null;
    return parseFloat(el.style.top);
  })()`);

test('o mapa por trechos: a ida até o objetivo, a troca depois do "Como foi?", a volta e o espiar', async () => {
  test.setTimeout(300_000);
  const user = await criarUsuario('Trechos');
  const { tripId, ids } = await viagemDeHoje(user.id);
  const a = await abrir(user.email, tripId);
  const { page, context } = a;
  try {
    const maquete = palco(page);
    await expect(maquete).toBeVisible({ timeout: 60_000 });

    // a ida: o trecho 1 de 2, a casa uma vez (sem a pílula da chegada), o objetivo acima da saída
    await expect(maquete).toHaveAttribute('data-world-leg', '1/2', { timeout: 60_000 });
    await expect(page.locator('[data-pill][data-placed]').first()).toBeAttached({
      timeout: 60_000,
    });
    await expect(page.locator(`[data-pill="${ids.chegada}"]`)).toHaveCount(0);
    await expect(page.locator('[data-pill]')).toHaveCount(2);
    await expect
      .poll(
        async () => {
          const casa = await topoDaPilula(page, ids.casa);
          const parque = await topoDaPilula(page, ids.parque);
          return casa !== null && parque !== null && parque < casa;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    const trechos = page.getByRole('group', { name: 'Trechos do dia' });
    await expect(
      trechos.getByRole('button', { name: `Ida, até ${PARQUE}, o trecho da vez` }),
    ).toHaveAttribute('aria-pressed', 'true');

    // a cidade que a estrada atravessa, uma vez, fora da árvore de acessibilidade
    await expect(page.locator('[data-passing-place]', { hasText: CIDADE })).toHaveCount(1, {
      timeout: 60_000,
    });
    await expect(page.locator('[data-passing-place]:not([aria-hidden="true"])')).toHaveCount(0);

    // a linha fala do trecho, e do dia ao lado, menor
    await posicionar(context, page, ponto(3_000));
    await expect(page.getByText(new RegExp(`\\d+% do trecho até ${PARQUE}`))).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/\d+% do caminho do dia/).first()).toBeVisible();

    // no parque: o Chegamos! abre o "Como foi?", e a maquete segura a ida enquanto ele está aberto
    await posicionar(context, page, ponto(10_000));
    await page.getByRole('button', { name: 'Chegamos!' }).click();
    const folha = page.getByRole('dialog', { name: `Como foi ${PARQUE}?` });
    await expect(folha).toBeVisible({ timeout: 15_000 });
    await expect(maquete).toHaveAttribute('data-world-leg', '1/2');
    // a folha desce com animação; no SwiftShader a maquete segura a thread por segundos
    await page.keyboard.press('Escape');
    await expect(folha).toBeHidden({ timeout: 30_000 });

    // a volta: o parque embaixo, a casa em cima, a saída de casa fora
    await expect(maquete).toHaveAttribute('data-world-leg', '2/2', { timeout: 30_000 });
    await expect(page.locator(`[data-pill="${ids.casa}"]`)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(`[data-pill="${ids.chegada}"]`)).toHaveCount(1);
    await expect
      .poll(
        async () => {
          const parque = await topoDaPilula(page, ids.parque);
          const casa = await topoDaPilula(page, ids.chegada);
          return casa !== null && parque !== null && casa < parque;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    await expect(page.locator('[data-passing-place]', { hasText: CIDADE })).toHaveCount(1, {
      timeout: 60_000,
    });

    // o indicador espia a ida (feita) e volta à da vez
    await trechos.getByRole('button', { name: `Ida, até ${PARQUE}, feito` }).click();
    await expect(maquete).toHaveAttribute('data-world-leg', '1/2', { timeout: 30_000 });
    await expect(trechos.getByRole('button', { name: /^Ida/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await trechos.getByRole('button', { name: /^Volta/ }).click();
    await expect(maquete).toHaveAttribute('data-world-leg', '2/2', { timeout: 30_000 });

    // na estrada de volta, a linha diz "da volta"
    await page.getByRole('button', { name: 'Partiu!' }).click();
    await posicionar(context, page, ponto(6_000));
    await expect(page.getByText(/\d+% da volta/)).toBeVisible({ timeout: 15_000 });

    // em casa, o Chegamos! conclui o dia
    await posicionar(context, page, ponto(0));
    await page.getByRole('button', { name: 'Chegamos!' }).click();
    await expect(page.getByText('Dia concluído').first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        async () =>
          (await linhas('stops', `trip_id=eq.${tripId}&select=name,done_at,objective`)).map((s) => [
            s.name,
            s.done_at !== null,
            s.objective,
          ]),
        { timeout: 30_000 },
      )
      .toEqual(
        expect.arrayContaining([
          [PARQUE, true, true],
          [CHEGADA, true, false],
        ]),
      );
  } finally {
    await a.close();
  }
});
