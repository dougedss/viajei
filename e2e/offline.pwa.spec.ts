import { expect, test } from '@playwright/test';
import {
  abrirDia,
  adicionarParada,
  chip,
  entrar,
  itemFeito,
  novaViagem,
  semMundoDeFora,
} from './helpers/app.ts';
import { linhas } from './helpers/db.ts';
import { criarUsuarioDescartavel } from './helpers/users.ts';

/**
 * Recarregar o app sem rede nenhuma (projeto `pwa`: o build com o service worker de verdade). A casca
 * vem do precache, cada rota pelo `navigateFallback`, e os dados do IndexedDB: a visão geral, o dia,
 * o Modo Viagem e as listas abrem como estavam. Uma edição feita sem sinal sobrevive à recarga (a
 * outbox mora no IndexedDB, não na memória da aba) e sobe quando a rede volta.
 */
test('sem rede, o app recarrega inteiro do aparelho, e a edição sem sinal sobrevive à recarga', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const email = await criarUsuarioDescartavel('Precache');
  const context = await browser.newContext({ ...test.info().project.use });
  await semMundoDeFora(context);
  const page = await context.newPage();
  await entrar(page, email);
  const nome = `Precache ${String(Date.now())}`;
  const tripUrl = await novaViagem(page, { nome, inicio: 30, fim: 31 });
  const tripId = tripUrl.split('/').at(-1) ?? '';
  await abrirDia(page);
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });
  const dayUrl = page.url();
  await expect(chip(page)).toHaveCount(0, { timeout: 15_000 });

  // o service worker assume a página (precache completo)
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect.poll(() => page.evaluate('navigator.serviceWorker.controller !== null')).toBe(true);

  await context.setOffline(true);
  await test.step('cada tela recarrega sem rede', async () => {
    await page.reload();
    await expect(page.getByRole('group', { name: 'Cascata do Caracol' })).toBeVisible({
      timeout: 15_000,
    });
    await page.goto(`${tripUrl}/detalhes`);
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    await page.goto(`${tripUrl}?render=list`);
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Cascata do Caracol').first()).toBeVisible();
    await page.goto(dayUrl);
    await expect(page.getByRole('group', { name: 'Cascata do Caracol' })).toBeVisible();
  });

  await test.step('a edição sem sinal sobrevive à recarga', async () => {
    await page.goto(`${tripUrl}/checklists`);
    await itemFeito(page, 'Novo item de antes de viajar', 'Calibrar os pneus');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: /^Calibrar os pneus/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(chip(page)).toHaveText(/Sem conexão/);
    expect(await linhas('checklist_items', `trip_id=eq.${tripId}&select=id`)).toHaveLength(0);
  });

  await test.step('a rede volta e o item sobe', async () => {
    await context.setOffline(false);
    await expect(chip(page)).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(async () =>
        (await linhas('checklist_items', `trip_id=eq.${tripId}&select=text,done_at`)).map((i) => [
          i.text,
          i.done_at !== null,
        ]),
      )
      .toEqual([['Calibrar os pneus', true]]);
  });
  await context.close();
});
