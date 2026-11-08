import { expect, test, type Browser } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';

/**
 * Partiu! e Chegamos! pelo GPS, sempre que o mapa está aberto (fase 14): com a posição permitida, o
 * app acompanha a posição e marca sozinho pelas regras da D47 (ver o carro na parada antes de
 * sair; 3 min dentro do raio para chegar), com o toast de Desfazer, e o Desfazer desfaz. O relógio é
 * o de mentira do Playwright: os 3 min andam por `runFor` (que dispara os timers do caminho e deixa
 * o relógio andando; `fastForward` pausaria o relógio, e o Dexie reexecuta as leituras vivas por um
 * `setTimeout`), e a hora de cada leitura é a de quando ela chega ao app (`Date.now()`), não o
 * carimbo do aparelho. Nenhum e2e usava geolocalização até aqui; o laboratório usa a leitura única
 * (`app_reabrir`).
 */
const CASA = { latitude: -26.371, longitude: -50.144 };
/** uns 2 km ao norte: longe da Casa (saiu) e fora do raio do Parque */
const ESTRADA = { latitude: -26.353, longitude: -50.144 };
const PARQUE = { latitude: -26.31, longitude: -50.144 };
/** 40 m do Parque: dentro do raio de 150 m */
const PARQUE_PERTO = { latitude: -26.31036, longitude: -50.144 };

/** A viagem de hoje: Casa → Parque; com `casaFeita`, a Casa já concluída e deixada há 30 min (na estrada). */
async function viagemDeHoje(
  userId: string,
  { casaFeita = false }: { casaFeita?: boolean } = {},
): Promise<{ tripId: string; nome: string }> {
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const before = new Date(Date.now() - 30 * 60_000).toISOString();
  const today = dateInSaoPaulo(0);
  const nome = `GPS ${String(Date.now())}`;
  await inserir('trips', [
    {
      id: tripId,
      owner_id: userId,
      name: nome,
      start_date: today,
      end_date: today,
      updated_at: now,
    },
  ]);
  const day = uuidV5(tripId, today);
  await inserir('trip_days', [{ id: day, trip_id: tripId, date: today, updated_at: now }]);
  await inserir('stops', [
    {
      id: uuidV4(),
      trip_id: tripId,
      trip_day_id: day,
      position: 'a0',
      kind: 'origin',
      name: 'Casa',
      time: '07:00',
      travel_minutes_to_next: 60,
      lat: CASA.latitude,
      lng: CASA.longitude,
      done_at: casaFeita ? before : null,
      done_by: casaFeita ? userId : null,
      departed_at: casaFeita ? before : null,
      updated_at: now,
    },
    {
      id: uuidV4(),
      trip_id: tripId,
      trip_day_id: day,
      position: 'a1',
      kind: 'nature',
      name: 'Parque',
      time: '10:00',
      travel_minutes_to_next: null,
      lat: PARQUE.latitude,
      lng: PARQUE.longitude,
      updated_at: now,
    },
  ]);
  return { tripId, nome };
}

test('com o mapa aberto, a posição marca Partiu! e Chegamos! sozinha, com Desfazer', async ({
  browser,
}: {
  browser: Browser;
}) => {
  test.setTimeout(120_000);
  const user = await criarUsuario('Gps');
  await viagemDeHoje(user.id);
  const context = await browser.newContext({
    ...test.info().project.use,
    geolocation: CASA,
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  // a lista no lugar da maquete: o GPS é da tela, não da maquete
  await page.addInitScript(() => localStorage.setItem('viajei:world:render', 'list'));
  await page.clock.install();

  await test.step('entra e permite a posição pela frase do app', async () => {
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    // com uma viagem de hoje, `/` cai direto na tela da viagem (D33)
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Casa').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Usar posição' }).click();
    // a posição passa a ser acompanhada: o ponto "GPS" na barra do "Agora", e a primeira leitura
    // (a da Casa) chega antes de o carro sair; sem ela, a regra não teria visto o carro na parada
    await expect(page.locator('[data-gps]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-gps][data-fix-at]')).toBeAttached({ timeout: 15_000 });
  });

  await test.step('vê o carro na Casa e sai: Partiu! sozinho', async () => {
    // a primeira leitura já veio da Casa; a segunda, 1 min depois, a 2 km: saiu
    await page.clock.runFor('01:00');
    await context.setGeolocation(ESTRADA);
    await expect(page.getByText('Saímos: Casa', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Desfazer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chegamos!' })).toBeVisible();
    // a saída é a do GPS, não do toque: nada de "+10" na tela
    await expect(page.locator('[data-xp-gain]')).toHaveCount(0);
  });

  await test.step('3 min dentro do raio do Parque: Chegamos! sozinho, e o Desfazer desfaz', async () => {
    await page.clock.runFor('01:00');
    await context.setGeolocation(PARQUE);
    await page.clock.runFor('01:30');
    await context.setGeolocation(PARQUE_PERTO);
    // ainda não: a presença tem de durar 3 min
    await expect(page.getByText('Chegamos: Parque', { exact: true })).toHaveCount(0);
    await page.clock.runFor('01:40');
    await context.setGeolocation(PARQUE);
    // uma chegada só, mesmo com várias leituras dentro do raio (a regra não repete em 10 min)
    await expect(page.getByText('Chegamos: Parque', { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Chegamos: Parque', { exact: true })).toHaveCount(1);
    // a chegada pela posição vira o card "Como foi?", sem abrir a folha (D83)
    await expect(page.getByRole('region', { name: 'Como foi Parque?' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Como foi Parque?' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Agora' })).toContainText('Dia concluído');

    await page.getByRole('button', { name: 'Desfazer' }).last().click();
    await expect(page.getByRole('button', { name: 'Chegamos!' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('region', { name: 'Agora' })).not.toContainText('Dia concluído');
  });

  await context.close();
});

test('ao reabrir no destino, "Usar posição" marca Chegamos! na hora, pela leitura única', async ({
  browser,
}: {
  browser: Browser;
}) => {
  test.setTimeout(90_000);
  const user = await criarUsuario('Gps');
  // na estrada: a Casa concluída e deixada; o carro (o celular) já está no Parque
  await viagemDeHoje(user.id, { casaFeita: true });
  const context = await browser.newContext({
    ...test.info().project.use,
    geolocation: PARQUE,
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('viajei:world:render', 'list'));

  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: 'Chegamos!' })).toBeVisible({ timeout: 15_000 });

  // a leitura única ao permitir (o catch-up): no raio do Parque, Chegamos! na hora, com Desfazer; a
  // presença de 3 min é do acompanhamento, que começa junto e não precisa esperar aqui
  await page.getByRole('button', { name: 'Usar posição' }).click();
  await expect(page.locator('[data-gps][data-read-at]')).toBeAttached({ timeout: 15_000 });
  await expect(page.getByText('Chegamos: Parque', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Desfazer' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Como foi Parque?' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Como foi Parque?' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Agora' })).toContainText('Dia concluído');

  await context.close();
});
