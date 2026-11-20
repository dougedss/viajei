import { expect, test, type Page } from '@playwright/test';
import { novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { atualizar, inserir } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { criarUsuario } from './helpers/users.ts';
import { ESTUFA_CURITIBA } from '../src/art/landmarks/samples/estufa-curitiba.ts';

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
  // pelo campo da lista, no formato do Viajei (fase 17)
  await novaViagem(page, {
    nome: `Maquete ${Date.now()}`,
    inicio: dateInSaoPaulo(30),
    fim: dateInSaoPaulo(31),
  });
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
 * O cartão-postal semeado (fase 23): o Parque ganha uma coordenada (a chave do lugar nasce dela) e o
 * catálogo do servidor ganha a estufa escrita à mão, publicada, apontando para essa chave, pela API
 * do teste (o que o gerador faria). A maquete deve montá-la no lugar da miniatura do tipo.
 */
async function semearCartaoPostal(tripId: string): Promise<void> {
  const landmarkId = uuidV4();
  await atualizar('stops', `trip_id=eq.${tripId}&name=eq.Parque`, {
    lat: -25.4428,
    lng: -49.2392,
    updated_at: new Date().toISOString(),
  });
  await inserir('landmarks', [
    {
      id: landmarkId,
      key: `lab:e2e-${landmarkId.slice(0, 8)}`,
      name: 'Estufa do teste',
      recipe: ESTUFA_CURITIBA,
      version: 1,
      status: 'published',
      generations: 1,
      published_at: new Date().toISOString(),
      sources: { lab: true },
    },
  ]);
  await inserir('landmark_places', [
    {
      place_key: 'geo:parque@-25.443,-49.239',
      kind: 'stop',
      landmark_id: landmarkId,
      status: 'linked',
    },
  ]);
}

/** A âncora do carro, em px do palco: o HUD a põe onde o carro está, pelo laço da cena. */
const ANCORA_DO_CARRO = `(() => {
  const el = document.querySelector('[data-world-car-anchor]');
  if (!el) return null;
  return { left: parseFloat(el.style.left), top: parseFloat(el.style.top), visible: el.dataset.visible };
})()`;

/** Onde o carro está na tela, em coordenadas da página. */
async function posicaoDoCarro(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-world-hud]').boundingBox();
  const at = await page.evaluate<{ left: number; top: number; visible: string } | null>(
    ANCORA_DO_CARRO,
  );
  if (!box || !at) throw new Error('sem a âncora do carro');
  if (at.visible !== 'true') throw new Error('o carro não está em cena');
  return { x: box.x + at.left, y: box.y + at.top };
}

/**
 * O Chromium do Playwright não tem WebGPU utilizável e desenha WebGL2 pelo SwiftShader: a maquete
 * tem de aceitar esse motor. A lista acessível entra no lugar dela pelo botão do topo (fase 14), e
 * "Ver como lista" desliga a maquete neste aparelho até a pessoa querer de volta. Fase 22: o quadro
 * de repouso é o dia inteiro, com uma pílula por parada em cena (a do Parque inclusive); o toque no
 * carro leva para perto e a câmera volta sozinha; `?noite=1` mostra a maquete de noite.
 */
