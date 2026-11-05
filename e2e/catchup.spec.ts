import { expect, test, type Browser, type Page } from '@playwright/test';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

const today = (daysAhead = 0) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

async function preencherLogin(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

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
 * Dois contextos da mesma pessoa, como dois aparelhos. A viagem é de hoje de propósito: é o único
 * teste que precisa do Modo Viagem ativo. Por isso o usuário é descartável: com uma viagem de hoje,
 * `/` redireciona para o Modo Viagem (D33) e quebraria os testes dos usuários do seed.
 */
test('o card "Desde a última vez" aparece depois de marcar Partiu! em outra sessão', async ({
  browser,
}: {
  browser: Browser;
}) => {
  const email = await criarUsuarioDescartavel('Viajante');
  const ctxA = await browser.newContext({ ...test.info().project.use });
  const pageA = await ctxA.newPage();
  await preencherLogin(pageA, email);
  await expect(pageA.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
  await pageA.goto('/viagens/nova');
  const nome = `Hoje ${Date.now()}`;
  await pageA.getByLabel('Nome da viagem').fill(nome);
  await pageA.getByRole('textbox', { name: 'Início' }).fill(today());
  await pageA.getByRole('textbox', { name: 'Fim' }).fill(today(1));
  await pageA.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(pageA).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  const tripUrl = pageA.url();

  await pageA.getByRole('link', { name: 'Editar roteiro' }).click();
  await pageA
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(pageA, { tipo: 'Origem', nome: 'Saída de casa', horario: '07:00' });
  await adicionarParada(pageA, { tipo: 'Natureza', nome: 'Parque', horario: '10:00' });

  // o primeiro aparelho vê a maquete e sai: o travel_state fica salvo
  await pageA.goto(`${tripUrl}/viagem`);
  await expect(pageA.getByRole('heading', { name: 'Agora' })).toBeVisible();
  await expect(pageA.getByText('Saída de casa').first()).toBeVisible();
  await pageA.getByRole('link', { name: 'Roteiro' }).click();
  await expect(
    pageA.getByRole('heading', { name: 'Roteiro', exact: true, level: 1 }),
  ).toBeVisible();

  // o segundo aparelho marca Partiu!
  const ctxB = await browser.newContext({ ...test.info().project.use });
  const pageB = await ctxB.newPage();
  await preencherLogin(pageB, email);
  // com uma viagem de hoje, `/` cai direto no Modo Viagem (D33)
  await expect(pageB.getByRole('heading', { name: 'Agora' })).toBeVisible({ timeout: 15_000 });
  await pageB.goto(`${tripUrl}/viagem`);
  await expect(pageB.getByRole('heading', { name: 'Agora' })).toBeVisible();
  await expect(pageB.getByText('Saída de casa').first()).toBeVisible({ timeout: 15_000 });
  await pageB.getByRole('button', { name: 'Partiu!' }).click();
  await expect(pageB.getByText('Saímos: Saída de casa', { exact: true })).toBeVisible();
  await expect(pageB.getByRole('button', { name: /Sem conexão|pendente/ })).toHaveCount(0, {
    timeout: 15_000,
  });

  // de volta ao primeiro: o que aconteceu desde a última vez
  await pageA.bringToFront();
  await pageA.goto(`${tripUrl}/viagem`);
  await expect(pageA.getByRole('heading', { name: 'Desde a última vez' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(pageA.getByText(/Saímos: Saída de casa/)).toBeVisible();
  await pageA.getByRole('button', { name: 'Ok' }).click();
  await expect(pageA.getByRole('heading', { name: 'Desde a última vez' })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});
