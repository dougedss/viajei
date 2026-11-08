import { expect, test, type Page } from '@playwright/test';
import { dateInSaoPaulo } from './helpers/dates.ts';

const SENHA = 'viajei123';

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
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

/** Uma viagem 30 dias à frente (D33) com duas paradas; devolve a URL da viagem. */
async function viagemComParadas(page: Page): Promise<string> {
  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(`Maquete ${Date.now()}`);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(30));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(31));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripUrl = page.url().replace(/\/detalhes$/, '');
  await page.getByRole('link', { name: 'Editar roteiro' }).click();
  await page
    .getByRole('list', { name: 'Dias da viagem' })
    .getByRole('listitem')
    .first()
    .getByRole('link')
    .click();
  await adicionarParada(page, { tipo: 'Origem', nome: 'Saída de casa', horario: '07:00' });
  await adicionarParada(page, { tipo: 'Natureza', nome: 'Parque', horario: '10:00' });
  return tripUrl;
}

/**
 * O Chromium do Playwright não tem WebGPU utilizável e desenha WebGL2 pelo SwiftShader: a maquete
 * tem de aceitar esse motor. A lista acessível entra no lugar dela pelo botão do topo (fase 14), e
 * "Ver como lista" desliga a maquete neste aparelho até a pessoa querer de volta.
 */
test('a tela da viagem monta a maquete e "Ver como lista" persiste', async ({ page }) => {
  // criar a viagem leva uns 15 s; o SwiftShader compila os shaders da cena devagar
  test.setTimeout(150_000);
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await viagemComParadas(page);

  await page.goto(tripUrl);
  await expect(page.getByRole('heading', { name: 'Agora' })).toBeVisible();
  const maquete = page.locator('[data-world="webgl2"], [data-world="webgpu"]');
  await expect(maquete).toBeVisible({ timeout: 60_000 });
  // o 3D é decorativo: o canvas fica escondido do leitor de tela
  await expect(page.locator('[aria-hidden="true"] canvas')).toHaveCount(1);
  // as pílulas em HTML por cima da cena; tocar numa abre a folha da parada (fase 14). Só os nós em
  // cena têm pílula: a abertura começa larga (o dia inteiro) e desce até o carro (D177), e aí o Parque
  // fica fora da cena. A pílula que fica é a da parada do carro; no SwiftShader um quadro leva
  // centenas de ms e a pílula "estável" por dois quadros do navegador ainda anda com a câmera: espera
  // ela ficar no lugar antes de tocar, como faria uma pessoa
  const hud = page.locator('[data-world-hud]');
  const pilula = hud.getByRole('button', { name: /^Saída de casa/ });
  await expect
    .poll(
      async () => {
        const antes = await pilula.boundingBox();
        await page.waitForTimeout(800);
        const depois = await pilula.boundingBox();
        return (
          antes !== null &&
          depois !== null &&
          Math.abs(antes.x - depois.x) < 1 &&
          Math.abs(antes.y - depois.y) < 1
        );
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  await pilula.click();
  const folha = page.getByRole('dialog', { name: 'Saída de casa' });
  // a maquete segura a thread por segundos na CI: a folha pode demorar a montar
  await expect(folha).toBeVisible({ timeout: 30_000 });
  await expect(folha).toContainText('Origem · Dia 1 · saída');
  await expect(folha.getByRole('link', { name: 'Ver no roteiro' })).toBeVisible();
  await expect(folha.getByRole('button', { name: 'Gasto' })).toBeVisible();
  // a folha desce com animação; no SwiftShader da CI a maquete segura a thread por segundos
  await page.keyboard.press('Escape');
  await expect(folha).toBeHidden({ timeout: 30_000 });

  // a lista do dia não está na tela: entra no lugar da maquete pelo botão do topo
  await expect(page.getByRole('list', { name: 'Trilha do dia' })).toHaveCount(0);

  // "Ver como lista" desliga a maquete e sobrevive a recarregar
  await page.getByRole('button', { name: 'Ver como lista' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Trilha do dia' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Agora' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Trilha do dia' })).toBeVisible();

  // e volta quando a pessoa pede
  await page.getByRole('button', { name: 'Ver a maquete' }).click();
  await expect(maquete).toBeVisible({ timeout: 60_000 });
});

test('?render=list força a lista, sem canvas e sem o botão de alternar', async ({ page }) => {
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await viagemComParadas(page);
  await page.goto(`${tripUrl}?render=list`);
  await expect(page.getByRole('heading', { name: 'Agora' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Trilha do dia' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver a maquete' })).toHaveCount(0);

  // a linha da lista abre a mesma folha da parada
  await page.getByRole('button', { name: 'Saída de casa', exact: true }).click();
  const folha = page.getByRole('dialog', { name: 'Saída de casa' });
  await expect(folha).toBeVisible();
  await expect(folha).toContainText('Origem · Dia 1 · saída');
  await page.keyboard.press('Escape');
  await expect(folha).toBeHidden();
});
