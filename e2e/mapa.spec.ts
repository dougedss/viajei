import { expect, test, type Page } from '@playwright/test';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { fakeOpenMeteo, fakeRouteDay, fakeTiles, viagemNaSerra } from './helpers/world.ts';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/**
 * O mapa da viagem, com tiles, rota e previsão de mentira: os pinos na ordem da lista, a estrada do
 * dia, a atribuição visível e não coberta, a folha do pino com a previsão e os links, a troca de dia
 * e a parada sem lugar embaixo do mapa.
 */
test('o mapa mostra o dia, a folha do pino e troca de dia', async ({ page, context }) => {
  test.setTimeout(90_000);
  const tiles = await fakeTiles(context);
  await fakeOpenMeteo(context);
  await fakeRouteDay(context);
  const user = await criarUsuario('Mapa');
  const { tripId, days } = await viagemNaSerra(user.id, 2);
  await entrar(page, user.email);

  // o atalho da visão geral
  await page.goto(`/viagens/${tripId}`);
  await page.getByRole('link', { name: /^Mapa:/ }).click();
  await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}/mapa`));

  // antes da viagem, o mapa abre no Dia 1
  const map = page.locator('[data-map]');
  await expect(map).toHaveAttribute('data-map', days[0], { timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Dia 1 ·/, pressed: true })).toBeVisible();
  await expect(map.locator('[data-map-pin]')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '1. Saída do hotel' })).toBeVisible();
  await expect(page.getByRole('button', { name: '4. Lago Negro' })).toBeVisible();
  // a rota real chega e substitui o traço reto
  await expect(map.locator('[data-map-route="route"]')).toHaveCount(2, { timeout: 20_000 });
  await expect(map.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  expect(tiles.count()).toBeGreaterThan(0);

  // a atribuição visível e por cima de tudo no canto dela
  const attribution = map.locator('.leaflet-control-attribution');
  await expect(attribution).toContainText('OpenStreetMap');
  await expect(attribution).toContainText('Leaflet');
  await expect(attribution.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/copyright',
  );
  const box = await attribution.boundingBox();
  const mapBox = await map.boundingBox();
  expect(box && mapBox && box.x + box.width <= mapBox.x + mapBox.width).toBe(true);
  expect(box && mapBox && box.y + box.height <= mapBox.y + mapBox.height).toBe(true);
  const onTop = await page.evaluate<boolean>(`(() => {
    const el = document.querySelector('.leaflet-control-attribution');
    const r = el.getBoundingClientRect();
    return [[r.left + 4, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]]
      .every(([x, y]) => el.contains(document.elementFromPoint(x, y)));
  })()`);
  expect(onTop).toBe(true);

  // a parada sem lugar embaixo do mapa
  await expect(page.locator('[data-map-unlocated]')).toContainText('1 parada sem lugar no mapa');
  await expect(page.locator('[data-map-unlocated]')).toContainText('Almoço sem lugar');

  // a folha do pino: horário, previsão, os links e o roteiro
  await page.getByRole('button', { name: '2. Cascata do Caracol' }).click();
  const sheet = page.getByRole('dialog', { name: 'Cascata do Caracol' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('09:30');
  await expect(sheet.locator('[data-stop-forecast]')).toContainText('chuva 70%');
  await expect(sheet.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
    'href',
    /-29\.31295/,
  );
  await expect(sheet.getByRole('link', { name: 'Waze' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Ver no roteiro' })).toHaveAttribute(
    'href',
    `/viagens/${tripId}/roteiro/${days[0]}`,
  );
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // troca de dia: o Dia 2 tem uma parada só, e o traço do Dia 1 sai
  await page.getByRole('button', { name: /^Dia 2 ·/ }).click();
  await expect(map).toHaveAttribute('data-map', days[1]);
  await expect(map.locator('[data-map-pin]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '1. Casa Valduga' })).toBeVisible();
  await expect(map.locator('[data-map-route]')).toHaveCount(0);

  // a viagem inteira: todos os pinos, menores e sem número
  await page.getByRole('button', { name: 'Viagem', exact: true }).click();
  await expect(map).toHaveAttribute('data-map', 'viagem');
  await expect(map.locator('[data-map-pin]')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Casa Valduga', exact: true })).toBeVisible();

  // e pelo "Ver no mapa" do dia
  await page.goto(`/viagens/${tripId}/roteiro/${days[1]}`);
  await page.getByRole('link', { name: 'Ver no mapa' }).click();
  await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}/mapa\\?dia=${days[1]}$`));
  await expect(map).toHaveAttribute('data-map', days[1]);
});
