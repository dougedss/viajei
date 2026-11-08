import { expect, test, type Page } from '@playwright/test';
import { folhaCoberta } from './helpers/folha.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { fakeOpenMeteo, fakeRouteDay, fakeTiles, viagemNaSerra } from './helpers/world.ts';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** O que o Cache Storage `osm-tiles` guardou: quantos tiles e os status das respostas. */
type Cached = { count: number; statuses: number[] };
const CACHED = `caches.open('osm-tiles').then(async (c) => {
  const keys = await c.keys();
  const statuses = await Promise.all(keys.map(async (k) => (await c.match(k))?.status ?? -1));
  return { count: keys.length, statuses: [...new Set(statuses)] };
})`;

/**
 * O mapa sem rede, no build com o service worker de verdade: com rede, os tiles vistos entram no
 * cache `osm-tiles` com status 200 (a rota que até a fase 10 nunca gravou nada); sem rede, depois de
 * recarregar, os mesmos tiles voltam do cache, a linha e os pinos voltam do Dexie e o aviso calmo
 * aparece. A rota de mentira dos tiles sai antes de ficar sem rede: o que aparece vem do cache.
 */
test('o mapa visto com rede abre sem rede, com os tiles do cache', async ({ page, context }) => {
  test.setTimeout(120_000);
  const tiles = await fakeTiles(context);
  await fakeOpenMeteo(context);
  await fakeRouteDay(context);
  const user = await criarUsuario('MapaSemRede');
  const { tripId, days } = await viagemNaSerra(user.id, 2);
  await entrar(page, user.email);

  // o service worker assume a página antes do mapa: os tiles passam por ele
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect.poll(() => page.evaluate('navigator.serviceWorker.controller !== null')).toBe(true);

  await page.goto(`/viagens/${tripId}/mapa?dia=${days[0]}`);
  const map = page.locator('[data-map]');
  await expect(map.locator('[data-map-pin]')).toHaveCount(3, { timeout: 20_000 });
  await expect(map.locator('[data-map-route="route"]')).toHaveCount(2, { timeout: 20_000 });
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  // a rota do contexto pega os pedidos do service worker
  expect(tiles.count()).toBeGreaterThan(0);
  await expect
    .poll(async () => (await page.evaluate<Cached>(CACHED)).count, {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  expect((await page.evaluate<Cached>(CACHED)).statuses).toEqual([200]);
  const seen = await map.locator('img.leaflet-tile-loaded').count();

  // no build de verdade, a folha do pino fica por cima do mapa (fase 13: o CSS do Leaflet entra no
  // chunk do mapa, e é no build que a ordem das folhas de estilo vale)
  await page.getByRole('button', { name: '2. Cascata do Caracol' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cascata do Caracol' });
  await expect(sheet.locator('[data-map-sheet]')).toBeVisible();
  expect(await folhaCoberta(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // sem rede nenhuma, e sem a rota de mentira: o que aparecer vem do cache
  await context.unroute('https://tile.openstreetmap.org/**');
  await context.setOffline(true);
  await page.reload();
  await expect(map.locator('[data-map-offline]')).toHaveText(
    'Sem internet: o mapa mostra só as áreas já vistas neste aparelho',
    { timeout: 15_000 },
  );
  await expect(map.locator('[data-map-pin]')).toHaveCount(3);
  await expect(map.locator('[data-map-route="route"]')).toHaveCount(2);
  await expect
    .poll(() => map.locator('img.leaflet-tile-loaded').count(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(Math.min(seen, 4));
  test.info().annotations.push({
    type: 'tiles',
    description: `${String(tiles.count())} pedidos, ${String(seen)} na tela`,
  });

  await context.setOffline(false);
});
