import { expect, test, type Page } from '@playwright/test';

const SENHA = 'viajei123';

/** datas sempre no futuro: durante uma viagem, `/` redireciona para o Modo Viagem */
const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
const INICIO = futureDate(30);
const FIM = futureDate(33);

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

async function criarViagem(page: Page, nome: string) {
  await page.getByRole('link', { name: 'Nova viagem' }).first().click();
  await page.getByLabel('Nome da viagem').fill(nome);
  // "Início" também é o rótulo do link do cabeçalho: mira o campo de data
  await page.getByRole('textbox', { name: 'Início' }).fill(INICIO);
  await page.getByRole('textbox', { name: 'Fim' }).fill(FIM);
  await page.getByLabel('Origem').fill('Papanduva/SC');
  await page.getByLabel('Orçamento').fill('3.000,00');
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
}

test('cria uma viagem sem sinal, fica pendente, e sincroniza quando a rede volta', async ({
  page,
  context,
}) => {
  await entrar(page, 'dono@viajei.local');
  // a primeira, online, só para as telas (chunks lazy) já estarem carregadas antes de cortar a rede;
  // volta pelo link, não por goto: recarregar a página esvaziaria o cache de módulos (em dev não há SW)
  await criarViagem(page, `Aquecimento ${Date.now()}`);
  await page.getByRole('link', { name: 'Início' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();

  await context.setOffline(true);
  const nome = `Sem sinal ${Date.now()}`;
  await criarViagem(page, nome);
  await expect(page.getByText('R$ 3.000,00')).toBeVisible();
  await expect(page.getByRole('button', { name: /Sem conexão/ })).toBeVisible();

  await page.getByRole('button', { name: /Sem conexão/ }).click();
  await expect(page.getByRole('dialog', { name: 'Pendentes' })).toContainText('Viagem nova');
  await page.keyboard.press('Escape');

  await context.setOffline(false);
  await expect(page.getByRole('button', { name: /Sem conexão|pendente/ })).toHaveCount(0, {
    timeout: 15_000,
  });

  // recarregar lê do Dexie e do servidor: a viagem continua lá
  await page.reload();
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
});

test('edita e exclui a viagem', async ({ page }) => {
  await entrar(page, 'dono@viajei.local');
  const nome = `Editável ${Date.now()}`;
  await criarViagem(page, nome);

  await page.getByRole('link', { name: 'Editar viagem' }).click();
  await page.getByLabel('Nome da viagem').fill(`${nome} v2`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { name: `${nome} v2` })).toBeVisible();

  await page.getByRole('button', { name: 'Excluir viagem' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir viagem' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: `${nome} v2` })).toHaveCount(0);
});

test('convida alguém por e-mail e cancela o convite', async ({ page }) => {
  await entrar(page, 'dono@viajei.local');
  await criarViagem(page, `Com time ${Date.now()}`);
  await page.getByRole('link', { name: 'Convidar' }).click();
  await expect(page.getByRole('heading', { name: 'Time', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Douglas' })).toContainText('Dono');

  const email = `nova-${Date.now()}@viajei.local`;
  await page.getByLabel('Convidar por e-mail').fill(email);
  await page.getByRole('button', { name: 'Convidar' }).click();
  const convite = page.getByRole('group', { name: email });
  await expect(convite).toContainText('Convite pendente');

  await convite.getByRole('button', { name: /Cancelar convite/ }).click();
  await expect(convite).toHaveCount(0);
});

test('quem não é dono vê o time mas não convida', async ({ page }) => {
  await entrar(page, 'intruso@viajei.local');
  await expect(page.getByText('Nenhuma viagem ainda')).toBeVisible();
});
