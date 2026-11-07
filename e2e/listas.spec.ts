import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';

const SENHA = 'viajei123';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** Uma viagem 30 dias à frente (D33), com uma parada de natureza; devolve a URL da viagem. */
async function viagem(page: Page, nome: string): Promise<string> {
  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`${nome} ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(30));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(31));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  const tripUrl = page.url();
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await page.getByRole('button', { name: 'Adicionar parada' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Natureza' }).click();
  await dialog.getByLabel('Nome').fill('Cascata do Caracol');
  await dialog.getByLabel('Horário').fill('10:00');
  await dialog.getByRole('button', { name: /Adicionar/ }).click();
  await expect(dialog).toHaveCount(0);
  return tripUrl;
}

async function adicionar(page: Page, campo: string, textos: string[]) {
  const input = page.getByLabel(campo);
  for (const t of textos) {
    await input.fill(t);
    await input.press('Enter');
    // Enter adiciona e mantém o foco, para digitar a mala de uma vez
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
  }
}

test('marcar Antes e Mala até 100% antes da viagem mostra "Pronto para partir"', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await viagem(page, 'Listas');
  const tripId = tripUrl.split('/').at(-1) ?? '';

  await page.goto(`${tripUrl}/checklists`);
  await adicionar(page, 'Novo item de antes de viajar', [
    'Revisar pneus e estepe',
    'Comprar ingressos',
  ]);
  await page.getByRole('tab', { name: /^Mala/ }).click();
  await adicionar(page, 'Novo item da mala', ['Protetor solar']);
  await expect(page.getByRole('tab', { name: 'Mala 0/1' })).toBeVisible();

  await page.getByRole('checkbox', { name: /^Protetor solar/ }).click();
  await expect(page.getByRole('checkbox', { name: /^Protetor solar/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('tab', { name: /^Antes/ }).click();
  await page.getByRole('checkbox', { name: /^Revisar pneus/ }).click();
  await expect(page.getByRole('dialog', { name: 'Pronto para partir' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: /^Comprar ingressos/ }).click();

  const ready = page.getByRole('dialog', { name: 'Pronto para partir' });
  await expect(ready).toBeVisible();
  await ready.getByRole('button', { name: 'Fechar' }).click();
  await expect(ready).toHaveCount(0);

  // marcar grava quem e quando, e chega ao servidor
  await expect
    .poll(
      async () =>
        (await linhas('checklist_items', `trip_id=eq.${tripId}&done_at=not.is.null&select=id`))
          .length,
      { timeout: 15_000 },
    )
    .toBe(3);

  // a visão geral mostra o selo; o cartão não volta (uma vez por aparelho)
  await page.goto(tripUrl);
  await expect(page.getByRole('link', { name: 'Pronto para partir: ver as listas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Listas: 3 de 3' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Pronto para partir' })).toHaveCount(0);
});

test('sugestão adicionada vira missão; dispensada não volta depois de recarregar', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await viagem(page, 'Sugestões');
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // a parada de natureza sugere a missão e o repelente; nada disso é gravado antes do toque
  await page.goto(`${tripUrl}/checklists?aba=missoes`);
  const quest = page.getByRole('listitem', { name: 'Sugestão: Foto do time com a paisagem' });
  // a primeira visita à rota compila a página e a leitura do cenário no Vite de dev
  await expect(quest).toBeVisible({ timeout: 15_000 });
  expect(await linhas('checklist_items', `trip_id=eq.${tripId}&select=id`)).toHaveLength(0);
  await quest.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByRole('checkbox', { name: /^Foto do time com a paisagem/ })).toBeVisible();

  await page.getByRole('tab', { name: /^Mala/ }).click();
  const repellent = page.getByRole('listitem', { name: 'Sugestão: Repelente' });
  await expect(repellent).toBeVisible();
  await repellent.getByRole('button', { name: 'Dispensar' }).click();
  await expect(repellent).toHaveCount(0);

  // no servidor: a missão ativa e o repelente como linha viva dispensada
  await expect
    .poll(
      async () =>
        (
          await linhas(
            'checklist_items',
            `trip_id=eq.${tripId}&select=text,kind,status,source,points&order=text`,
          )
        ).map((r) => `${String(r.kind)}:${String(r.text)}:${String(r.status)}:${String(r.points)}`),
      { timeout: 15_000 },
    )
    .toEqual(['quest:Foto do time com a paisagem:active:20', 'pack:Repelente:dismissed:0']);

  // recarregar (e passar pelo pull) não traz a dispensada de volta
  await page.reload();
  await expect(page.getByRole('tab', { name: /^Mala/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Mala', exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Sugestão: Repelente' })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Missões/ }).click();
  await expect(page.getByRole('checkbox', { name: /^Foto do time com a paisagem/ })).toBeVisible();
  await expect(
    page.getByRole('listitem', { name: 'Sugestão: Foto do time com a paisagem' }),
  ).toHaveCount(0);
});
