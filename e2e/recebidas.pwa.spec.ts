import { expect, test, type Page } from '@playwright/test';
import { novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir, linhas } from './helpers/db.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';

/**
 * "Reservas recebidas" (fase 18): a reserva que a função de recebimento gravou (aqui, semeada pela
 * API do teste, como a RPC a grava) aparece na lista de viagens e na tela de Reservas; "Pôr nesta
 * viagem" cria a reserva pelos caminhos de hoje e marca a recebida como colocada; a reserva abre sem
 * rede depois de recarregar (o projeto `pwa`). O endereço de e-mail da pessoa aparece em Reservas, com
 * o código que o banco gerou ao nascer o perfil.
 */
async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

test('a recebida aparece, vai para a viagem num toque e abre sem rede; o endereço da pessoa está em Reservas', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const user = await criarUsuario('Recebida');
  const now = new Date().toISOString();
  await inserir('received_reservations', [
    {
      user_id: user.id,
      source_id: `email-${Date.now()}`,
      status: 'received',
      type: 'hotel',
      name: 'Hotel Recebido por E-mail',
      start_at: `${dateInSaoPaulo(30)}T14:00:00-03:00`,
      end_at: `${dateInSaoPaulo(31)}T12:00:00-03:00`,
      confirmation_code: 'RCB-4821',
      amount: 463,
      files: [],
      updated_at: now,
      synced_at: now,
    },
  ]);
  await entrar(page, user.email);

  // a seção na lista de viagens, antes de qualquer viagem existir: "Crie a viagem primeiro"
  const section = page.getByRole('region', { name: 'Reservas recebidas' });
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section.getByRole('article', { name: 'Hotel Recebido por E-mail' })).toBeVisible();
  await expect(section.getByText('Crie a viagem primeiro, e ela entra lá.')).toBeVisible();

  await novaViagem(page, {
    nome: `Recebidas ${Date.now()}`,
    inicio: dateInSaoPaulo(30),
    fim: dateInSaoPaulo(31),
  });
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  const tripId = tripUrl.split('/').at(-1) ?? '';

  // na tela de Reservas da viagem: o endereço com o código do banco, e "Pôr nesta viagem"
  await page.goto(`${tripUrl}/reservas`);
  const address = page.locator('[data-inbox-address]');
  await expect(address).toHaveAttribute(
    'data-inbox-address',
    /^r-[23456789abcdefghjkmnpqrstuvwxyz]{6}@reservas\.reitechia\.com\.br$/,
    { timeout: 20_000 },
  );
  const card = page.getByRole('article', { name: 'Hotel Recebido por E-mail' });
  await expect(card).toContainText('RCB-4821');
  await card.getByRole('button', { name: 'Pôr nesta viagem' }).click();
  await expect(page.getByText('Reserva na viagem')).toBeVisible();
  await expect(card).toHaveCount(0);
  const open = page.getByRole('button', { name: /Hotel Recebido por E-mail/ });
  await expect(open).toBeVisible();

  await expect
    .poll(
      async () =>
        (
          await linhas('reservations', `trip_id=eq.${tripId}&select=name,confirmation_code,amount`)
        ).map((r) => [r.name, r.confirmation_code, r.amount]),
      { timeout: 20_000 },
    )
    .toEqual([['Hotel Recebido por E-mail', 'RCB-4821', 463]]);
  await expect
    .poll(
      async () =>
        (
          await linhas(
            'received_reservations',
            `user_id=eq.${user.id}&select=status,placed_trip_id`,
          )
        ).map((r) => [r.status, r.placed_trip_id]),
      { timeout: 20_000 },
    )
    .toEqual([['placed', tripId]]);

  // sem rede nenhuma: recarrega e a reserva colocada abre do aparelho
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Hotel Recebido por E-mail' });
  await expect(sheet).toBeVisible();
  await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
  await page.reload();
  await expect.poll(() => page.evaluate('navigator.serviceWorker.controller !== null')).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByRole('button', { name: /Código RCB-4821/ })).toBeVisible();
  await context.setOffline(false);
});
