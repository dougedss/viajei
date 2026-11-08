import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';
import { montarViagem } from './helpers/viagem.ts';
import { fakeOpenMeteo, fakeRouteDay, fakeTiles } from './helpers/world.ts';

/**
 * Acessibilidade de todas as telas, nos dois temas (fase 12):
 * - axe (WCAG 2.2 A e AA): zero violações `serious` e `critical`; as `moderate` vêm explicadas em
 *   `MODERADAS_EXPLICADAS` ou são corrigidas;
 * - alvos de toque de 48 px (o axe só confere os 24 px do WCAG 2.2); links no meio de um texto
 *   corrido ficam de fora, como no 2.5.8;
 * - texto do Modo Viagem ≥ 17 px de dia e 10% maior à noite;
 * - nenhuma tela rola para o lado na largura do celular (WCAG 1.4.10), a 393 px (iPhone 15) e a
 *   360 px (os Android menores), com o texto que vem das pessoas: um link de 80 caracteres e um
 *   endereço colado numa observação, um código de reserva comprido (fase 13).
 * As telas abrem com dados de verdade (uma viagem futura completa e uma que terminou ontem), gravados
 * direto no banco local. O que só o aparelho prova (VoiceOver, TalkBack, texto ampliado do sistema)
 * está no roteiro final (`docs/teste-final.md`). A guarda da rolagem é a mesma que o laboratório
 * avalia todo dia na produção (`src/features/lab/guards.ts`).
 */

// a falha aqui é de conteúdo, não de instabilidade: uma tentativa só, com o relatório inteiro
test.describe.configure({ retries: 0 });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const ALVO_PX = 48;
const TEXTO_PX = 17;

/** Violações `moderate` aceitas, cada uma com o porquê. Vazio: nenhuma aceita. */
const MODERADAS_EXPLICADAS: Record<string, string> = {};

type Achado = { rota: string; tema: string; tipo: string; detalhe: string };

/** O alvo de cada elemento tocável menor que 48 px (texto que o e2e não tipa: o tsconfig não tem DOM). */
const ALVOS_PEQUENOS = `(() => {
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option]';
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[aria-hidden="true"],[inert]')) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none') continue;
    let target = el;
    let r = el.getBoundingClientRect();
    // campo escondido de propósito (caixa de seleção desenhada, sr-only), ou caixa e rádio dentro do
    // rótulo: o alvo do toque é o rótulo inteiro
    const inLabel = el.tagName === 'INPUT' && /^(checkbox|radio)$/.test(el.type) && el.closest('label');
    if (r.width <= 2 || r.height <= 2 || st.opacity === '0' || inLabel) {
      const label = el.closest('label') || (el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null);
      if (!label) continue;
      target = label;
      r = label.getBoundingClientRect();
    }
    if (r.width === 0 || r.height === 0 || seen.has(target)) continue;
    seen.add(target);
    if (target.tagName === 'A' && getComputedStyle(target).display === 'inline') continue;
    if (r.width < ${ALVO_PX - 0.5} || r.height < ${ALVO_PX - 0.5}) {
      const name = (target.getAttribute('aria-label') || target.textContent || target.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
      out.push(target.tagName.toLowerCase() + ' "' + name + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  }
  return out;
})()`;

/** Os textos visíveis da tela menores que `min` px. */
const textosPequenos = (min: number) => `(() => {
  const out = [];
  const root = document.querySelector('main') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = (node.textContent || '').trim();
    const el = node.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('[aria-hidden="true"],svg,.sr-only')) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const size = parseFloat(st.fontSize);
    if (size < ${min} - 0.05) out.push('"' + text.slice(0, 30) + '" ' + size.toFixed(1) + 'px');
  }
  return out;
})()`;

/** O meio-dia ou as 20h mais recentes em São Paulo: o relógio só volta, nunca adianta a sessão. */
function ultimo(hora: number): Date {
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  const alvo = new Date(`${hoje}T${String(hora).padStart(2, '0')}:00:00-03:00`);
  return alvo <= agora ? alvo : new Date(alvo.getTime() - 86_400_000);
}

