import { expect, test } from '@playwright/test';
import { entrar } from './helpers/app.ts';
import { criarUsuario } from './helpers/users.ts';
import { viagemNaSerra } from './helpers/world.ts';

/**
 * A viagem é o mapa (fase 14): `/viagens/:id` é a tela da viagem; a visão geral vira Detalhes; a rota
 * antiga do Modo Viagem redireciona preservando a query, trocando a entrada do histórico; o card da
 * lista abre o mapa. A tela abre pela lista do dia (`viajei:world:render`): aqui se prova a rota, não
 * a maquete, que tem o próprio spec.
 */
test('a viagem é o mapa: as rotas, o redirecionamento e Detalhes', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('viajei:world:render', 'list'));
  const user = await criarUsuario('Rotas');
  const { tripId } = await viagemNaSerra(user.id, 2);
  await entrar(page, user.email);

  await test.step('/viagens/:id é a tela da viagem', async () => {
    await page.goto(`/viagens/${tripId}`);
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}$`));
    // o nome pequeno leva à lista
    await expect(page.getByRole('link', { name: 'Serra do teste' })).toHaveAttribute(
      'href',
      '/viagens',
    );
  });

  await test.step('a rota antiga redireciona, com a query, trocando a entrada do histórico', async () => {
    await page.goto('/viagens');
    await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
    await page.goto(`/viagens/${tripId}/viagem?render=list&diag=1`);
    await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}\\?render=list&diag=1$`));
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/viagens$/);
  });

  await test.step('Detalhes é a visão geral, sem o botão do Modo Viagem, e volta ao mapa', async () => {
    await page.goto(`/viagens/${tripId}/detalhes`);
    await expect(page.getByRole('heading', { name: 'Serra do teste' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Atalhos da viagem' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Modo Viagem/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Voltar', exact: true })).toHaveAttribute(
      'href',
      `/viagens/${tripId}`,
    );
  });

  await test.step('o card da lista abre o mapa', async () => {
    await page.goto('/viagens');
    await page.getByRole('link', { name: 'Serra do teste' }).click();
    await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}$`));
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible();
  });
});
