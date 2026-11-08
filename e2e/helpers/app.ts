import { expect, type BrowserContext, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './dates.ts';
import { SENHA } from './users.ts';

/** Os passos que uma pessoa faz pela tela, comuns aos specs da fase 12. */

/**
 * Nenhuma chamada real ao OSM nem ao Open-Meteo na CI. No Chromium o `--host-resolver-rules` do
 * `playwright.config.ts` já não deixa resolver; o WebKit não tem a opção, então o contexto recusa.
 */
export async function semMundoDeFora(context: BrowserContext): Promise<void> {
  await context.route(/^https:\/\/(tile\.openstreetmap\.org|api\.open-meteo\.com)\//, (route) =>
    route.abort('blockedbyclient'),
  );
}

export async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** Pela tela inicial, como uma pessoa; `inicio` e `fim` em dias a partir de hoje. Devolve a URL. */
export async function novaViagem(
  page: Page,
  dados: { nome: string; inicio: number; fim: number; origem?: string; orcamento?: string },
): Promise<string> {
  await page.getByRole('link', { name: 'Nova viagem' }).first().click();
  await page.getByLabel('Nome da viagem').fill(dados.nome);
  // "Início" também é o rótulo do link do cabeçalho: mira o campo de data
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(dados.inicio));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(dados.fim));
  if (dados.origem) await page.getByLabel('Origem').fill(dados.origem);
  if (dados.orcamento) await page.getByLabel('Orçamento').fill(dados.orcamento);
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  await expect(page.getByRole('heading', { name: dados.nome })).toBeVisible();
  // a URL da viagem (o mapa); a criação cai em Detalhes, a visão geral
  return page.url().replace(/\/detalhes$/, '');
}

/** Da visão geral para o dia `n` do roteiro. */
export async function abrirDia(page: Page, n = 0): Promise<void> {
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .nth(n)
    .getByRole('link')
    .click();
  await expect(page.getByRole('heading', { name: `Dia ${String(n + 1)}` })).toBeVisible();
}

export async function adicionarParada(
  page: Page,
  dados: { tipo: string; nome: string; horario: string; deslocamento?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Adicionar parada' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: dados.tipo }).click();
  await dialog.getByLabel('Nome').fill(dados.nome);
  await dialog.getByLabel('Horário').fill(dados.horario);
  if (dados.deslocamento) {
    await dialog.getByLabel('Deslocamento até a próxima (min)').fill(dados.deslocamento);
  }
  await dialog.getByRole('button', { name: /Adicionar/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('group', { name: dados.nome })).toBeVisible();
}

/** Um item numa lista (Enter adiciona e mantém o foco), e a caixa marcada. */
export async function itemFeito(page: Page, campo: string, texto: string): Promise<void> {
  const input = page.getByLabel(campo);
  await input.fill(texto);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  const box = page.getByRole('checkbox', { name: new RegExp(`^${texto}`) });
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');
}

/** Um atalho da visão geral ("Listas", "Gastos"…), pela navegação do app, sem recarregar. */
export async function atalho(page: Page, nome: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Atalhos da viagem' })
    .getByRole('link', { name: new RegExp(`^${nome}`) })
    .click();
}

/** O "Voltar" do cabeçalho da tela: um link do app, sem recarregar (funciona sem rede em dev). */
export async function voltar(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Voltar', exact: true }).first().click();
}

/** O chip do cabeçalho: "Sem conexão · N" ou "N pendentes"; some quando tudo subiu. */
export const chip = (page: Page) => page.getByRole('button', { name: /Sem conexão|pendente/ });
