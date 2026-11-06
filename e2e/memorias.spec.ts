import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { makePng } from './helpers/images.ts';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

async function adicionarParada(page: Page, dados: { tipo: string; nome: string; horario: string }) {
  await page.getByRole('button', { name: 'Adicionar parada' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: dados.tipo }).click();
  await dialog.getByLabel('Nome').fill(dados.nome);
  await dialog.getByLabel('Horário').fill(dados.horario);
  await dialog.getByRole('button', { name: /Adicionar/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('group', { name: dados.nome })).toBeVisible();
}

/**
 * Chegamos! na tela abre "Como foi?" 1,2 s depois do confete; a nota e a memória vão para o diário.
 * A foto escolhida sem rede entra na hora, fica "aguardando sinal" e só nasce no servidor quando a
 * rede volta. A viagem é de hoje (Modo Viagem ativo), por isso o usuário é descartável (D48).
 */
test('Chegamos! → "Como foi?" → nota, memória e foto sem rede → diário', async ({ browser }) => {
  test.setTimeout(90_000);
  const email = await criarUsuarioDescartavel('Memoria');
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();

  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`Memórias ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo());
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(1));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();

  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(page, { tipo: 'Origem', nome: 'Saída de casa', horario: '07:00' });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });

  await page.goto(`${tripUrl}/viagem?render=list`);
  await page.getByRole('button', { name: 'Partiu!' }).click();
  await expect(page.getByText('Saímos: Saída de casa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chegamos!' }).click();

  // a folha abre sozinha depois do confete
  const sheet = page.getByRole('dialog', { name: 'Como foi Cascata do Caracol?' });
  await expect(sheet).toBeVisible({ timeout: 5_000 });
  await sheet.getByRole('button', { name: '4 de 5' }).click();
  await sheet.getByLabel('Memória').fill('A cascata mais alta que já vi');

  // sem rede, a foto entra na fila
  await context.setOffline(true);
  await sheet
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'cascata.png', mimeType: 'image/png', buffer: makePng() });
  await expect(sheet.locator('img').first()).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toHaveCount(0);

  // ela aparece pelo Blob local, com o selo, e ainda não existe no servidor
  await page.getByRole('button', { name: 'Minha memória' }).click();
  const again = page.getByRole('dialog', { name: 'Como foi Cascata do Caracol?' });
  const thumb = again.locator('[data-media][data-pending]');
  await expect(thumb).toBeVisible();
  await expect(again.getByText('aguardando sinal')).toBeVisible();
  const id = (await thumb.getAttribute('data-media')) ?? '';
  expect(await linhas('attachments', `id=eq.${id}`)).toHaveLength(0);
  await page.keyboard.press('Escape');

  // a rede volta: o arquivo sobe e só então a linha nasce
  await context.setOffline(false);
  await expect
    .poll(async () => (await linhas('attachments', `id=eq.${id}`)).length, { timeout: 30_000 })
    .toBe(1);
  const [row] = await linhas('attachments', `id=eq.${id}&select=stop_id,kind,mime,placeholder`);
  expect(row).toMatchObject({ kind: 'photo', mime: 'image/jpeg' });
  expect(typeof row?.placeholder).toBe('string');
  await expect
    .poll(
      async () =>
        (await linhas('stop_memories', `stop_id=eq.${String(row?.stop_id)}&select=rating,memo`))[0],
      { timeout: 15_000 },
    )
    .toEqual({ rating: 4, memo: 'A cascata mais alta que já vi' });

  // e o diário mostra a nota, a memória e a foto
  await page.goto(`${tripUrl}/diario`);
  await expect(page.getByRole('heading', { name: 'Diário' })).toBeVisible();
  await expect(page.getByText('“A cascata mais alta que já vi”')).toBeVisible();
  await expect(page.getByLabel('4 de 5')).toBeVisible();
  await expect(page.locator(`[data-media="${id}"]`)).toBeVisible();
  await expect(page.locator(`[data-media="${id}"][data-pending]`)).toHaveCount(0);

  await context.close();
});
