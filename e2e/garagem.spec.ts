import { expect, test, type Page } from '@playwright/test';
import { novaViagem as pelaLista } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir, linhas } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { criarUsuario, criarUsuarioDescartavel } from './helpers/users.ts';

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
  const url = await pelaLista(page, { nome, inicio: 30, fim: 31 });
  return { url, nome };
}

const swatch = (page: Page, nome: string) =>
  page.getByRole('region', { name: 'Pintura' }).getByRole('button', { name: nome, exact: true });

/**
 * O Chromium do Playwright desenha WebGL2 pelo SwiftShader: a garagem tem de abrir nesse motor. A
 * cor escolhida grava no perfil pela outbox e volta depois de recarregar, no palco e no card da
 * viagem. Os modelos são livres; o perolado (nível 3) só abre a prévia (fase 16).
 */
test('a garagem abre em 3D, a cor persiste e aparece no card; o modelo é livre e o perolado, só prévia', async ({
  page,
}) => {
  // o SwiftShader compila os shaders do estúdio devagar
  test.setTimeout(150_000);
  // o carro é da pessoa (fase 16): uma pessoa nova por execução, para a cor de uma não valer na outra
  await entrar(page, await criarUsuarioDescartavel('Garagem'));
  const { url, nome } = await novaViagem(page);

  // o topo da visão geral leva à garagem, que é do perfil (fase 16)
  await page.getByRole('link', { name: /^Garagem: Hatch Pôr do sol/ }).click();
  await expect(page).toHaveURL(/\/perfil\/garagem$/);
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

  // a garagem antiga redireciona, com a query, e o "voltar" leva de volta à viagem
  await page.goto(`${url}/detalhes`);
  await page.goto(`${url}/garagem?render=list`);
  await expect(page).toHaveURL(/\/perfil\/garagem\?render=list$/);
  const palco = page.locator('[data-garage="svg"]');
  await expect(palco).toBeVisible();
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(`${url}/detalhes`);
  await page.goto(`${url}/garagem?render=list`);
  await expect(palco).toBeVisible();

  // os cinco modelos são livres (fase 16): trocar grava
  const modelo = page.getByRole('region', { name: 'Modelo' });
  await modelo.getByRole('button', { name: 'SUV' }).click();
  await expect(palco.locator('svg[data-car-model="suv"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prévia' })).toHaveCount(0);

  // a prévia de um acabamento bloqueado: mostra, diz o que falta, não grava
  const acabamento = page.getByRole('region', { name: 'Acabamento' });
  const perolada = acabamento.getByRole('button', { name: 'Perolada' });
  // o nome é o que está escrito no botão; o que falta para liberar vem na descrição
  await expect(perolada).toHaveAccessibleDescription(
    'Tinta perolada: no nível 3 (Explorador). Toque para ver a prévia',
  );
  await perolada.click();
  await expect(page.getByRole('region', { name: 'Prévia' })).toContainText(
    'Tinta perolada: no nível 3 (Explorador)',
  );
  await expect(palco.locator('svg[data-car-finish="pearl"]')).toBeVisible();
  await page.getByRole('button', { name: 'Voltar ao seu carro' }).click();
  await expect(palco.locator('svg[data-car-model="suv"][data-car-finish="solid"]')).toBeVisible();

  await perolada.click();
  await page.reload();
  await expect(
    palco.locator('svg[data-car-model="suv"][data-car-color="sky"][data-car-finish="solid"]'),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Prévia' })).toHaveCount(0);
  // o seu carro de verdade: trancado, com o que falta e o que ele é, e nada a escolher
  const seuCarro = page.getByRole('region', { name: /O seu carro/ });
  await expect(seuCarro).toHaveAttribute('data-own-car', 'trancado');
  await expect(seuCarro).toContainText('No nível 5 (Lenda da Estrada)');
  await expect(seuCarro).toContainText('chega numa versão futura do Viajei');
  await expect(seuCarro.getByRole('button')).toHaveCount(0);
});

