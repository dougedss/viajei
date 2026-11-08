import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { importInSteps, importSse, nominatimLocal, seedText } from './helpers/import.ts';

const SENHA = 'viajei123';
const DATES = [30, 31, 32, 33].map((d) => dateInSaoPaulo(d));

async function entrar(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('dono@viajei.local');
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** A viagem nasce pelo "Criar e colar roteiro" e cai direto na tela de colar. */
async function criarEColar(page: Page, nome: string): Promise<string> {
  await page.getByRole('link', { name: 'Nova viagem' }).first().click();
  await page.getByLabel('Nome da viagem').fill(nome);
  await page.getByRole('textbox', { name: 'Início' }).fill(DATES[0] ?? '');
  await page.getByRole('textbox', { name: 'Fim' }).fill(DATES[3] ?? '');
  await page.getByRole('button', { name: 'Criar e colar roteiro' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/importar$/);
  await expect(page.getByRole('heading', { name: 'Colar roteiro', exact: true })).toBeVisible();
  return page.url().split('/').at(-2) ?? '';
}

test('colar o roteiro do seed → revisar → editar uma parada → salvar: a viagem tem os 4 dias e as 18 paradas', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await nominatimLocal(page);
  // a função interceptada: a CI não chama a IA
  await page.route('**/functions/v1/import-itinerary', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: importSse(DATES).join(''),
    }),
  );
  await entrar(page);
  const tripId = await criarEColar(page, `Importada ${Date.now()}`);

  await page.getByRole('textbox', { name: 'Roteiro' }).fill(seedText());
  await expect(page.getByText(/^\d\.\d{3} \/ 30\.000$/)).toBeVisible();
  await expect(page.getByText('O texto vai para a IA da Anthropic')).toBeVisible();
  await page.getByRole('button', { name: 'Ler o roteiro' }).click();

  await expect(page.getByRole('heading', { name: 'Revisar o roteiro', exact: true })).toBeVisible();
  await expect(
    page.getByText('4 dias · 18 paradas · 2 reservas · 6 contatos · 4 missões'),
  ).toBeVisible();
  await expect(page.getByText('fecha às 17:00').first()).toBeVisible();
  // a busca de lugar anda sozinha, uma por segundo (o Nominatim de mentira acha um lugar para cada)
  await expect(page.getByText(/^Lugares localizados/)).toBeVisible({ timeout: 60_000 });
  // nada passa da largura do celular, nem um endereço longo
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  );

  // uma busca com lugares espalhados vira escolha; escolher o local não tira a parada da viagem
  await page.getByRole('button', { name: 'Escolher o local (2)' }).click();
  await page.getByRole('list', { name: 'Opções de local' }).getByRole('button').first().click();
  await expect(
    page.getByRole('checkbox', { name: 'Cascata do Caracol', exact: true }),
  ).toBeChecked();

  // editar uma parada: o mesmo formulário do roteiro, dentro da revisão
  await page.getByRole('button', { name: 'Editar Park Salto Ventoso' }).click();
  await expect(page.getByRole('heading', { name: 'Editar parada', exact: true })).toBeVisible();
  await page.getByLabel('Horário').fill('14:15');
  await page.getByRole('button', { name: 'Guardar na revisão' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar o roteiro', exact: true })).toBeVisible();
  await expect(page.getByText('14:15', { exact: true })).toBeVisible();

  // tirar uma parada: ela não entra
  await page.getByRole('checkbox', { name: 'Restaurante dos Bifes', exact: true }).click();
  await expect(page.getByText('4 dias · 17 paradas')).toBeVisible();

  await page.getByRole('button', { name: 'Salvar na viagem' }).click();
  await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}/detalhes$`));
  await expect(page.getByText('17 paradas em 4 dias', { exact: true })).toBeVisible();

  // no servidor, pela outbox: as paradas com a origem ai, a reserva com o código exato e o contato
  await expect
    .poll(
      async () => (await linhas('stops', `trip_id=eq.${tripId}&source=eq.ai&select=id`)).length,
      {
        timeout: 30_000,
      },
    )
    .toBe(17);
  const [park] = await linhas(
    'stops',
    `trip_id=eq.${tripId}&name=eq.Park%20Salto%20Ventoso&select=time`,
  );
  expect(park?.time).toBe('14:15:00');
  expect(await linhas('reservations', `trip_id=eq.${tripId}&select=id`)).toHaveLength(2);
  expect(await linhas('contacts', `trip_id=eq.${tripId}&select=phone`)).toContainEqual({
    phone: '+5551997527596',
  });

  // o rascunho saiu do aparelho: voltar à tela de colar mostra o campo vazio
  await page.goto(`/viagens/${tripId}/importar`);
  await expect(page.getByRole('textbox', { name: 'Roteiro' })).toHaveValue('');
});

test('o preview enche aos poucos enquanto o JSON chega', async ({ page }) => {
  test.setTimeout(90_000);
  await nominatimLocal(page);
  // para no meio do segundo dia: o terceiro e o quarto ainda não chegaram
  await importInSteps(page, importSse(DATES, `"date":"${DATES[2] ?? ''}"`));
  await entrar(page);
  await criarEColar(page, `Aos poucos ${Date.now()}`);

  await page.getByRole('textbox', { name: 'Roteiro' }).fill(seedText());
  await page.getByRole('button', { name: 'Ler o roteiro' }).click();

  // a primeira parte chegou: os primeiros dias já estão na tela, o último ainda não
  await expect(page.getByText(/^Chegando · \d dias? · \d+ paradas?$/)).toBeVisible();
  const chegaram = page.getByRole('list', { name: 'Dias que chegaram' });
  await expect(chegaram.getByText('Saída de Papanduva')).toBeVisible();
  await expect(chegaram.getByText('Cascata do Caracol')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();

  await page.evaluate('globalThis.__releaseImport()');
  await expect(page.getByRole('heading', { name: 'Revisar o roteiro', exact: true })).toBeVisible();
  await expect(page.getByText('4 dias · 18 paradas')).toBeVisible();
});

test('sem rede, o botão explica e o rascunho continua no aparelho', async ({ page, context }) => {
  await entrar(page);
  const tripId = await criarEColar(page, `Sem rede ${Date.now()}`);
  await page
    .getByRole('textbox', { name: 'Roteiro' })
    .fill('Sexta 7h saída de casa\nSábado 9h cascata');
  await expect(page.getByText('Rascunho guardado neste celular')).toBeVisible();

  // a viagem recém-criada sobe antes: uma resposta do sync que chegasse depois do corte marcaria o
  // app como online de novo (qualquer resposta do servidor marca, D111)
  await expect
    .poll(async () => (await linhas('trip_days', `trip_id=eq.${tripId}&select=id`)).length)
    .toBe(4);
  await expect(async () => {
    await context.setOffline(false);
    await context.setOffline(true);
    await expect(
      page.getByRole('button', { name: 'Precisa de internet para ler o roteiro' }),
    ).toBeDisabled({ timeout: 2_000 });
    await expect(page.getByText('O texto fica guardado aqui até a rede voltar.')).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: 'Ler o roteiro' })).toBeEnabled();

  // sair da tela e voltar: o texto vem do aparelho (o Vite de dev não serve sem rede, por isso a
  // volta é com rede; o que se prova é que o rascunho não vivia só na tela)
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}/detalhes$`));
  await page.getByRole('link', { name: 'Colar roteiro' }).click();
  await expect(page.getByRole('textbox', { name: 'Roteiro' })).toHaveValue(
    'Sexta 7h saída de casa\nSábado 9h cascata',
  );
});
