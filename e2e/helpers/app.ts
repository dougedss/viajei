import { expect, type BrowserContext, type Page } from '@playwright/test';
import { INTAKE_LABEL } from '../../src/features/intake/start.ts';
import { dateInSaoPaulo } from './dates.ts';
import { SENHA } from './users.ts';

/** Os passos que uma pessoa faz pela tela, comuns aos specs da fase 12. */

/**
 * Nenhuma chamada real ao OSM nem ao Open-Meteo na CI. No Chromium o `--host-resolver-rules` do
 * `playwright.config.ts` já não deixa resolver; o WebKit não tem a opção, então o contexto recusa.
 */
export async function semMundoDeFora(context: BrowserContext): Promise<void> {
  await context.route(
    /^https:\/\/(tile\.openstreetmap\.org|api\.open-meteo\.com|overpass-api\.de|api\.geoapify\.com)\//,
    (route) => route.abort('blockedbyclient'),
  );
}

export async function entrar(page: Page, email: string): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** O campo da lista de viagens (fase 17): a porta de entrada de uma viagem nova. */
export const campo = (page: Page) => page.getByRole('textbox', { name: INTAKE_LABEL });

export type DadosDaViagem = {
  nome: string;
  /** dias a partir de hoje, ou a data (AAAA-MM-DD) */
  inicio: number | string;
  fim: number | string;
  origem?: string;
  orcamento?: string;
};

/** A viagem no formato do Viajei, como o campo lê sem IA e sem rede. */
export function textoDaViagem(dados: DadosDaViagem): string {
  const data = (d: number | string) => (typeof d === 'number' ? dateInSaoPaulo(d) : d);
  return [
    'viajei/1',
    `# ${dados.nome}`,
    `datas: ${data(dados.inicio)} a ${data(dados.fim)}`,
    ...(dados.origem ? [`origem: ${dados.origem}`] : []),
    ...(dados.orcamento ? [`orçamento: R$ ${dados.orcamento}`] : []),
  ].join('\n');
}

/**
 * A viagem nova como uma pessoa a cria desde a fase 17: o formato do Viajei no campo da lista, a
 * revisão e "Criar a viagem". Funciona sem rede. Abre a lista se a página não estiver nela; termina em
 * Detalhes (a viagem de hoje abre no mapa, D174: daí, pelo link). Devolve a URL da viagem (o mapa).
 */
export async function novaViagem(page: Page, dados: DadosDaViagem): Promise<string> {
  const path = new URL(page.url()).pathname;
  if (path !== '/' && path !== '/viagens') await page.goto('/viagens');
  await campo(page).fill(textoDaViagem(dados));
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible();
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}(\/detalhes)?$/);
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  if (!page.url().endsWith('/detalhes')) {
    await page.getByRole('link', { name: 'Detalhes' }).click();
    await expect(page).toHaveURL(/\/detalhes$/);
  }
  await expect(page.getByRole('heading', { name: dados.nome })).toBeVisible();
  return tripUrl;
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
