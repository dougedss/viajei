import { expect, test, type Page } from '@playwright/test';
import {
  toAiConfirmation,
  type ReadConfirmation,
} from '../supabase/functions/_shared/read-protocol.ts';
import { novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { makePng } from './helpers/images.ts';
import { aiSse } from './helpers/import.ts';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

/**
 * "Ler a confirmação" (fase 18): a pessoa cola o texto e anexa o print, a IA (respondida no navegador,
 * como a `plan-trip` nos outros specs) devolve a reserva, o formulário vem preenchido com o que a
 * leitura tirou e diz o que ficou vazio, e salvar cria a reserva com o print anexado: o arquivo que
 * subiu antes da leitura vira a linha de `attachments`, sem subir de novo.
 */
async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

const LIDA: ReadConfirmation = {
  type: 'hotel',
  name: 'Pousada Laboratório da Serra',
  start_at: `${dateInSaoPaulo(30)}T16:30`,
  end_at: `${dateInSaoPaulo(31)}T11:00`,
  confirmation_code: 'LAB-7Q2X',
  amount: 480,
  cancel_policy: 'Grátis até 7 dias antes',
  cancel_until: dateInSaoPaulo(23),
  phone: '(54) 99123-4567',
  address: null,
  booked_via: 'Booking',
  notes: null,
};

test('colar e anexar: a reserva vem preenchida, o vazio é dito, e o print vira anexo ao salvar', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await criarUsuarioDescartavel('Ler');
  await entrar(page, email);
  await novaViagem(page, {
    nome: `Ler a confirmação ${Date.now()}`,
    inicio: dateInSaoPaulo(30),
    fim: dateInSaoPaulo(31),
  });
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // a IA respondida no navegador: o pedido tem de levar o texto e o caminho do anexo na pasta da viagem
  const seen: { request: { attachment?: { path?: string } } & Record<string, unknown> } = {
    request: {},
  };
  await page.route('**/functions/v1/read-document', (route) => {
    seen.request = route.request().postDataJSON() as typeof seen.request;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: aiSse(JSON.stringify(toAiConfirmation(LIDA)), { data: LIDA }),
    });
  });

  await page.goto(`${tripUrl}/reservas`);
  await page.getByRole('link', { name: 'Ler a confirmação' }).click();
  await expect(page.getByRole('heading', { name: 'Ler a confirmação' })).toBeVisible();
  await page
    .getByLabel('O texto da confirmação')
    .fill('Reserva confirmada! Pousada Laboratório da Serra, código LAB-7Q2X, R$ 480.');
  await page
    .locator('input[type=file][accept*="application/pdf"]')
    .setInputFiles({ name: 'print.png', mimeType: 'image/png', buffer: makePng(1170, 2532) });
  const staged = page.getByRole('list', { name: 'Anexo a ler' });
  // o print vira JPEG ao ser preparado, antes de subir: a lista mostra o nome guardado
  await expect(staged).toContainText('print.jpg', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Ler a confirmação' }).click();

  // a reserva lida: o formulário preenchido e o que ficou vazio dito
  await expect(page.getByText('Reserva lida. Confira e salve.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/A confirmação não dizia: o endereço\./)).toBeVisible();
  await expect(page.getByLabel('Nome')).toHaveValue('Pousada Laboratório da Serra');
  await expect(page.getByLabel('Código de confirmação')).toHaveValue('LAB-7Q2X');
  await expect(page.getByLabel('Valor')).toHaveValue('480,00');
  await expect(page.getByLabel('Check-in')).toHaveValue(dateInSaoPaulo(30));
  await expect(page.getByLabel('Horário').first()).toHaveValue('16:30');
  await expect(page.getByLabel('Telefone')).toHaveValue('(54) 99123-4567');
  await expect(page.getByLabel('Endereço')).toHaveValue('');
  await expect(page.getByLabel('Último dia para cancelar sem custo')).toHaveValue(
    dateInSaoPaulo(23),
  );
  // o anexo lido já está na lista para salvar
  await expect(page.getByRole('list', { name: 'Anexos a enviar' })).toContainText('print.jpg');
  expect(seen.request).toMatchObject({ kind: 'confirmation', trip_id: tripId });
  const readPath = seen.request.attachment?.path ?? '';
  expect(readPath).toMatch(new RegExp(`^${tripId}/[0-9a-f-]{36}\\.jpg$`));

  await page.getByRole('button', { name: 'Salvar reserva' }).click();
  const sheet = page.getByRole('dialog', { name: 'Pousada Laboratório da Serra' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: /Código LAB-7Q2X/ })).toBeVisible();
  // o print que subiu antes da leitura vira a linha, no mesmo caminho (nada sobe duas vezes)
  const uploaded = sheet.locator('[data-media]:not([data-pending])');
  await expect(uploaded).toBeVisible({ timeout: 30_000 });
  const id = (await uploaded.getAttribute('data-media')) ?? '';
  expect(`${tripId}/${id}.jpg`).toBe(readPath);
  expect(await linhas('attachments', `id=eq.${id}&select=kind,mime,reservation_id`)).toHaveLength(
    1,
  );
  const reservas = await linhas(
    'reservations',
    `trip_id=eq.${tripId}&select=name,confirmation_code,amount,booked_via,phone,address`,
  );
  expect(reservas).toEqual([
    {
      name: 'Pousada Laboratório da Serra',
      confirmation_code: 'LAB-7Q2X',
      amount: 480,
      booked_via: 'Booking',
      phone: '+5554991234567',
      address: null,
    },
  ]);
});

test('sem texto nem anexo o botão não liga; "Procurar hotel perto de" aparece na hospedagem sem código', async ({
  page,
}) => {
  const email = await criarUsuarioDescartavel('Hotel');
  await entrar(page, email);
  await novaViagem(page, {
    nome: 'Hotel perto',
    inicio: dateInSaoPaulo(40),
    fim: dateInSaoPaulo(41),
  });
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  await page.goto(`${tripUrl}/reservas/ler`);
  await expect(page.getByRole('button', { name: 'Ler a confirmação' })).toBeDisabled();

  // uma parada no dia 1, e a reserva nova ligada a ela: o link do Booking com a noite daquele dia
  await page.goto(`${tripUrl}/detalhes`);
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await page.getByRole('button', { name: 'Adicionar parada' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Cidade' }).click();
  await dialog.getByLabel('Nome').fill('Canela');
  await dialog.getByLabel('Horário').fill('18:00');
  await dialog.getByRole('button', { name: /Adicionar/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`${tripUrl}/reservas/nova`);
  await page.getByLabel('Ligada a').selectOption({ label: '18:00 · Canela' });
  const link = page.getByRole('link', { name: 'Procurar hotel perto de Canela' });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href')) ?? '';
  expect(href).toContain('booking.com/searchresults.pt-br.html');
  expect(href).toContain(`checkin=${dateInSaoPaulo(40)}`);
  expect(href).toContain(`checkout=${dateInSaoPaulo(41)}`);
  expect(href).toContain('ss=Canela');
  // com um código, já há reserva: o link some
  await page.getByLabel('Código de confirmação').fill('ABC-1');
  await expect(link).toHaveCount(0);
});
