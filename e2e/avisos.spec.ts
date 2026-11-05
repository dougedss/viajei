import { expect, test, type Page } from '@playwright/test';

const SENHA = 'viajei123';
const futureDate = (daysAhead: number) =>
  new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

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

test('a preferência de aviso é gravada e persiste sem sinal (Dexie), e o dia sai como .ics', async ({
  page,
  context,
}) => {
  // sem a folha de compartilhar o .ics vira download, que o teste consegue ler
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await entrar(page, 'dono@viajei.local');
  await criarViagem(page, `Avisos ${Date.now()}`, futureDate(30), futureDate(33));

  // preferências: o toggle do time liga, a antecedência muda
  await page.getByRole('link', { name: 'Avisos da viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Avisos', level: 1 })).toBeVisible();
  const time = page.getByRole('switch', { name: /^Time/ });
  await expect(time).toHaveAttribute('aria-checked', 'false');
  await time.click();
  await expect(time).toHaveAttribute('aria-checked', 'true');

  // sem sinal: a mudança fica no Dexie e sobrevive à navegação dentro do app
  await context.setOffline(true);
  await page.getByRole('radio', { name: '30 min' }).click();
  await expect(page.getByRole('radio', { name: '30 min' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page.getByRole('link', { name: 'Avisos da viagem' })).toBeVisible();
  await page.getByRole('link', { name: 'Avisos da viagem' }).click();
  await expect(page.getByRole('radio', { name: '30 min' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: /^Time/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /Sem conexão/ })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: /Sem conexão|pendente/ })).toHaveCount(0, {
    timeout: 15_000,
  });

  // uma parada com horário no dia 1 e o .ics do dia
  await page.getByRole('link', { name: 'Voltar' }).click();
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(page, {
    tipo: 'Origem',
    nome: 'Saída de Papanduva',
    horario: '07:00',
    deslocamento: '390',
  });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Park Salto Ventoso', horario: '13:30' });

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Calendário' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^viajei-avisos-\d+-\d{4}-\d{2}-\d{2}\.ics$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('TZID:America/Sao_Paulo');
  expect(text).toContain('SUMMARY:Park Salto Ventoso');
  expect(text).toContain('TRIGGER:-PT6H45M');
  expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(2);
});
