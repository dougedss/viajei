import { expect, test, type Page } from '@playwright/test';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { entrar } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { criarUsuario } from './helpers/users.ts';

/**
 * O Perfil em seções (fase 16): Você, O seu carro, Progresso, Avisos neste aparelho, Aparência e
 * Dados (o Laboratório só para quem o tem; "O que você gosta" não aparece até a fase 17). Os padrões
 * dos avisos chegam à viagem nova; a permissão e os sons saem de Avisos da viagem, que aponta para
 * cá; o tema escuro sobrevive a recarregar sem piscar; nada rola para o lado a 393 e a 360 px.
 */
async function semRolagem(page: Page, onde: string): Promise<void> {
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde}: rolagem lateral`).toEqual([]);
  const size = page.viewportSize();
  if (!size) return;
  await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde} a 360 px`).toEqual([]);
  await page.setViewportSize(size);
}

const titulos = (page: Page) => page.locator('h2').allInnerTexts();

/**
 * O primeiro estado do documento, antes de qualquer script do app (o `interactive` vem antes dos
 * módulos): o que o script do index.html aplicou, o tema e a cor da barra.
 */
const PRIMEIRO_ESTADO = `document.addEventListener('readystatechange', () => {
  if (document.readyState !== 'interactive') return;
  window.primeiro = {
    tema: document.documentElement.dataset.theme ?? null,
    barra: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute('content')),
  };
});`;

test('o perfil em seções, o carro, os padrões dos avisos numa viagem nova e o link de Avisos', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await criarUsuario('Perfil');
  await entrar(page, user.email);
  await page.goto('/perfil');
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();

  // as seções, nesta ordem, e nenhuma vazia ("O que você gosta" só na fase 17)
  await expect
    .poll(async () => (await titulos(page)).map((t) => t.trim().toLowerCase()))
    .toEqual(['você', 'o seu carro', 'progresso', 'avisos neste aparelho', 'aparência', 'dados']);
  await expect(page.getByText('O que você gosta')).toHaveCount(0);
  await semRolagem(page, '/perfil');

  // o seu carro: a vista lateral e a entrada da garagem, que volta para cá
  const carro = page.getByRole('region', { name: 'O seu carro' });
  await expect(carro.locator('svg[data-car-model="hatch"]')).toBeVisible();
  await carro.getByRole('link', { name: 'Abrir a garagem' }).click();
  await expect(page).toHaveURL(/\/perfil\/garagem$/);
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(/\/perfil$/);

  // avisos neste aparelho: os sons e os cartões, e os padrões das viagens novas no perfil
  const avisos = page.getByRole('region', { name: 'Avisos neste aparelho' });
  await expect(avisos.getByRole('switch', { name: /Sons do Modo Viagem/ })).toBeVisible();
  await expect(avisos.getByRole('switch', { name: /Cartões de conquista/ })).toBeVisible();
  await avisos.getByRole('radio', { name: '30 min' }).click();
  await expect(avisos.getByRole('radio', { name: '30 min' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await avisos.getByLabel('Briefing da manhã às').fill('06:30');
  await expect
    .poll(
      async () =>
        (
          await linhas(
            'profiles',
            `id=eq.${user.id}&select=notify_lead_minutes,notify_morning_time`,
          )
        )[0] ?? null,
      { timeout: 15_000 },
    )
    .toEqual({ notify_lead_minutes: 30, notify_morning_time: '06:30:00' });

  // uma viagem nova nasce com esses avisos
  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`Padrões ${String(Date.now())}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(30));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(31));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await page.goto(`/viagens/${tripId}/avisos`);
  await expect(page.getByRole('radio', { name: '30 min' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByLabel('Briefing da manhã às')).toHaveValue('06:30');
  await expect
    .poll(
      async () =>
        (
          await linhas(
            'notification_prefs',
            `trip_id=eq.${tripId}&select=lead_minutes,morning_time`,
          )
        )[0] ?? null,
      { timeout: 15_000 },
    )
    .toEqual({ lead_minutes: 30, morning_time: '06:30:00' });

  // a permissão e os sons saíram de Avisos da viagem: lá fica o caminho para o Perfil
  await expect(page.getByRole('switch', { name: /Sons do Modo Viagem/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Avisos neste aparelho' }).click();
  await expect(page).toHaveURL(/\/perfil#h-avisos-aparelho$/);
  await expect(page.getByRole('region', { name: 'Avisos neste aparelho' })).toBeVisible();
});

test('o tema escuro escolhido sobrevive a recarregar, sem piscar, e o do sistema volta', async ({
  page,
}) => {
  const user = await criarUsuario('Tema');
  // o primeiro estado do documento, antes de qualquer script do app (o `interactive` vem antes dos
  // módulos): o que o script do index.html aplicou. A folha de estilos bloqueia a primeira pintura,
  // e o `data-theme` já está lá quando ela pinta
  await page.addInitScript({ content: PRIMEIRO_ESTADO });
  await entrar(page, user.email);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/perfil');
  const aparencia = page.getByRole('region', { name: 'Aparência' });
  await expect(aparencia.getByRole('radio', { name: 'Do sistema' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await aparencia.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await semRolagem(page, '/perfil no escuro');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();
  // antes do app: já escuro, com a barra do navegador escura
  expect(await page.evaluate<unknown>('window.primeiro')).toEqual({
    tema: 'dark',
    barra: ['#111722', '#111722'],
  });
  // e o papel pintado é o escuro
  expect(
    await page.evaluate<string>(
      "getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()",
    ),
  ).toBe('#111722');
  await expect(aparencia.getByRole('radio', { name: 'Escuro' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // a garagem força o escuro do estúdio e, ao sair, devolve o escolhido
  await page.goto('/perfil/garagem?render=list');
  await expect(page.locator('[data-garage="svg"]')).toBeVisible();
  await semRolagem(page, '/perfil/garagem no escuro');
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // o do sistema: sem data-theme, e o claro do sistema volta
  await aparencia.getByRole('radio', { name: 'Do sistema' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil', level: 1 })).toBeVisible();
  expect(await page.evaluate<unknown>('window.primeiro')).toEqual({
    tema: null,
    barra: ['#F4F4F2', '#111722'],
  });
});
