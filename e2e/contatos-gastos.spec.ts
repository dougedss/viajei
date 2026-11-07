import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { criarUsuarioDescartavel, SENHA } from './helpers/users.ts';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

async function criarViagem(
  page: Page,
  dados: { nome: string; inicio: number; fim: number; orcamento?: string },
): Promise<string> {
  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`${dados.nome} ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(dados.inicio));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(dados.fim));
  if (dados.orcamento) await page.getByLabel('Orçamento').fill(dados.orcamento);
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  return page.url();
}

async function adicionarParada(page: Page, dados: { tipo: string; nome: string; horario: string }) {
  await page.getByRole('button', { name: 'Adicionar parada' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: dados.tipo }).click();
  await dialog.getByLabel('Nome').fill(dados.nome);
  await dialog.getByLabel('Horário').fill(dados.horario);
  await dialog.getByRole('button', { name: /Adicionar/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('group', { name: dados.nome })).toBeVisible();
}

test('contato com ligar e WhatsApp nos href certos, e a emergência sempre no topo', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await criarViagem(page, { nome: 'Contatos', inicio: 30, fim: 31 });

  await page.goto(`${tripUrl}/contatos`);
  // a emergência é constante: aparece antes de qualquer cadastro, só com ligar
  await expect(page.getByRole('link', { name: 'Ligar para SAMU, 192' })).toHaveAttribute(
    'href',
    'tel:192',
  );
  for (const [nome, numero] of [
    ['Bombeiros', '193'],
    ['Polícia Militar', '190'],
    ['Polícia Rodoviária Federal', '191'],
  ] as const) {
    await expect(page.getByRole('link', { name: `Ligar para ${nome}, ${numero}` })).toHaveAttribute(
      'href',
      `tel:${numero}`,
    );
  }

  await page.getByRole('button', { name: 'Contato', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Novo contato' });
  await sheet.getByLabel('Nome').fill('Hotel Steffen');
  await sheet.getByLabel('Telefone').fill('(51) 99752-7596');
  await sheet.getByRole('button', { name: 'Hotel', exact: true }).click();
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toHaveCount(0);

  await expect(page.getByRole('heading', { name: 'Hotéis' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ligar para Hotel Steffen' })).toHaveAttribute(
    'href',
    'tel:+5551997527596',
  );
  await expect(page.getByRole('link', { name: 'WhatsApp de Hotel Steffen' })).toHaveAttribute(
    'href',
    'https://wa.me/5551997527596',
  );

  // telefone fixo: só ligar
  await page.getByRole('button', { name: 'Contato', exact: true }).click();
  await sheet.getByLabel('Nome').fill('Salto Ventoso');
  await sheet.getByLabel('Telefone').fill('(54) 2131-5007');
  await sheet.getByRole('button', { name: 'Atração', exact: true }).click();
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('link', { name: 'Ligar para Salto Ventoso' })).toHaveAttribute(
    'href',
    'tel:+555421315007',
  );
  await expect(page.getByRole('link', { name: 'WhatsApp de Salto Ventoso' })).toHaveCount(0);

  // o servidor recebeu os dois, em E.164
  const tripId = tripUrl.split('/').at(-1) ?? '';
  await expect
    .poll(
      async () =>
        (await linhas('contacts', `trip_id=eq.${tripId}&select=phone`))
          .map((r) => String(r.phone))
          .sort(),
      { timeout: 15_000 },
    )
    .toEqual(['+5551997527596', '+555421315007']);
});

/**
 * O "+ Gasto" do Modo Viagem: parado na parada, o formulário já vem com ela e a categoria pelo tipo.
 * R$ 85 de R$ 100 deixa a barra âmbar (acima de 80%). A viagem é de hoje, então o usuário é
 * descartável (D48).
 */
test('gasto pelo "+ Gasto" do Modo Viagem aparece no total e na barra do orçamento', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const email = await criarUsuarioDescartavel('Gastos');
  const context = await browser.newContext({ ...test.info().project.use });
  const page = await context.newPage();
  await entrar(page, email);
  const tripUrl = await criarViagem(page, { nome: 'Gastos', inicio: 0, fim: 1, orcamento: '100' });
  const tripId = tripUrl.split('/').at(-1) ?? '';

  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(page, { tipo: 'Origem', nome: 'Saída de casa', horario: '07:00' });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Cascata do Caracol', horario: '10:00' });

  await page.goto(`${tripUrl}/viagem?render=list`);
  await page.getByRole('button', { name: 'Partiu!' }).click();
  await expect(page.getByText('Saímos: Saída de casa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Chegamos!' }).click();
  const howWasIt = page.getByRole('dialog', { name: 'Como foi Cascata do Caracol?' });
  await expect(howWasIt).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  await expect(howWasIt).toHaveCount(0);

  // o "+ Gasto" nunca abre sozinho: só pelo toque de quem está no banco do passageiro
  await page.getByRole('button', { name: 'Gasto', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Novo gasto' });
  await expect(sheet.getByRole('button', { name: 'Atrações' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByLabel('Parada')).toHaveValue(/.+/);
  await expect(sheet.getByLabel('Data')).toHaveValue(dateInSaoPaulo());
  await sheet.getByLabel('Valor').fill('85');
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await expect(sheet).toHaveCount(0);

  await page.goto(`${tripUrl}/gastos`);
  const bar = page.locator('[data-budget]');
  await expect(bar).toHaveAttribute('data-budget', 'tight');
  await expect(bar).toContainText('85%');
  await expect(bar).toContainText(/R\$\s85,00/);
  await expect(page.getByRole('heading', { name: 'Por categoria' })).toBeVisible();
  await expect(page.getByText(/Atrações/).first()).toBeVisible();

  await expect
    .poll(
      async () =>
        (
          await linhas(
            'expenses',
            `trip_id=eq.${tripId}&select=amount,category,date,stop_id,reservation_id`,
          )
        ).map((r) => [r.amount, r.category, r.date, r.stop_id !== null, r.reservation_id]),
      { timeout: 15_000 },
    )
    .toEqual([[85, 'attractions', dateInSaoPaulo(), true, null]]);
  await context.close();
});

/**
 * "Lançar como gasto" em dois aparelhos da mesma conta: um com rede, o outro sem sinal. O id
 * determinístico faz os dois escreverem a mesma linha: no servidor, um gasto só.
 */
test('"Lançar como gasto" numa reserva com valor, em dois aparelhos, vira um gasto só', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const email = await criarUsuarioDescartavel('Reserva');
  const a = await browser.newContext({ ...test.info().project.use });
  const pageA = await a.newPage();
  await entrar(pageA, email);
  const tripUrl = await criarViagem(pageA, { nome: 'Reserva paga', inicio: 30, fim: 31 });
  const tripId = tripUrl.split('/').at(-1) ?? '';

  await pageA.goto(`${tripUrl}/reservas/nova`);
  await pageA.getByLabel('Nome').fill('Hotel Steffen');
  await pageA.getByLabel('Valor').fill('560');
  await pageA.getByRole('button', { name: 'Salvar reserva' }).click();
  const sheetA = pageA.getByRole('dialog', { name: 'Hotel Steffen' });
  await expect(sheetA).toBeVisible();
  const rid = new URL(pageA.url()).searchParams.get('abrir') ?? '';
  expect(rid).not.toBe('');
  await expect
    .poll(async () => (await linhas('reservations', `id=eq.${rid}&select=id`)).length, {
      timeout: 15_000,
    })
    .toBe(1);

  // o segundo aparelho abre a reserva e perde o sinal
  const b = await browser.newContext({ ...test.info().project.use });
  const pageB = await b.newPage();
  await entrar(pageB, email);
  await pageB.goto(`${tripUrl}/reservas?abrir=${rid}`);
  const sheetB = pageB.getByRole('dialog', { name: 'Hotel Steffen' });
  // o primeiro pull do aparelho novo traz a viagem e a reserva
  await expect(sheetB.getByRole('button', { name: 'Lançar como gasto' })).toBeVisible({
    timeout: 20_000,
  });
  await b.setOffline(true);

  // o primeiro lança com rede
  await sheetA.getByRole('button', { name: 'Lançar como gasto' }).click();
  await expect(sheetA.getByRole('link', { name: /Gasto lançado/ })).toBeVisible();
  const stamp = async () => {
    const [row] = await linhas('expenses', `reservation_id=eq.${rid}&select=synced_at`);
    return typeof row?.synced_at === 'string' ? row.synced_at : '';
  };
  await expect.poll(stamp, { timeout: 15_000 }).not.toBe('');
  const first = await stamp();

  // o segundo, sem sinal, lança também; quando a rede volta, a mesma linha
  await sheetB.getByRole('button', { name: 'Lançar como gasto' }).click();
  await expect(sheetB.getByRole('link', { name: /Gasto lançado/ })).toBeVisible();
  await b.setOffline(false);
  await expect
    .poll(
      async () =>
        (
          await linhas('expenses', `trip_id=eq.${tripId}&select=amount,category,reservation_id`)
        ).map((r) => [r.amount, r.category, r.reservation_id]),
      { timeout: 20_000 },
    )
    .toEqual([[560, 'lodging', rid]]);
  // e o envio do segundo foi aceito (o servidor carimbou a mesma linha de novo), não recusado
  await expect.poll(stamp, { timeout: 20_000 }).not.toBe(first);

  // "Gasto lançado" leva ao gasto
  await sheetA.getByRole('link', { name: /Gasto lançado/ }).click();
  await expect(pageA).toHaveURL(/\/gastos\?abrir=/);
  await expect(pageA.getByRole('dialog', { name: 'Gasto' })).toBeVisible();
  await a.close();
  await b.close();
});
