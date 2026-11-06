import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';

const SENHA = 'viajei123';
const futureDate = dateInSaoPaulo;

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

async function criarViagem(page: Page, nome: string, inicio: string, fim: string) {
  await page.getByRole('link', { name: 'Nova viagem' }).first().click();
  await page.getByLabel('Nome da viagem').fill(nome);
  await page.getByRole('textbox', { name: 'Início' }).fill(inicio);
  await page.getByRole('textbox', { name: 'Fim' }).fill(fim);
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
}

async function adicionarParada(
  page: Page,
  dados: { tipo: string; nome: string; horario: string; deslocamento?: string },
) {
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

test('os dias nascem das datas, as paradas entram no dia e o Agora mostra "sair às" e o Partiu!', async ({
  page,
}) => {
  await entrar(page, 'dono@viajei.local');
  await criarViagem(page, `Serra ${Date.now()}`, futureDate(30), futureDate(33));

  // quatro dias derivados das datas
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await expect(page.getByRole('heading', { name: 'Roteiro', exact: true, level: 1 })).toBeVisible();
  const dias = page.getByRole('list', { name: 'Dias da viagem' }).getByRole('listitem');
  await expect(dias).toHaveCount(4);

  // dia 1: saída de origem e uma atração
  await dias.first().getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Dia 1' })).toBeVisible();
  await adicionarParada(page, {
    tipo: 'Origem',
    nome: 'Saída de Papanduva',
    horario: '07:00',
    deslocamento: '390',
  });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Park Salto Ventoso', horario: '13:30' });
  await expect(
    page.getByRole('list', { name: 'Paradas do dia' }).getByRole('listitem'),
  ).toHaveCount(2);
  await expect(page.getByText('6h30 até a próxima')).toBeVisible();

  // Modo Viagem: a viagem é futura, então o dia atual é o primeiro; "sair às" é o horário da origem
  // a semântica do "Agora" não depende da maquete (ela tem o próprio e2e): a lista vem aberta
  await page.goto(page.url().replace(/\/roteiro\/.*$/, '/viagem?render=list'));
  const agora = page.getByRole('region', { name: 'Agora' });
  await expect(agora).toBeVisible();
  await expect(agora.getByText('Saída de Papanduva')).toBeVisible();
  await expect(agora.getByText(/sair às\s*07:00/)).toBeVisible();

  // Partiu! conclui e deixa a origem; a próxima passa a ser o parque, com "chega às"
  await page.getByRole('button', { name: 'Partiu!' }).click();
  await expect(page.getByText(/Saímos/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chegamos!' })).toBeVisible();
  await expect(agora.getByText(/chega às\s*13:30/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Trilha do dia' })).toContainText('chegamos');

  // Chegamos! no parque: dia concluído
  await page.getByRole('button', { name: 'Chegamos!' }).click();
  await expect(agora.getByText('Dia concluído')).toBeVisible();
  await expect(page.getByText('2 de 2 paradas')).toBeVisible();
});

test('encurtar a viagem com parada no dia que sairia é bloqueado com a lista das paradas', async ({
  page,
}) => {
  await entrar(page, 'dono@viajei.local');
  const inicio = futureDate(40);
  await criarViagem(page, `Encurtar ${Date.now()}`, inicio, futureDate(41));
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  const dias = page.getByRole('list', { name: 'Dias da viagem' }).getByRole('listitem');
  await expect(dias).toHaveCount(2);
  await dias.nth(1).getByRole('link').click();
  await adicionarParada(page, { tipo: 'Hotel', nome: 'Hotel Steffen', horario: '16:30' });

  await page.goto(page.url().replace(/\/roteiro\/.*$/, '/editar'));
  await page.getByRole('textbox', { name: 'Fim' }).fill(inicio);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('alert')).toContainText('Hotel Steffen');
  await expect(page.getByRole('alert')).toContainText('Não dá para encurtar');
});