test('a tela da viagem monta a maquete do dia inteiro, o toque no carro aproxima, e "Ver como lista" persiste', async ({
  page,
}) => {
  // criar a viagem leva uns 15 s; o SwiftShader compila os shaders da cena devagar
  test.setTimeout(240_000);
  await entrar(page, 'dono@viajei.local');
  const tripUrl = await viagemComParadas(page);
  await semearCartaoPostal(tripUrl.split('/').pop() ?? '');
  // a coordenada do Parque chega pelo sync ao abrir; o catálogo, pelo pedido que a maquete faz
  await page.goto('/viagens');
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();

  await page.goto(tripUrl);
  await expect(page.getByRole('heading', { name: 'Agora' })).toBeVisible();
  const maquete = page.locator('[data-world="webgl2"], [data-world="webgpu"]');
  await expect(maquete).toBeVisible({ timeout: 60_000 });
  // o cartão-postal semeado toma o lugar da miniatura do tipo (fase 23): a peça montada conta no palco
  await expect(maquete).toHaveAttribute('data-world-landmarks', '1', { timeout: 60_000 });
  // o 3D é decorativo: o canvas fica escondido do leitor de tela
  await expect(page.locator('[aria-hidden="true"] canvas')).toHaveCount(1);
  // o dia inteiro na tela (fase 22): depois da abertura, uma pílula por parada em cena, a do Parque
  // inclusive (na fase 14 ela saía de cena quando a câmera descia até o carro); a câmera em repouso
  const hud = page.locator('[data-world-hud]');
  await expect(page.locator('[data-pill][data-placed]').first()).toBeAttached({ timeout: 60_000 });
  await expect
    .poll(() => page.locator('[data-pill]:not([hidden])').count(), { timeout: 60_000 })
    .toBe(2);
  await expect(hud.getByRole('button', { name: /^Parque/ })).toBeVisible();
  await expect(hud.getByRole('button', { name: /^Saída de casa/ })).toBeVisible();
  await expect(maquete).toHaveAttribute('data-world-camera', 'repouso');
  // os nomes das cidades de passagem (se houver) ficam fora da árvore de acessibilidade e sem toque
  await expect(page.locator('[data-passing-place]:not([aria-hidden="true"])')).toHaveCount(0);
  await expect(page.locator('[data-passing-place] button, [data-passing-place] a')).toHaveCount(0);

  // tocar no carro (pela âncora que o HUD põe onde ele está) leva para perto; a câmera volta sozinha
  // ao dia inteiro alguns segundos depois (o relógio de verdade: no SwiftShader cada quadro leva
  // centenas de ms, e o laço continua vivo enquanto o modo dura)
  await expect(async () => {
    const at = await posicaoDoCarro(page);
    await page.mouse.click(at.x, at.y);
    await expect(maquete).toHaveAttribute('data-world-camera', 'perto', { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  // a imagem chega perto antes de voltar: o atributo de assentada só depois do quadro apresentado
  // (a captura de perto do laboratório espera os dois, D224), e os 6 s do modo contam da chegada da
  // câmera, então mesmo no SwiftShader ela assenta perto antes de voltar
  await expect(maquete).toHaveAttribute('data-world-camera-settled', 'true', { timeout: 30_000 });
  await expect(maquete).toHaveAttribute('data-world-camera', 'perto');
  await expect(maquete).toHaveAttribute('data-world-camera', 'repouso', { timeout: 40_000 });
  await expect(maquete).toHaveAttribute('data-world-camera-settled', 'true', { timeout: 40_000 });
  // um toque de novo no carro e um toque fora dele: volta na hora
  await expect(async () => {
    const at = await posicaoDoCarro(page);
    await page.mouse.click(at.x, at.y);
    await expect(maquete).toHaveAttribute('data-world-camera', 'perto', { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  const palco = await maquete.boundingBox();
  if (!palco) throw new Error('sem o palco');
  await page.mouse.click(palco.x + 30, palco.y + palco.height * 0.45);
  await expect(maquete).toHaveAttribute('data-world-camera', 'repouso', { timeout: 20_000 });

  // as pílulas em HTML por cima da cena; tocar numa abre a folha da parada (fase 14). No SwiftShader
  // da CI um quadro leva centenas de ms e a maquete segura a thread por segundos, e a folha demora a
  // montar: toca de novo até a folha abrir, como faria uma pessoa (com a folha aberta, o toque
  // seguinte nem chega à pílula)
  const pilula = hud.getByRole('button', { name: /^Parque/ });
  const folha = page.getByRole('dialog', { name: 'Parque' });
  await expect(async () => {
    if (!(await folha.isVisible())) await pilula.click({ timeout: 10_000 });
    await expect(folha).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 60_000 });
  await expect(folha).toContainText('Natureza · Dia 1 · 2ª parada');
  await expect(folha.getByRole('link', { name: 'Ver no roteiro' })).toBeVisible();
  await expect(folha.getByRole('button', { name: 'Gasto' })).toBeVisible();
  // a folha desce com animação; no SwiftShader da CI a maquete segura a thread por segundos
  await page.keyboard.press('Escape');
  await expect(folha).toBeHidden({ timeout: 30_000 });

  // a noite pela chave da URL (sem gravar nada): a maquete monta e todas as pílulas continuam em cena
  await page.goto(`${tripUrl}?noite=1`);
  await expect(maquete).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-pill][data-placed]').first()).toBeAttached({ timeout: 60_000 });
  await expect
    .poll(() => page.locator('[data-pill]:not([hidden])').count(), { timeout: 60_000 })
    .toBe(2);
  // a peça do lugar também à noite (as janelas e a poça acendem por emissão, como as do tipo)
  await expect(maquete).toHaveAttribute('data-world-landmarks', '1', { timeout: 60_000 });
  await page.waitForTimeout(2_000);
  await test.info().attach('maquete-noite', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // a câmera da peça pela chave da URL (fase 23, a captura do laboratório): a maquete monta e a
  // câmera assenta no close do cartão-postal, mesmo sem pílula em cena
  await page.goto(`${tripUrl}?peca=1`);
  await expect(maquete).toBeVisible({ timeout: 60_000 });
  await expect(maquete).toHaveAttribute('data-world-landmarks', '1', { timeout: 60_000 });
  await expect(maquete).toHaveAttribute('data-world-camera-settled', 'true', { timeout: 90_000 });
  await test.info().attach('maquete-peca', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.goto(tripUrl);
  await expect(maquete).toBeVisible({ timeout: 60_000 });

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

/**
 * O carro é da pessoa (fase 16): a picape Uva perolada de rodas raiadas da pessoa é a mesma na
 * maquete de duas viagens diferentes de hoje. O carro mora no perfil, e a viagem não tem carro.
 */
test('o carro da pessoa é o mesmo na maquete de duas viagens diferentes', async ({ page }) => {
  test.setTimeout(240_000);
  const user = await criarUsuario('Maquete');
  const now = new Date().toISOString();
  await atualizar('profiles', `id=eq.${user.id}`, {
    car_model: 'pickup',
    car_color: 'grape',
    car_finish: 'pearl',
    car_wheels: 'wire',
    updated_at: now,
  });
  const today = dateInSaoPaulo(0);
  const viagens = [uuidV4(), uuidV4()];
  await inserir(
    'trips',
    viagens.map((id, i) => ({
      id,
      owner_id: user.id,
      name: `Carro ${String(i + 1)} ${String(Date.now())}`,
      start_date: today,
      end_date: today,
      updated_at: now,
    })),
  );
  await inserir(
    'trip_days',
    viagens.map((trip) => ({
      id: uuidV5(trip, today),
      trip_id: trip,
      date: today,
      updated_at: now,
    })),
  );
  await inserir(
    'stops',
    viagens.flatMap((trip) =>
      ['Saída de casa', 'Parque'].map((name, i) => ({
        id: uuidV4(),
        trip_id: trip,
        trip_day_id: uuidV5(trip, today),
        position: `a${String(i)}`,
        kind: i === 0 ? 'origin' : 'nature',
        name,
        time: i === 0 ? '07:00' : '18:00',
        travel_minutes_to_next: null,
        updated_at: now,
      })),
    ),
  );
  // com viagem de hoje, o "/" cai na tela da viagem assim que o primeiro sync a traz (D33): depois
  // de entrar, vale qualquer uma das duas telas
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(
    page
      .getByRole('heading', { name: 'Suas viagens' })
      .or(page.getByRole('region', { name: 'Agora' })),
  ).toBeVisible({ timeout: 20_000 });
  for (const trip of viagens) {
    await page.goto(`/viagens/${trip}`);
    const maquete = page.locator('[data-world="webgl2"], [data-world="webgpu"]');
    await expect(maquete).toBeVisible({ timeout: 60_000 });
    await expect(maquete).toHaveAttribute('data-world-car', 'pickup:grape:pearl:wire');
  }
});