async function axe(page: Page, rota: string, tema: string, achados: Achado[]) {
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  for (const v of res.violations) {
    const impacto = v.impact ?? 'minor';
    if (impacto === 'moderate' && Object.hasOwn(MODERADAS_EXPLICADAS, v.id)) continue;
    const alvos = v.nodes
      .slice(0, 4)
      .map((n) => n.target.join(' '))
      .join(' | ');
    achados.push({
      rota,
      tema,
      tipo: `axe:${impacto}`,
      detalhe: `${v.id} (${String(v.nodes.length)}): ${v.help} → ${alvos}`,
    });
  }
}

/** Os alvos de toque e a largura: o que se confere pelo layout, sem o axe. */
async function alvos(page: Page, rota: string, tema: string, achados: Achado[]) {
  for (const a of await page.evaluate<string[]>(ALVOS_PEQUENOS)) {
    achados.push({ rota, tema, tipo: 'alvo<48', detalhe: a });
  }
  for (const a of await page.evaluate<string[]>(ROLAGEM_LATERAL)) {
    achados.push({ rota, tema, tipo: 'rolagem lateral', detalhe: a });
  }
  // a mesma tela nos 360 px dos Android menores, só para a rolagem (o axe já rodou): a janela
  // encolhe, a página se refaz, e volta ao tamanho do aparelho antes da próxima rota
  const size = page.viewportSize();
  if (size && size.width !== LARGURA_ESTREITA) {
    await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
    for (const a of await page.evaluate<string[]>(ROLAGEM_LATERAL)) {
      achados.push({ rota, tema, tipo: 'rolagem lateral', detalhe: `${a} (360 px)` });
    }
    await page.setViewportSize(size);
  }
}

function relatar(info: TestInfo, achados: Achado[]) {
  const texto = achados.map((a) => `[${a.tipo}] ${a.tema} ${a.rota}: ${a.detalhe}`).join('\n');
  // no log da CI, para corrigir numa volta só
  console.log(`acessibilidade: ${String(achados.length)} achados\n${texto}`);
  void info.attach('acessibilidade.txt', {
    body: texto || 'nenhum achado',
    contentType: 'text/plain',
  });
  const graves = achados.filter((a) => /^axe:(serious|critical)$/.test(a.tipo));
  expect.soft(graves, 'violações serious e critical do axe').toEqual([]);
  expect
    .soft(
      achados.filter((a) => a.tipo === 'axe:moderate'),
      'moderate sem explicação',
    )
    .toEqual([]);
  expect
    .soft(
      achados.filter((a) => a.tipo === 'alvo<48'),
      'alvos de toque menores que 48 px',
    )
    .toEqual([]);
  expect
    .soft(
      achados.filter((a) => a.tipo.startsWith('texto')),
      'texto do Modo Viagem',
    )
    .toEqual([]);
  expect
    .soft(
      achados.filter((a) => a.tipo === 'rolagem lateral'),
      'telas que rolam para o lado',
    )
    .toEqual([]);
}

async function entrar(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
}

