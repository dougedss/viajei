import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { fakeOpenMeteo, viagemNaSerra } from './helpers/world.ts';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

/** "26/11" de uma data 'yyyy-MM-dd'. */
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * O clima com o Open-Meteo de mentira (16° a 28°, chuva 60% no dia; 70% de chuva em toda hora): a
 * faixa da visão geral com os números de cada dia, o resumo na página do dia e o detalhe da parada
 * com horário, a atribuição e, sem rede, o "atualizado às".
 */
test('a faixa da visão geral, o dia e o "atualizado às" sem rede', async ({ page, context }) => {
  test.setTimeout(90_000);
  const meteo = await fakeOpenMeteo(context);
  const user = await criarUsuario('Clima');
  const { tripId, days, dates } = await viagemNaSerra(user.id, 1);
  await entrar(page, user.email);

  await page.goto(`/viagens/${tripId}/detalhes`);
  const strip = page.locator('[data-weather-strip]');
  await expect(strip).toBeVisible({ timeout: 20_000 });
  const first = strip.locator(`[data-weather-day="${dates[0]}"]`);
  await expect(first.locator('[data-weather-max]')).toHaveText('28°');
  await expect(first.locator('[data-weather-min]')).toHaveText('16°');
  await expect(first).toContainText('60%');
  await expect(strip.locator(`[data-weather-day="${dates[1]}"] [data-weather-max]`)).toHaveText(
    '28°',
  );
  await expect(strip.getByRole('link', { name: 'Dados do tempo: Open-Meteo.com' })).toHaveAttribute(
    'href',
    'https://open-meteo.com/',
  );
  await expect(strip.locator('[data-weather-updated]')).toHaveText(/^Atualizado às \d\d:\d\d$/);
  // uma chamada só para a viagem inteira
  expect(meteo.count()).toBe(1);

  // a página do dia: o resumo e o detalhe na parada com horário; nada na parada sem lugar
  await page.goto(`/viagens/${tripId}/roteiro/${days[0]}`);
  const forecast = page.locator('[data-day-forecast]');
  await expect(forecast).toContainText('28° / 16°');
  await expect(forecast).toContainText('chuva 60%');
  const cascata = page.getByRole('group', { name: 'Cascata do Caracol' });
  await expect(cascata.locator('[data-stop-forecast]')).toContainText('chuva 70%');
  await expect(
    page.getByRole('group', { name: 'Almoço sem lugar' }).locator('[data-stop-forecast]'),
  ).toHaveCount(0);

  // sem rede: o que está guardado continua, com a hora em que veio
  await page.goto(`/viagens/${tripId}/detalhes`);
  await expect(strip.locator(`[data-weather-day="${dates[0]}"] [data-weather-max]`)).toHaveText(
    '28°',
  );
  await context.setOffline(true);
  await expect(strip.locator('[data-weather-updated]')).toHaveText(
    /^Sem internet · atualizado às \d\d:\d\d$/,
  );
  await expect(strip.locator(`[data-weather-day="${dates[0]}"] [data-weather-max]`)).toHaveText(
    '28°',
  );
  await context.setOffline(false);
  // o cache está novo: nada de buscar de novo
  expect(meteo.count()).toBe(1);
});

test('o dia longe demais diz a partir de quando a previsão aparece', async ({ page, context }) => {
  const meteo = await fakeOpenMeteo(context);
  const user = await criarUsuario('ClimaLonge');
  const { tripId, days, dates } = await viagemNaSerra(user.id, 40);
  await entrar(page, user.email);

  await page.goto(`/viagens/${tripId}/detalhes`);
  const strip = page.locator('[data-weather-strip]');
  await expect(strip.locator(`[data-weather-day="${dates[0]}"] [data-weather-later]`)).toHaveText(
    `previsão a partir de ${dm(dateInSaoPaulo(25))}`,
  );
  await expect(strip.locator('[data-weather-max]')).toHaveCount(0);
  await page.goto(`/viagens/${tripId}/roteiro/${days[0]}`);
  await expect(page.locator('[data-weather-later]')).toHaveText(
    `Previsão do tempo a partir de ${dm(dateInSaoPaulo(25))}`,
  );
  // nada dentro do horizonte: nenhuma chamada
  expect(meteo.count()).toBe(0);
});
