import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { makePng } from './helpers/images.ts';

const SENHA = 'viajei123';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/**
 * No balcão, sem sinal: a reserva com o print, criada com rede, abre depois de recarregar o app sem
 * rede nenhuma. A casca vem do precache do service worker (por isso este teste roda contra o build),
 * a reserva do Dexie e o print do Blob guardado no aparelho.
 */
test('reserva com print abre sem rede, depois de recarregar', async ({ page, context }) => {
  test.setTimeout(120_000);
  await entrar(page, 'dono@viajei.local');

  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`Reservas ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(30));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(31));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();

  await page.getByRole('link', { name: 'Reservas: 0' }).click();
  await page.getByRole('link', { name: 'Adicionar reserva' }).click();
  await page.getByLabel('Nome').fill('Vila Suzana Parque Hotel');
  await page.getByLabel('Código de confirmação').fill('VS-4821');
  await page
    .locator('input[type=file][accept*="application/pdf"]')
    .setInputFiles({ name: 'voucher.png', mimeType: 'image/png', buffer: makePng(1170, 2532) });
  await expect(page.getByRole('list', { name: 'Anexos a enviar' })).toContainText('voucher.png');
  await page.getByRole('button', { name: 'Salvar reserva' }).click();

  // o "Ver reserva" abre com o código grande e o print, que sobe e vira linha no servidor
  const sheet = page.getByRole('dialog', { name: 'Vila Suzana Parque Hotel' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Código VS-4821/ })).toBeVisible();
  const uploaded = sheet.locator('[data-media]:not([data-pending])');
  await expect(uploaded).toBeVisible({ timeout: 30_000 });
  const id = (await uploaded.getAttribute('data-media')) ?? '';
  expect(await linhas('attachments', `id=eq.${id}&select=kind,mime`)).toEqual([
    { kind: 'document', mime: 'image/jpeg' },
  ]);
  const sheetUrl = page.url();
  expect(sheetUrl).toContain(`${tripUrl}/reservas?abrir=`);

  // o service worker assume a página (precache completo)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect.poll(() => page.evaluate('navigator.serviceWorker.controller !== null')).toBe(true);
  await expect(sheet).toBeVisible();

  // sem rede nenhuma: recarrega e abre o print
  await context.setOffline(true);
  await page.reload();
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByRole('button', { name: /Código VS-4821/ })).toBeVisible();
  await sheet.locator(`[data-media="${id}"]`).click();
  const viewer = page.getByRole('dialog', { name: 'Foto em tela cheia' });
  await expect(viewer).toBeVisible();
  const img = viewer.locator('img[src^="blob:"]');
  await expect(img).toBeVisible();
  expect(
    await img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth),
  ).toBeGreaterThan(0);

  await context.setOffline(false);
});
