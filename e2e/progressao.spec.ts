import { expect, test, type Page } from '@playwright/test';
import { comCartoes } from './helpers/celebrations.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
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
 * Concluir a primeira parada dá o "Primeiro pé na estrada": o XP chega ao servidor, a barra do nível
 * anda, o cartão aparece no próximo momento calmo (a visão geral), "Usar no carro" põe o rack e a
 * garagem mostra o rack. A viagem é de hoje, por isso o usuário é descartável (D48), e os cartões
 * estão ligados só neste contexto.
 */
test('concluir uma parada → cartão do primeiro pé na estrada → Usar no carro → o rack na garagem', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const email = await criarUsuarioDescartavel('Progresso');
  const context = await browser.newContext({ ...test.info().project.use });
  await comCartoes(context);
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();

  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`Progresso ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo());
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(1));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // a barra do time começa no zero
  const bar = page.locator('[data-level]');
  await expect(bar).toHaveAttribute('data-xp', '0');

  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(page, { tipo: 'Origem', nome: 'Saída de casa', horario: '07:00' });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });

  // Partiu! conclui a saída de casa: é a primeira parada concluída
  await page.goto(`${tripUrl}/viagem?render=list`);
  await page.getByRole('button', { name: 'Partiu!' }).click();
  await expect(page.getByText('Saímos: Saída de casa', { exact: true })).toBeVisible();

  // o XP e a conquista chegam ao servidor depois da janela do Desfazer (12 s)
  await expect
    .poll(
      async () =>
        (await linhas('achievements', `trip_id=eq.${tripId}&key=eq.first_stop&select=key`)).length,
      { timeout: 60_000, intervals: [2_000] },
    )
    .toBe(1);
  await expect
    .poll(
      async () =>
        (await linhas('xp_events', `trip_id=eq.${tripId}&kind=eq.stop_done&select=points`)).length,
      { timeout: 30_000 },
    )
    .toBe(1);

  // a visão geral é um momento calmo: o cartão sai ali (um por vez; à noite, o Madrugador vem junto)
  await page.goto(tripUrl);
  await expect(bar).not.toHaveAttribute('data-xp', '0', { timeout: 15_000 });
  const card = page.getByRole('dialog', { name: 'Primeiro pé na estrada' });
  for (let i = 0; i < 4 && !(await card.isVisible()); i++) {
    const other = page.locator('[role=dialog]:has([data-unlock])');
    if (await other.isVisible()) {
      await other.getByRole('button', { name: /Agora não|Fechar/ }).click();
      await expect(other).toHaveCount(0);
    }
    await page.waitForTimeout(500);
  }
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText('Desbloqueou:')).toBeVisible();
  await expect(card.locator('[data-unlock-stage]')).toBeVisible();
  await card.getByRole('button', { name: 'Usar no carro' }).click();
  await expect(card).toHaveCount(0);

  // o rack está no carro da viagem, no servidor e na garagem
  await expect
    .poll(
      async () =>
        (await linhas('trips', `id=eq.${tripId}&select=car_accessories`))[0]?.car_accessories,
      { timeout: 15_000 },
    )
    .toEqual(['rack']);
  await page.goto(`${tripUrl}/garagem?render=list`);
  await expect(page.getByRole('img', { name: /com rack/ }).first()).toBeVisible();

  await context.close();
});
