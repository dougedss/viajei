import { expect, test, type Page } from '@playwright/test';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
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

/**
 * O topo do que está sobre a maquete (o cartão da vez, "Detalhes", o "Agora"): a caixa ocupa o palco
 * inteiro e empilha de baixo para cima, então o topo é o do filho mais alto que tem altura.
 */
const TOPO_DA_BARRA = `const topoDaBarra = () => {
  const sobre = document.querySelector('[data-overlay]');
  if (!sobre) return null;
  let top = sobre.getBoundingClientRect().bottom;
  for (const c of sobre.children) {
    const r = c.getBoundingClientRect();
    if (r.height > 0) top = Math.min(top, r.top);
  }
  return top;
};`;

/** Quanto a lista do dia entra, em px, por baixo do que está sobre a maquete; zero é o certo. */
const LISTA_SOB_A_BARRA = `(() => {
  ${TOPO_DA_BARRA}
  const lista = document.querySelector('[data-day-list]');
  const top = topoDaBarra();
  if (!lista || top === null) return 9999;
  return lista.getBoundingClientRect().bottom - top;
})()`;

/** As pílulas em cena cuja base (a âncora, `top`) entra por baixo do que está sobre a maquete. */
const PILULAS_SOB_A_BARRA = `(() => {
  ${TOPO_DA_BARRA}
  const top = topoDaBarra();
  if (top === null) return ['sem a barra'];
  return [...document.querySelectorAll('[data-pill]:not([hidden])')]
    .map((el) => [el.getAttribute('data-pill'), parseFloat(el.style.top) - top])
    .filter(([, d]) => d > 0)
    .map(([id, d]) => id + ' entra ' + Math.round(d) + ' px');
})()`;

/**
 * Os layout shifts desta página desde a navegação (o que o Lighthouse soma no CLS), com quem mexeu:
 * um cartão que chega depois dos dados não pode empurrar o que já estava na tela.
 */
const DESLOCAMENTOS = `new Promise((resolve) => {
  const out = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const quem = (e.sources || [])
        .map((s) => (s.node && s.node.nodeType === 1 ? s.node.tagName.toLowerCase() + '.' + String(s.node.className).slice(0, 60) : '?'))
        .join(' | ');
      out.push({ valor: e.value, quem });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  setTimeout(() => resolve(out), 300);
})`;

/** O CLS máximo da tela da viagem: a fase 13 media de 0,002 a 0,035; a 14 chegou a 0,12 (D180). */
const CLS_MAXIMO = 0.05;

