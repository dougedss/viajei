import { expect, test, type Page } from '@playwright/test';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { viagemNaSerra } from './helpers/world.ts';

/**
 * A tela da viagem sem rolagem (fase 14): a maquete inteira na tela, a barra do dia no alto, o
 * "Agora" compacto e "Detalhes" sobre ela. Nada rola na página, com a lista e com a maquete, a 393
 * e a 360 px; "Hoje" volta ao dia de hoje; a ação principal e "Detalhes" estão visíveis e são o que
 * o dedo encontra (`elementFromPoint`, D168).
 */
const SEM_ROLAGEM = `(() => {
  const h = window.innerHeight;
  const doc = document.documentElement;
  const out = [];
  if (doc.scrollHeight > h + 1) out.push('documento com ' + doc.scrollHeight + ' px em ' + h + ' px');
  if (document.body.scrollHeight > h + 1) out.push('body com ' + document.body.scrollHeight + ' px em ' + h + ' px');
  if (doc.scrollTop > 0 || window.scrollY > 0) out.push('a página rolou ' + window.scrollY + ' px');
  return out;
})()`;

/** O elemento no centro de um alvo é ele mesmo (ou um filho): nada o cobre. */
const SOB_O_DEDO = (selector: string) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'não achei';
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit) return 'fora da janela';
  return el.contains(hit) ? '' : 'coberto por ' + hit.tagName.toLowerCase();
})()`;

async function semRolagem(page: Page, onde: string) {
  expect(await page.evaluate<string[]>(SEM_ROLAGEM), `${onde}: rolagem vertical`).toEqual([]);
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde}: rolagem lateral`).toEqual([]);
}

test('a tela da viagem não rola, "Hoje" volta, e a ação e Detalhes ficam sob o dedo', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const user = await criarUsuario('Tela');
  // a viagem de hoje (dois dias): o "Agora" tem Partiu! e as setas têm para onde ir
  const { tripId } = await viagemNaSerra(user.id, 0);
  // com uma viagem de hoje, entrar cai direto na tela da viagem (D33), não na lista
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });

  await test.step('com a lista: nada rola, a 393 e a 360 px', async () => {
    await page.goto(`/viagens/${tripId}?render=list`);
    const agora = page.getByRole('region', { name: 'Agora' });
    await expect(agora).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('list', { name: 'Trilha do dia' })).toBeVisible();
    await semRolagem(page, 'lista a 393 px');
    const size = page.viewportSize();
    if (size) {
      await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
      await semRolagem(page, 'lista a 360 px');
      await page.setViewportSize(size);
    }
  });

  await test.step('a ação principal e "Detalhes" estão visíveis e são o que o dedo encontra', async () => {
    const partiu = page.getByRole('button', { name: 'Partiu!' });
    await expect(partiu).toBeVisible();
    await expect(page.getByRole('link', { name: 'Detalhes' })).toBeVisible();
    await expect
      .poll(() => page.evaluate<string>(SOB_O_DEDO('[data-now-bar] button.min-h-14')))
      .toBe('');
    await expect.poll(() => page.evaluate<string>(SOB_O_DEDO('[data-detalhes]'))).toBe('');
  });

  await test.step('"Hoje" aparece ao sair do dia de hoje e volta a ele', async () => {
    const label = page.locator('[data-day-label]');
    const hoje = await label.textContent();
    await expect(page.getByRole('button', { name: 'Hoje' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Dia seguinte' }).click();
    await expect(label).not.toHaveText(hoje ?? '');
    await expect(label).toContainText('Dia 2');
    await page.getByRole('button', { name: 'Hoje' }).click();
    await expect(label).toHaveText(hoje ?? '');
    await expect(page.getByRole('button', { name: 'Hoje' })).toHaveCount(0);
  });

  await test.step('com a maquete: nada rola', async () => {
    // o SwiftShader compila os shaders da cena devagar
    await page.goto(`/viagens/${tripId}`);
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-world="webgl2"], [data-world="webgpu"]')).toBeVisible({
      timeout: 60_000,
    });
    await semRolagem(page, 'maquete a 393 px');
    const size = page.viewportSize();
    if (size) {
      await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
      await semRolagem(page, 'maquete a 360 px');
      await page.setViewportSize(size);
    }
    // o cabeçalho do app não está nesta tela: ela é inteira
    await expect(page.getByRole('link', { name: 'Viajei, início' })).toHaveCount(0);
  });
});
