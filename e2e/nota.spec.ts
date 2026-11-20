import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { toAiReceipt, type ReadReceipt } from '../supabase/functions/_shared/read-protocol.ts';
import { novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { aiSse } from './helpers/import.ts';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

/**
 * "Fotografar a nota" (fase 18): a foto da nota com o QR da NFC-e (a imagem fixa `nfce-qr.png`, com
 * uma chave que fecha o DV; a URL de consulta na versão 3, online) dá o CNPJ no aparelho, sem IA; a
 * BrasilAPI (respondida no navegador) dá o estabelecimento; a IA (idem) dá o total, a data e a
 * categoria. O gasto vem preenchido, a pessoa confirma, e a foto fica anexada ao gasto e aparece na
 * folha dele. A BrasilAPI de verdade nunca é chamada na CI.
 */
async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

const QR_PNG = readFileSync('e2e/helpers/fixtures/nfce-qr.png');
const CNPJ_NO_QR = '00156225000131';

test('a foto da nota: o QR dá o CNPJ e o lugar pela BrasilAPI, a IA dá o total; o gasto nasce preenchido e com a nota anexada', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const email = await criarUsuarioDescartavel('Nota');
  await entrar(page, email);
  const start = dateInSaoPaulo(20);
  await novaViagem(page, { nome: `Nota ${Date.now()}`, inicio: start, fim: dateInSaoPaulo(21) });
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  const tripId = tripUrl.split('/').at(-1) ?? '';

  const lida: ReadReceipt = {
    total: 187.4,
    merchant: 'POSTO SERRA LTDA',
    cnpj: CNPJ_NO_QR,
    date: start,
    time: '15:42',
    category: 'fuel',
    access_key: null,
  };
  const cnpjCalls: string[] = [];
  await page.route('https://brasilapi.com.br/**', (route) => {
    cnpjCalls.push(route.request().url());
    return route.fulfill({
      json: {
        cnpj: CNPJ_NO_QR,
        razao_social: 'POSTO DO LABORATORIO LTDA',
        nome_fantasia: 'POSTO DO LABORATORIO',
        municipio: 'CANELA',
        uf: 'RS',
      },
    });
  });
  let request: Record<string, unknown> | null = null;
  await page.route('**/functions/v1/read-document', (route) => {
    request = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: aiSse(JSON.stringify(toAiReceipt(lida)), { data: lida }),
    });
  });

  await page.goto(`${tripUrl}/gastos?novo=1`);
  const sheet = page.getByRole('dialog', { name: 'Novo gasto' });
  await expect(sheet).toBeVisible();
  await sheet
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'nota.png', mimeType: 'image/png', buffer: QR_PNG });
  await expect(sheet.locator('[data-receipt="done"]')).toBeVisible({ timeout: 45_000 });

  // o que a nota deu: o total pela IA, o lugar pela BrasilAPI (pelo CNPJ da chave do QR), a data e a
  // categoria pela IA
  await expect(sheet.locator('[data-receipt-read]')).toContainText('R$ 187,40');
  await expect(sheet.locator('[data-receipt-read]')).toContainText('Posto do Laboratorio');
  await expect(sheet.getByLabel('Valor')).toHaveValue('187,40');
  await expect(sheet.getByLabel('Data')).toHaveValue(start);
  await expect(sheet.getByLabel('Observações')).toHaveValue('Posto do Laboratorio');
  await expect(sheet.getByRole('button', { name: 'Combustível' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(cnpjCalls).toEqual([`https://brasilapi.com.br/api/cnpj/v1/${CNPJ_NO_QR}`]);
  expect(request).toMatchObject({ kind: 'receipt', trip_id: tripId });

  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toHaveCount(0);
  const row = page.getByRole('button', { name: /Posto do Laboratorio/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('nota');

  // o gasto no servidor, em centavos exatos, e a nota como anexo dele
  await expect
    .poll(
      async () =>
        (await linhas('expenses', `trip_id=eq.${tripId}&select=amount,category,date,notes`)).map(
          (e) => [e.amount, e.category, e.date, e.notes],
        ),
      { timeout: 20_000 },
    )
    .toEqual([[187.4, 'fuel', start, 'Posto do Laboratorio']]);
  const anexos = await expect
    .poll(
      async () =>
        linhas(
          'attachments',
          `trip_id=eq.${tripId}&select=kind,mime,expense_id,stop_id,reservation_id`,
        ),
      { timeout: 30_000 },
    )
    .toHaveLength(1)
    .then(() =>
      linhas(
        'attachments',
        `trip_id=eq.${tripId}&select=kind,mime,expense_id,stop_id,reservation_id`,
      ),
    );
  expect(anexos[0]).toMatchObject({
    kind: 'document',
    mime: 'image/jpeg',
    stop_id: null,
    reservation_id: null,
  });
  expect(anexos[0]?.expense_id).toBeTruthy();

  // a folha do gasto mostra a nota e abre o visualizador, pelo arquivo do aparelho
  await row.click();
  const open = page.getByRole('dialog', { name: 'Gasto' });
  await expect(open).toBeVisible();
  await open.getByRole('button', { name: 'Abrir a nota' }).click();
  const viewer = page.getByRole('dialog', { name: 'Foto em tela cheia' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('img[src^="blob:"]')).toBeVisible();
});
