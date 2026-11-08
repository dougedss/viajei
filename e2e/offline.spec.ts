import { expect, test } from '@playwright/test';
import {
  abrirDia,
  adicionarParada,
  atalho,
  chip,
  entrar,
  itemFeito,
  novaViagem,
  semMundoDeFora,
  voltar,
} from './helpers/app.ts';
import { linhas } from './helpers/db.ts';
import { criarUsuarioDescartavel } from './helpers/users.ts';

/**
 * Sem sinal no meio do uso (`context.setOffline(true)`), pela navegação do app, como na estrada: uma
 * parada nova, um item marcado, um contato, um gasto e a observação da viagem. Tudo aparece na hora,
 * o chip conta o que espera, Pendentes mostra cada um, e quando a rede volta o servidor tem tudo, sem
 * ninguém tocar em nada. A viagem nasce com rede: criar sem sinal já tem teste (`trips.spec.ts`).
 * Em dev não há service worker (D22): as telas são abertas uma vez com rede, para os módulos do Vite
 * já estarem no navegador, e depois se navega sem recarregar. Recarregar sem rede é o `offline.pwa`.
 */
test('sem sinal: roteiro, lista, contato, gasto e a viagem; o chip conta; a rede volta e o servidor tem tudo', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const email = await criarUsuarioDescartavel('Estrada');
  const context = await browser.newContext({ ...test.info().project.use });
  await semMundoDeFora(context);
  const page = await context.newPage();
  await entrar(page, email);
  const nome = `Sem sinal ${String(Date.now())}`;
  const tripUrl = await novaViagem(page, { nome, inicio: 30, fim: 31 });
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // com rede: uma parada no dia 1 e cada tela aberta uma vez, pela navegação do app (um `goto`
  // recarregaria a página e o Vite de dev esqueceria os módulos já carregados)
  await abrirDia(page);
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });
  await voltar(page);
  await voltar(page);
  for (const [atalhoNome, titulo] of [
    ['Listas', 'Listas'],
    ['Contatos', 'Contatos'],
    ['Gastos', 'Gastos'],
  ] as const) {
    await atalho(page, atalhoNome);
    await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
    await voltar(page);
  }
  await page.getByRole('link', { name: 'Editar viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Editar viagem' })).toBeVisible();
  await voltar(page);
  await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  await expect(chip(page)).toHaveCount(0, { timeout: 15_000 });

  await context.setOffline(true);

  await test.step('uma parada nova no roteiro', async () => {
    await abrirDia(page);
    await adicionarParada(page, { tipo: 'Hotel', nome: 'Hotel Steffen', horario: '17:30' });
    await voltar(page);
    await voltar(page);
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  });

  await test.step('um item marcado na lista de antes', async () => {
    await atalho(page, 'Listas');
    await itemFeito(page, 'Novo item de antes de viajar', 'Calibrar os pneus');
    await voltar(page);
  });

  await test.step('um contato', async () => {
    await atalho(page, 'Contatos');
    await page.getByRole('button', { name: 'Contato', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Novo contato' });
    await sheet.getByLabel('Nome').fill('Pousada da Serra');
    await sheet.getByLabel('Telefone').fill('(54) 99876-1234');
    await sheet.getByRole('button', { name: 'Hotel', exact: true }).click();
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ligar para Pousada da Serra' })).toBeVisible();
    await voltar(page);
  });

  await test.step('um gasto', async () => {
    await atalho(page, 'Gastos');
    await page.getByRole('button', { name: 'Gasto', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Novo gasto' });
    await sheet.getByLabel('Valor').fill('85');
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByText(/R\$\s85,00/).first()).toBeVisible();
    await voltar(page);
  });

  await test.step('a observação da viagem', async () => {
    await page.getByRole('link', { name: 'Editar viagem' }).click();
    await page.getByLabel('Observações').fill('Levar dinheiro para o pedágio');
    await page.getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
  });

  await test.step('o chip conta o que espera, e Pendentes mostra cada um', async () => {
    await expect(chip(page)).toHaveText(/Sem conexão · \d+/);
    await chip(page).click();
    const pendentes = page.getByRole('dialog', { name: 'Pendentes' });
    await expect(pendentes).toContainText('Parada nova');
    await expect(pendentes).toContainText('Hotel Steffen');
    await page.keyboard.press('Escape');
    // nada saiu do aparelho ainda
    expect(await linhas('contacts', `trip_id=eq.${tripId}&select=id`)).toHaveLength(0);
  });

  await test.step('a rede volta: tudo sobe sozinho', async () => {
    await context.setOffline(false);
    await expect(chip(page)).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(
        async () =>
          (await linhas('stops', `trip_id=eq.${tripId}&select=name&order=name`)).map((s) => s.name),
        { timeout: 15_000 },
      )
      .toEqual(['Cascata do Caracol', 'Hotel Steffen']);
    await expect
      .poll(async () =>
        (await linhas('checklist_items', `trip_id=eq.${tripId}&select=text,done_at`)).map((i) => [
          i.text,
          i.done_at !== null,
        ]),
      )
      .toEqual([['Calibrar os pneus', true]]);
    await expect
      .poll(async () => (await linhas('contacts', `trip_id=eq.${tripId}&select=phone`))[0])
      .toEqual({ phone: '+5554998761234' });
    await expect
      .poll(async () => (await linhas('expenses', `trip_id=eq.${tripId}&select=amount`))[0])
      .toEqual({ amount: 85 });
    await expect
      .poll(async () => (await linhas('trips', `id=eq.${tripId}&select=notes`))[0])
      .toEqual({ notes: 'Levar dinheiro para o pedágio' });
  });

  await context.close();
});