/**
 * A escada da fase 16 e o carro que é da pessoa: com 170 XP dela (o nível 2), o metálico e a roda de
 * cinco raios ficam livres e gravam no perfil; o mesmo carro aparece no card das duas viagens dela.
 * Sem 3D (a lista), para medir as regras, não o SwiftShader.
 */
test('o progresso da pessoa libera o metálico e a roda de cinco raios; o mesmo carro nas duas viagens', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await criarUsuario('Escada');
  const viagens = [uuidV4(), uuidV4()];
  const now = new Date().toISOString();
  await inserir(
    'trips',
    viagens.map((id, i) => ({
      id,
      owner_id: user.id,
      name: `Escada ${String(i + 1)} ${String(Date.now())}`,
      start_date: dateInSaoPaulo(20 + i * 10),
      end_date: dateInSaoPaulo(21 + i * 10),
      updated_at: now,
    })),
  );
  await entrar(page, user.email);
  await page.goto('/perfil/garagem?render=list');
  const palco = page.locator('[data-garage="svg"]');
  await expect(palco).toBeVisible();

  // o modelo é livre: a kombi deixou de ser prêmio
  await page.getByRole('region', { name: 'Modelo' }).getByRole('button', { name: 'Kombi' }).click();
  await expect
    .poll(async () => (await linhas('profiles', `id=eq.${user.id}&select=car_model`))[0]?.car_model)
    .toBe('kombi');

  // nível 1: o metálico e a roda de cinco raios estão trancados
  const metalica = page.getByRole('region', { name: 'Acabamento' }).getByRole('button', {
    name: 'Metálica',
  });
  const cinco = page.getByRole('region', { name: 'Rodas' }).getByRole('button', {
    name: 'Cinco raios',
  });
  await expect(metalica).toHaveAttribute('data-state', 'locked');
  await expect(cinco).toHaveAttribute('data-state', 'locked');

  // 170 XP da pessoa (a viagem concluída, as duas listas e uma missão), gravados no servidor
  const [trip] = viagens;
  const xp = (kind: string, ref: string, points: number) => ({
    id: uuidV5(user.id, `${kind}:${ref}`),
    user_id: user.id,
    trip_id: trip,
    kind,
    ref_id: ref,
    points,
  });
  await inserir('xp_events', [
    xp('trip_completed', String(trip), 100),
    xp('checklist_complete', `${String(trip)}:before`, 20),
    xp('checklist_complete', `${String(trip)}:pack`, 20),
    xp('quest_done', uuidV4(), 30),
  ]);
  await page.reload();
  await expect(metalica).toHaveAttribute('data-state', 'available', { timeout: 30_000 });
  await expect(cinco).toHaveAttribute('data-state', 'available');
  // o nível 3 continua trancado
  await expect(
    page.getByRole('region', { name: 'Acabamento' }).getByRole('button', { name: 'Perolada' }),
  ).toHaveAttribute('data-state', 'locked');

  await metalica.click();
  await cinco.click();
  await expect(
    palco.locator(
      'svg[data-car-model="kombi"][data-car-finish="metallic"][data-car-wheels="five"]',
    ),
  ).toBeVisible();
  await expect(palco.locator('[data-wheel-style="five"] [data-spoke]')).toHaveCount(10);
  await expect
    .poll(
      async () =>
        (await linhas('profiles', `id=eq.${user.id}&select=car_finish,car_wheels`))[0] ?? null,
      { timeout: 15_000 },
    )
    .toEqual({ car_finish: 'metallic', car_wheels: 'five' });

  // o carro é da pessoa: o mesmo no card das duas viagens
  await page.goto('/');
  await expect(
    page.locator('svg[data-car-model="kombi"][data-car-finish="metallic"][data-car-wheels="five"]'),
  ).toHaveCount(2);
});