for (const tema of ['light', 'dark'] as const) {
  test(`telas sem sessão, tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: tema });
    const achados: Achado[] = [];
    for (const [rota, titulo] of [
      ['/entrar', 'Entrar'],
      ['/criar-conta', 'Criar conta'],
      ['/recuperar-senha', 'Recuperar senha'],
      ['/nova-senha', 'Link inválido ou expirado'],
    ] as const) {
      await page.goto(rota);
      await expect(page.getByRole('heading', { name: titulo })).toBeVisible();
      await axe(page, rota, tema, achados);
      await alvos(page, rota, tema, achados);
    }
    relatar(info, achados);
  });

  test(`telas da viagem, tema ${tema === 'light' ? 'claro' : 'escuro'}`, async ({ page }, info) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: tema });
    const user = await criarUsuario('Acessivel');
    // daqui a 3 dias: dentro da janela da previsão, para o clima aparecer (com o Open-Meteo de mentira)
    const futura = await montarViagem(user.id, {
      // um nome longo: cada tela tem de caber na largura do celular com ele (rolagem lateral)
      nome: 'Serra gaúcha, Campos de Cima da Serra e o Litoral Norte com a família',
      inicio: 3,
      fim: 4,
    });
    const passada = await montarViagem(user.id, {
      nome: 'Já fomos',
      inicio: -2,
      fim: -1,
      concluida: true,
    });
    await fakeTiles(page.context());
    await fakeOpenMeteo(page.context());
    await fakeRouteDay(page.context());
    await entrar(page, user.email);
    const t = `/viagens/${futura.tripId}`;
    // o primeiro pull traz as duas viagens para o Dexie; daí em diante cada tela abre do aparelho
    await page.goto(t);
    await expect(page.getByRole('heading', { name: 'Serra gaúcha' })).toBeVisible({
      timeout: 20_000,
    });

    const rotas: [string, string | RegExp | ((p: Page) => Locator)][] = [
      ['/', 'Suas viagens'],
      ['/perfil', 'Perfil'],
      ['/viagens/nova', 'Nova viagem'],
      [t, 'Serra gaúcha'],
      [`${t}/editar`, 'Editar viagem'],
      [`${t}/importar`, 'Colar roteiro'],
      [`${t}/roteiro`, 'Roteiro'],
      [`${t}/roteiro/${futura.dayIds[0] ?? ''}`, 'Dia 1'],
      [`${t}/reservas`, 'Reservas'],
      [`${t}/reservas/nova`, 'Nova reserva'],
      [`${t}/reservas/${futura.reservationId}/editar`, 'Editar reserva'],
      [`${t}/checklists?aba=antes`, 'Listas'],
      [`${t}/checklists?aba=mala`, 'Listas'],
      [`${t}/checklists?aba=missoes`, 'Listas'],
      [`${t}/contatos`, 'Contatos'],
      [`${t}/gastos`, 'Gastos'],
      [`${t}/diario`, 'Diário'],
      [`${t}/garagem?render=list`, 'Garagem'],
      [`${t}/avisos`, 'Avisos'],
      [`${t}/membros`, /^Time$/],
      [`${t}/mapa`, 'Mapa'],
      [`/viagens/${passada.tripId}/diario`, 'Diário'],
      [
        `/viagens/${passada.tripId}/retrospectiva?render=list`,
        (p) => p.locator('[data-film-mode="cards"]'),
      ],
      ['/nao-existe', /não encontrada/i],
    ];
    const achados: Achado[] = [];
    for (const [rota, titulo] of rotas) {
      await page.goto(rota);
      const pronto =
        typeof titulo === 'function' ? titulo(page) : page.getByRole('heading', { name: titulo });
      await expect(pronto.first()).toBeVisible({ timeout: 15_000 });
      await axe(page, rota, tema, achados);
      await alvos(page, rota, tema, achados);
    }

    // o Modo Viagem de dia e de noite (o tema da noite entra sozinho das 18:30 às 6:00)
    for (const [quando, hora, min] of [
      ['dia', 12, TEXTO_PX],
      ['noite', 20, TEXTO_PX * 1.1],
    ] as const) {
      await page.clock.setFixedTime(ultimo(hora));
      const rota = `${t}/viagem?render=list`;
      await page.goto(rota);
      await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 15_000 });
      const nome = `${rota} (${quando})`;
      await axe(page, nome, tema, achados);
      await alvos(page, nome, tema, achados);
      for (const s of await page.evaluate<string[]>(textosPequenos(min))) {
        achados.push({ rota: nome, tema, tipo: `texto<${min.toFixed(1)}`, detalhe: s });
      }
    }
    relatar(info, achados);
  });
}
