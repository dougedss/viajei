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

/** Uma viagem 30 dias à frente (D33); devolve a URL e o nome. */
async function novaViagem(page: Page): Promise<{ url: string; nome: string }> {
  const nome = `Garagem ${Date.now()}`;
  await page.goto('/viagens/nova');
  await page.getByLabel('Nome da viagem').fill(nome);
  await page.getByRole('textbox', { name: 'Início' }).fill(dateInSaoPaulo(30));
  await page.getByRole('textbox', { name: 'Fim' }).fill(dateInSaoPaulo(31));
  await page.getByRole('button', { name: 'Criar viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  return { url: page.url().replace(/\/detalhes$/, ''), nome };
}

const swatch = (page: Page, nome: string) =>
  page.getByRole('region', { name: 'Pintura' }).getByRole('button', { name: nome, exact: true });

/**
 * O Chromium do Playwright desenha WebGL2 pelo SwiftShader: a garagem tem de abrir nesse motor. A
 * cor escolhida grava pela outbox e volta depois de recarregar, no palco e no card da viagem. O
 * SUV (nível 3) só abre a prévia: a viagem continua com o hatch.
 */
test('a garagem abre em 3D, a cor persiste e aparece no card, e o SUV é só prévia', async ({
  page,
}) => {
  // o SwiftShader compila os shaders do estúdio devagar
  test.setTimeout(150_000);
  await entrar(page, 'dono@viajei.local');
  const { url, nome } = await novaViagem(page);

  // o topo da visão geral leva à garagem
  await page.getByRole('link', { name: /^Garagem: Hatch Pôr do sol/ }).click();
  await expect(page).toHaveURL(`${url}/garagem`);
  await expect(page.getByRole('heading', { name: 'Garagem' })).toBeVisible();
  await expect(page.locator('[data-garage="webgl2"], [data-garage="webgpu"]')).toBeVisible({
    timeout: 60_000,
  });
  // o motor é escolhido antes de os shaders compilarem; no SwiftShader da CI a compilação segura a
  // tela por segundos e o toque seria atendido depois do prazo da asserção: espera o primeiro quadro
  await expect(page.locator('[data-garage] [data-frame="ready"]')).toBeAttached({
    timeout: 90_000,
  });

  // no SwiftShader da CI, depois do primeiro quadro ainda há passes de sombra e reflexo compilando
  // e a linha de cores rola com snap: o toque pode chegar tarde ou cair na vizinha. Toca de novo até
  // pegar (tocar em "Céu" com "Céu" já escolhida não muda nada)
  await expect(async () => {
    await swatch(page, 'Céu').click();
    await expect(swatch(page, 'Céu')).toHaveAttribute('aria-pressed', 'true', { timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  await page.reload();
  await expect(swatch(page, 'Céu')).toHaveAttribute('aria-pressed', 'true');

  // o card da viagem desenha o mesmo carro, de lado
  await page.goto('/');
  const card = page.getByRole('link', { name: nome });
  await expect(card.locator('svg[data-car-model="hatch"][data-car-color="sky"]')).toBeVisible();

  // a prévia de um modelo bloqueado: mostra, diz o que falta, não grava
  await page.goto(`${url}/garagem?render=list`);
  const palco = page.locator('[data-garage="svg"]');
  await expect(palco).toBeVisible();
  // o nome é o que está escrito no botão; o que falta para liberar vem na descrição
  const suv = page.getByRole('region', { name: 'Modelo' }).getByRole('button', { name: 'SUV' });
  await expect(suv).toHaveAccessibleDescription(
    'SUV: no nível 3 (Explorador). Toque para ver a prévia',
  );
  await suv.click();
  await expect(page.getByRole('region', { name: 'Prévia' })).toContainText(
    'SUV: no nível 3 (Explorador)',
  );
  await expect(palco.locator('svg[data-car-model="suv"]')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao carro da viagem' }).click();
  await expect(palco.locator('svg[data-car-model="hatch"]')).toBeVisible();

  await suv.click();
  await page.reload();
  await expect(palco.locator('svg[data-car-model="hatch"][data-car-color="sky"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prévia' })).toHaveCount(0);
});