/** O elemento no centro de um alvo (o último que casa, se `last`) é ele mesmo ou um filho: nada o cobre. */
const SOB_O_DEDO = (selector: string, last = false) => `(() => {
  const todos = document.querySelectorAll(${JSON.stringify(selector)});
  const el = ${last ? 'todos[todos.length - 1]' : 'todos[0]'};
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
    // a lista rola dentro da área da maquete e termina onde começa o que está sobre ela: nenhuma
    // linha fica por baixo do cartão da vez (aqui, o pedido de posição) nem do "Agora"
    await expect.poll(() => page.evaluate<number>(LISTA_SOB_A_BARRA)).toBeLessThanOrEqual(1);
    // o pedido de posição chegou depois dos dados e não empurrou nada (o CLS da D180)
    await expect(page.getByRole('button', { name: 'Usar posição' })).toBeVisible();
    const shifts = await page.evaluate<{ valor: number; quem: string }[]>(DESLOCAMENTOS);
    const cls = shifts.reduce((acc, x) => acc + x.valor, 0);
    expect(cls, `layout shifts da lista: ${JSON.stringify(shifts)}`).toBeLessThan(CLS_MAXIMO);
    await page.locator('[data-stop-row]').last().scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate<string>(SOB_O_DEDO('[data-stop-row]', true))).toBe('');
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
    // a maquete do meio-dia: depois das 18:30 o Modo Viagem fica de noite e o texto dele cresce 10%
    // (prompt, 11), e a 393 px o cartão de posição mais o "Agora" deixam de dar espaço ao dia inteiro
    // (a CI da fase 24 rodou às 23h de São Paulo). O relógio anda a partir daí, como o de verdade; só
    // aqui, porque o relógio de mentira muda o tempo das animações que o CLS da lista mede
    await page.clock.install({ time: new Date(`${dateInSaoPaulo(0)}T15:00:00.000Z`) });
    // o SwiftShader compila os shaders da cena devagar
    await page.goto(`/viagens/${tripId}`);
    await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-world="webgl2"], [data-world="webgpu"]')).toBeVisible({
      timeout: 60_000,
    });
    await semRolagem(page, 'maquete a 393 px');
    // o dia inteiro na tela (fase 22): as quatro pílulas em cena, com o cartão da vez (o pedido de
    // posição) na tela, e nenhuma por baixo do que está sobre a maquete (a altura medida, não um número)
    await expect(page.locator('[data-pill][data-placed]').first()).toBeAttached({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: 'Usar posição' })).toBeVisible();
    await expect
      .poll(() => page.locator('[data-pill]:not([hidden])').count(), { timeout: 30_000 })
      .toBe(4);
    await expect.poll(() => page.evaluate<string[]>(PILULAS_SOB_A_BARRA)).toEqual([]);
    await expect(page.locator('[data-world="webgl2"], [data-world="webgpu"]')).toHaveAttribute(
      'data-world-camera',
      'repouso',
    );
    const size = page.viewportSize();
    if (size) {
      await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
      await semRolagem(page, 'maquete a 360 px');
      // a 360 px o cartão de posição ocupa quatro linhas e o "Agora" três: o que está sobre a
      // maquete chega a 462 px dos 564 do palco, sobram 58 px, e a faixa das pílulas tem 10 px. Não
      // há como o dia inteiro caber ali (D223): a câmera se afasta até o fim, a maquete vira uma faixa
      // e as pílulas que não cabem se escondem. O que vale aqui é o que vale sempre: nenhuma pílula
      // em cena fica por baixo do que está sobre a maquete, e nada rola
      await expect.poll(() => page.evaluate<string[]>(PILULAS_SOB_A_BARRA)).toEqual([]);
      await page.setViewportSize(size);
    }
    // o cabeçalho do app não está nesta tela: ela é inteira
    await expect(page.getByRole('link', { name: 'Viajei, início' })).toHaveCount(0);
  });
});

/**
 * O perfil e a garagem pintam inteiros (fase 17, 3.0): no laboratório da produção da fase 16 as duas
 * telas deram 76 e 79 no Lighthouse, e não pelo bloqueio da thread (a lista, com o mesmo TBT, deu 96),
 * mas pelo cartão do resumo das conquistas, que chegava um quadro depois e empurrava a página (0,40 e
 * 0,34 de CLS). Uma pessoa com XP no servidor ganha o resumo na primeira derivação deste aparelho; com
 * ele guardado, as duas telas recarregam sem deslocar nada.
 */
test('o perfil e a garagem pintam inteiros: o resumo das conquistas não empurra a página', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const user = await criarUsuario('Resumo');
  // a viagem fica no futuro (D33): entrar cai na lista
  const { tripId } = await viagemNaSerra(user.id, 30);
  const xp = (kind: string, ref: string, points: number) => ({
    id: uuidV5(user.id, `${kind}:${ref}`),
    user_id: user.id,
    trip_id: tripId,
    kind,
    ref_id: ref,
    points,
  });
  await inserir('xp_events', [
    xp('trip_completed', tripId, 100),
    xp('checklist_complete', `${tripId}:before`, 20),
    xp('quest_done', uuidV4(), 30),
  ]);
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible({
    timeout: 20_000,
  });
  const resumo = page.locator('[data-progress-summary]');

  for (const [onde, rota, pronto] of [
    ['perfil', '/perfil', page.getByRole('heading', { name: 'Você', exact: true })],
    ['garagem', '/perfil/garagem?render=list', page.locator('[data-garage="svg"]')],
  ] as const) {
    await test.step(`${onde}: recarregar com o resumo guardado não desloca nada`, async () => {
      await page.goto(rota);
      // a primeira derivação deste aparelho cria o resumo (o XP veio do servidor)
      await expect(resumo).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(resumo).toBeVisible({ timeout: 15_000 });
      await expect(pronto).toBeVisible();
      const shifts = await page.evaluate<{ valor: number; quem: string }[]>(DESLOCAMENTOS);
      const cls = shifts.reduce((acc, x) => acc + x.valor, 0);
      expect(cls, `layout shifts de ${onde}: ${JSON.stringify(shifts)}`).toBeLessThan(CLS_MAXIMO);
    });
  }
});

/**
 * A lista de viagens pinta de uma vez (fase 26, a 3.0): na produção, o Lighthouse marcava 0,16 de CLS
 * na lista, intermitente, e o relatório inteiro mostrou a seção "Suas viagens" empurrada ~200 px por um
 * bloco que entrava acima dela depois da primeira pintura (o convite de instalar, que chegava com o
 * `beforeinstallprompt` do navegador; as reservas recebidas e os convites também chegam depois). Agora
 * o convite de instalar pinta desde o começo em todo navegador que sabe instalar, e a casca espera as
 * consultas do aparelho (as viagens e as recebidas) antes de pintar: nada se desloca.
 */
test.describe('a lista de viagens pinta de uma vez', () => {
  // um Chromium de Android: não é iPhone, e tem o `beforeinstallprompt`
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  });

  test('o convite de instalar já está na primeira pintura, e o evento do navegador que chega depois não empurra a lista; a recebida nasce junto com a lista', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const user = await criarUsuario('Lista');
    await viagemNaSerra(user.id, 30);
    // uma reserva recebida por e-mail, ainda sem viagem: a seção "Reservas recebidas" fica acima da lista
    const now = new Date().toISOString();
    await inserir('received_reservations', [
      {
        id: uuidV4(),
        user_id: user.id,
        source: 'email',
        source_id: `lista-${user.id}`,
        type: 'hotel',
        name: 'Pousada do Teste',
        status: 'received',
        files: [],
        received_at: now,
        created_at: now,
        updated_at: now,
        synced_at: now,
        field_versions: {},
      },
    ]);
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha', { exact: true }).fill(SENHA);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible({
      timeout: 20_000,
    });
    // a lista de novo, como o Lighthouse a abre: as viagens e a recebida já no aparelho
    await page.goto('/viagens');
    await expect(page.locator('[data-home="ready"]')).toBeVisible({ timeout: 20_000 });
    const instalar = page.getByRole('region', { name: 'Instalar o Viajei' });
    await expect(instalar).toBeVisible();
    await expect(instalar.getByRole('button', { name: 'Instalar o Viajei' })).toHaveAttribute(
      'data-install-prompt',
      'menu',
    );
    await expect(page.getByRole('region', { name: 'Reservas recebidas' })).toBeVisible();
    await expect(page.getByRole('article', { name: 'Pousada do Teste' })).toBeVisible();
    const topoAntes = (await page.getByRole('heading', { name: 'Suas viagens' }).boundingBox())?.y;
    // o navegador oferece a instalação depois da primeira pintura: o botão passa ao pedido nativo, e
    // nada muda de lugar
    await page.evaluate(`(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => Promise.resolve();
      e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    })()`);
    await expect(instalar.getByRole('button', { name: 'Instalar o Viajei' })).toHaveAttribute(
      'data-install-prompt',
      'native',
    );
    const topoDepois = (await page.getByRole('heading', { name: 'Suas viagens' }).boundingBox())?.y;
    expect(topoDepois).toBe(topoAntes);
    const shifts = await page.evaluate<{ valor: number; quem: string }[]>(DESLOCAMENTOS);
    const cls = shifts.reduce((acc, x) => acc + x.valor, 0);
    expect(cls, `layout shifts da lista: ${JSON.stringify(shifts)}`).toBeLessThan(CLS_MAXIMO);
  });
});
