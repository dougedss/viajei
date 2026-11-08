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
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { criarUsuarioDescartavel } from './helpers/users.ts';

/**
 * O fluxo principal de ponta a ponta, num spec só, como uma pessoa (fase 12): cria a viagem de hoje,
 * monta o roteiro, abre o Modo Viagem, Partiu! e Chegamos!, responde o "Como foi?", lança um gasto,
 * fecha um item da mala e, no dia seguinte, abre a retrospectiva. O usuário é descartável porque a
 * viagem é de hoje (D33, D48). A maquete tem o próprio e2e: aqui o Modo Viagem abre pela lista.
 *
 * O dia seguinte vem do relógio do navegador, e sem rede: com o relógio adiantado um dia, o token da
 * sessão parece vencido, e o supabase-js o renovaria a cada requisição. Sem rede, ninguém chama o
 * servidor, e a retrospectiva é toda local (D121).
 */
test('o fluxo principal: viagem, roteiro, Partiu! e Chegamos!, "Como foi?", gasto, lista e a retrospectiva', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const email = await criarUsuarioDescartavel('Fluxo');
  const context = await browser.newContext({ ...test.info().project.use });
  await semMundoDeFora(context);
  const page = await context.newPage();
  const nome = `Serra ${String(Date.now())}`;
  let tripUrl = '';

  await test.step('entra e cria a viagem de hoje', async () => {
    await entrar(page, email);
    tripUrl = await novaViagem(page, {
      nome,
      inicio: 0,
      fim: 0,
      origem: 'Papanduva/SC',
      orcamento: '1.000,00',
    });
  });
  const tripId = tripUrl.split('/').at(-1) ?? '';

  await test.step('monta o roteiro do dia', async () => {
    await abrirDia(page);
    await adicionarParada(page, {
      tipo: 'Origem',
      nome: 'Saída de casa',
      horario: '07:00',
      deslocamento: '180',
    });
    await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });
  });

  await test.step('no Modo Viagem: Partiu!, Chegamos! e o "Como foi?"', async () => {
    await page.goto(`${tripUrl}?render=list`);
    const agora = page.getByRole('region', { name: 'Agora' });
    // a primeira visita à rota compila o Modo Viagem inteiro no Vite de dev
    await expect(agora).toBeVisible({ timeout: 15_000 });
    await expect(agora.getByText(/sair às\s*07:00/)).toBeVisible();
    await page.getByRole('button', { name: 'Partiu!' }).click();
    await expect(page.getByText('Saímos: Saída de casa', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Chegamos!' }).click();

    const sheet = page.getByRole('dialog', { name: 'Como foi Cascata do Caracol?' });
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await sheet.getByRole('button', { name: '5 de 5' }).click();
    await sheet.getByLabel('Memória').fill('Valeu cada degrau');
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(agora.getByText('Dia concluído')).toBeVisible();
  });

  await test.step('lança o almoço pelo "+ Gasto"', async () => {
    await page.getByRole('button', { name: 'Gasto', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Novo gasto' });
    await sheet.getByRole('button', { name: 'Comida' }).click();
    await sheet.getByLabel('Valor').fill('42');
    await sheet.getByRole('button', { name: 'Salvar' }).click();
    await expect(sheet).toHaveCount(0);
  });

  await test.step('fecha um item da mala', async () => {
    await page.goto(`${tripUrl}/checklists?aba=mala`);
    await itemFeito(page, 'Novo item da mala', 'Carregador do celular');
  });

  await test.step('o servidor tem tudo', async () => {
    await expect(chip(page)).toHaveCount(0, { timeout: 20_000 });
    await expect
      .poll(
        async () =>
          (await linhas('stops', `trip_id=eq.${tripId}&select=name,done_at&order=position`)).map(
            (s) => [s.name, s.done_at !== null],
          ),
        { timeout: 15_000 },
      )
      .toEqual([
        ['Saída de casa', true],
        ['Cascata do Caracol', true],
      ]);
    await expect
      .poll(
        async () => (await linhas('stop_memories', `trip_id=eq.${tripId}&select=rating,memo`))[0],
      )
      .toEqual({ rating: 5, memo: 'Valeu cada degrau' });
    await expect
      .poll(
        async () => (await linhas('expenses', `trip_id=eq.${tripId}&select=amount,category`))[0],
      )
      .toEqual({ amount: 42, category: 'food' });
    await expect
      .poll(async () =>
        (
          await linhas('checklist_items', `trip_id=eq.${tripId}&kind=eq.pack&select=text,done_at`)
        ).map((i) => [i.text, i.done_at !== null]),
      )
      .toEqual([['Carregador do celular', true]]);
  });

  await test.step('hoje, a retrospectiva diz quando fica pronta', async () => {
    await page.goto(`${tripUrl}/retrospectiva`);
    const [, m, d] = dateInSaoPaulo(1).split('-');
    const soon = page.getByText(`A retrospectiva fica pronta em ${d ?? ''}/${m ?? ''}`);
    await expect(soon).toBeVisible();
    // ida e volta à visão geral com rede, pela navegação do app: sem rede, o Vite de dev só tem
    // os módulos já carregados nesta página
    await page.getByRole('link', { name: 'Voltar à viagem' }).click();
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    await page.goBack();
    await expect(soon).toBeVisible();
  });

  await test.step('no dia seguinte, sem sinal, a retrospectiva está pronta', async () => {
    await context.setOffline(true);
    await page.clock.setFixedTime(new Date(`${dateInSaoPaulo(1)}T09:00:00-03:00`));
    // com "reduzir movimento", o filme é a sequência de cards (sem 3D)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // pela navegação do app: sem rede, o Vite de dev não serve a página de novo
    await page.getByRole('link', { name: 'Voltar à viagem' }).click();
    await expect(page.getByRole('heading', { name: nome })).toBeVisible();
    await page.locator('[data-retro-entry]').click();
    await expect(page.locator('[data-film-mode="cards"]')).toBeVisible({ timeout: 30_000 });
    const final = page.locator('[data-final-card]');
    await expect(final.locator('[data-stat="dia"]')).toHaveText('1 dia');
    await expect(final.locator('[data-stat="paradas"]')).toHaveText('2 paradas');
    await expect(final.locator('[data-budget]')).toHaveText(
      /R\$\s42 de R\$\s1\.000 · dentro do orçamento/,
    );
  });

  await context.close();
});
