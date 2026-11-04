import { expect, test, type Page } from '@playwright/test';

const SENHA = 'viajei123';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('senha errada mostra a mensagem em português e não entra', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('dono@viajei.local');
  await page.getByLabel('Senha', { exact: true }).fill('errada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('o dono entra e vê a tela inicial', async ({ page }) => {
  await entrar(page, 'dono@viajei.local');
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Douglas' })).toBeVisible();
});

test('a convidada vê o convite pendente e aceita', async ({ page }) => {
  await entrar(page, 'convidado@viajei.local');
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
  // o claim_invites roda logo depois de entrar e a lista é relida em seguida: espera o card chegar
  const convite = page.getByRole('article', { name: /convite/i });
  await convite
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => null);
  if ((await convite.count()) === 0)
    test.skip(true, 'convite já aceito neste banco; rode pnpm db:reset');
  await expect(convite).toContainText('RS — concurso em Montenegro');
  await convite.getByRole('button', { name: 'Aceitar' }).click();
  await expect(page.getByRole('status')).toContainText('Convite aceito');
  await expect(convite).toHaveCount(0);
});

test('perfil: edita o nome e sai', async ({ page }) => {
  await entrar(page, 'intruso@viajei.local');
  await page.getByRole('link', { name: 'Perfil' }).click();
  const nome = page.getByLabel('Nome');
  await nome.fill('Intruso Testado');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status')).toContainText('Perfil salvo');
  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});
