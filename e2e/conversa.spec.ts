import { expect, test, type Page, type Route } from '@playwright/test';
import {
  EMPTY_INTENT,
  type PlanIntent,
  type PlanPlaces,
  type PlanWrite,
} from '../supabase/functions/_shared/plan-protocol.ts';
import { campo, entrar, novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { posicaoDecidida } from './helpers/geo.ts';
import { aiSse, respondSse } from './helpers/import.ts';
import { buscaNoMapa, lugar, rotaForjada } from './helpers/places.ts';
import { criarUsuario } from './helpers/users.ts';

/**
 * As correções da conversa (fase 25, D270 a D278), com a IA, o mapa e o Nominatim respondidos no
 * navegador e a posição concedida pelo Playwright: a pergunta de posição e "Saindo de X · mudar"; o
 * campo livre digitado inteiro; a resposta não entendida perguntada de novo; "almoçar em Mafra" com a
 * Mafra de Santa Catarina pelo viés; a pergunta da cidade com dois plausíveis; e um pedido com coisas
 * que a busca não acha terminando em pendente, com a viagem nascendo com a parada sem local.
 */
const MAJOR_VIEIRA = { latitude: -26.3712, longitude: -50.3268 };
const D1 = dateInSaoPaulo(1);

type PlanBody = {
  step?: string;
  text?: string;
  places?: PlanPlaces;
  questions?: { text: string }[];
  answers?: string[];
  context: Record<string, unknown>;
};
type Question = {
  topic: 'when' | 'origin' | 'area' | 'reach' | 'other';
  text: string;
  options: string[];
};

/** O passo das perguntas da IA: as perguntas e a vontade, como o `done` leva. */
function perguntas(questions: Question[], intent: Partial<PlanIntent>): string {
  const data = { questions, intent: { ...EMPTY_INTENT, ...intent } };
  return aiSse(JSON.stringify(data), { data });
}
/** A viagem escrita sobre as escolhas: só textos e referências. */
function escrita(write: PlanWrite): string {
  return aiSse(JSON.stringify(write), { data: write });
}
const ALCANCE: Question = {
  topic: 'reach',
  text: 'Até quanto tempo de carro?',
  options: ['1 hora', '2 horas'],
};
const CAFE: PlanIntent['wants'] = [{ words: 'café', kind: 'food' }];

/** O Nominatim de mentira: a cidade da posição, as origens e as cidades da fase. */
async function nominatim(page: Page): Promise<void> {
  await page.route('https://nominatim.openstreetmap.org/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname.startsWith('/reverse')) {
      await route.fulfill({
        json: { address: { town: 'Major Vieira', 'ISO3166-2-lvl4': 'BR-SC' } },
        headers,
      });
      return;
    }
    // a cidade só quando a consulta começa por ela: "Feirinha, Canoinhas SC" (a revisão procurando
    // o pendente pelo nome) não é Canoinhas
    const q = url.searchParams.get('q') ?? '';
    const row = (name: string, address: string, lat: number, lon: number) => ({
      display_name: address,
      name,
      lat: String(lat),
      lon: String(lon),
      category: 'place',
      type: 'town',
    });
    const json = /^mafra/i.test(q)
      ? // como o Nominatim público devolve "mafra" (o balcão, 20/11): Lisboa em 1º, SC em 2º
        [
          row('Mafra', 'Mafra, Lisboa, Portugal', 38.9369, -9.3312),
          row('Mafra', 'Mafra, Santa Catarina, Brasil', -26.1116, -49.8054),
        ]
      : /^bom jardim/i.test(q)
        ? [
            row(
              'Bom Jardim da Serra',
              'Bom Jardim da Serra, Santa Catarina, Brasil',
              -28.34,
              -49.62,
            ),
            row('Bom Jardim', 'Bom Jardim, Rio Grande do Sul, Brasil', -29.5, -50.3),
          ]
        : /^canoinhas/i.test(q)
          ? [row('Canoinhas', 'Canoinhas, Santa Catarina, Brasil', -26.1765, -50.39)]
          : /^papanduva/i.test(q)
            ? [row('Papanduva', 'Papanduva, Santa Catarina, Brasil', -26.37, -50.144)]
            : /^major vieira/i.test(q)
              ? [row('Major Vieira', 'Major Vieira, Santa Catarina, Brasil', -26.3712, -50.3268)]
              : [];
    await route.fulfill({ json, headers });
  });
}

const CAFE_SC = lugar(
  'cafe-sc',
  'Café da Praça',
  -26.18,
  -50.39,
  ['catering', 'catering.cafe'],
  'Canoinhas',
);
const RESTAURANTE_MAFRA = lugar(
  'rest-mafra',
  'Restaurante Mafrense',
  -26.11,
  -49.8,
  ['catering', 'catering.restaurant'],
  'Mafra',
);
const CASCATA_MAFRA = lugar(
  'cascata-mafra',
  'Cascata do Rio Negro',
  -26.2,
  -49.9,
  ['tourism', 'tourism.attraction'],
  'Mafra',
);

/** A tela das perguntas da IA sem pergunta nenhuma: só a vontade, e a busca direta. */
const semPerguntas = (intent: Partial<PlanIntent>) => (body: unknown) =>
  (body as PlanBody).step === 'ask' ? perguntas([], intent) : escrita(ESCRITA_CAFE);
const ESCRITA_CAFE: PlanWrite = {
  trip: { name: 'Café', start_date: D1, end_date: D1 },
  days: [{ date: D1, title: 'Café', start: '09:00', stops: [{ ref: 'e1', note: null }] }],
  suggestions: [],
  quests: [],
  checklist_before: [],
  checklist_pack: [],
};

test('a posição na conversa: o cartão, "Usar posição", "Saindo de Major Vieira, SC", as opções medidas dali, e "mudar"', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await rotaForjada(context);
  const mapa = await buscaNoMapa(context, () => [CAFE_SC]);
  const pedidos: PlanBody[] = [];
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      (body) =>
        (body as PlanBody).step === 'ask'
          ? perguntas([ALCANCE], { wants: CAFE })
          : escrita(ESCRITA_CAFE),
      (body) => pedidos.push(body as PlanBody),
    ),
  );
  // a permissão do navegador, dada no toque; a posição em Major Vieira
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MAJOR_VIEIRA);
  const user = await criarUsuario('Posicao');
  await entrar(page, user.email);
  await campo(page).fill('quero ir num café amanhã');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();

  // a pergunta de posição, uma frase e um toque, antes de ler o pedido
  const cartao = page.getByRole('region', { name: 'Usar a posição do celular' });
  await expect(cartao).toBeVisible({ timeout: 20_000 });
  await expect(cartao).toContainText('saber de onde vocês saem');
  await cartao.getByRole('button', { name: 'Usar posição' }).click();

  // a IA recebeu onde a pessoa está (arredondado a uns 1 km), e "saindo de" é a cidade do reverso
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  expect(pedidos[0]?.context).toMatchObject({
    position: { lat: -26.37, lng: -50.33 },
    place: 'Major Vieira, SC',
    origin: 'Major Vieira, SC',
  });
  // "Saindo de Major Vieira, SC · mudar" à vista nas perguntas
  const origem = page.locator('[data-origin]');
  await expect(origem).toContainText('Saindo de Major Vieira, SC');
  await expect(origem.getByRole('button', { name: 'Mudar de onde vocês saem' })).toBeVisible();
  await page.getByRole('button', { name: '1 hora' }).click();
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();

  // as opções medidas de onde a pessoa está: a busca em volta da posição (arredondada), a 1 h
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  expect(mapa.pedidos[0]).toMatchObject({
    area: { type: 'circle', lng: -50.33, lat: -26.37, radius_m: 37_000 },
  });
  await expect(page.locator('[data-options] [data-origin]')).toContainText(
    'Saindo de Major Vieira, SC',
  );

  // "mudar": a origem escrita vale acima da posição, e a busca roda de novo dali
  await page.getByRole('button', { name: 'Mudar de onde vocês saem' }).click();
  await page.getByLabel('De onde vocês saem?').fill('Canoinhas');
  await page.getByRole('button', { name: 'Usar esta origem' }).click();
  await expect(page.locator('[data-options] [data-origin]')).toContainText('Saindo de Canoinhas', {
    timeout: 20_000,
  });
  expect(mapa.pedidos.at(-1)).toMatchObject({ area: { type: 'circle', lng: -50.39, lat: -26.18 } });
});

test('sem a permissão: "Agora não", a origem da viagem mais recente, e a conversa segue', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await rotaForjada(context);
  await buscaNoMapa(context, () => [CAFE_SC]);
  const pedidos: PlanBody[] = [];
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, semPerguntas({ wants: CAFE }), (body) => pedidos.push(body as PlanBody)),
  );
  const user = await criarUsuario('SemPosicao');
  await entrar(page, user.email);
  // a viagem mais recente da pessoa sai de Canoinhas (uma de dezembro, criada antes, de Papanduva)
  await novaViagem(page, { nome: 'Dezembro', inicio: 40, fim: 41, origem: 'Papanduva/SC' });
  await page.getByRole('link', { name: 'Início' }).click();
  await novaViagem(page, { nome: 'Depois', inicio: 10, fim: 10, origem: 'Canoinhas, SC' });
  await page.getByRole('link', { name: 'Início' }).click();
  await campo(page).fill('quero ir num café amanhã');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await page
    .getByRole('region', { name: 'Usar a posição do celular' })
    .getByRole('button', { name: 'Agora não' })
    .click();
  // sem pergunta: as opções, saindo da origem mais recente (não da viagem de dezembro)
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[data-options] [data-origin]')).toContainText(
    'Saindo de Canoinhas, SC',
  );
  expect(pedidos[0]?.context).toMatchObject({ position: null, origin: 'Canoinhas, SC' });
});

test('"1 hora e meia" digitado inteiro; "1:3O no maximo" não entendido pergunta de novo, e "1h30" busca a até 1,5 h', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  const mapa = await buscaNoMapa(context, () => [CAFE_SC]);
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, (body) =>
      (body as PlanBody).step === 'ask'
        ? perguntas([ALCANCE], { wants: CAFE, origin: 'Canoinhas' })
        : escrita(ESCRITA_CAFE),
    ),
  );
  const user = await criarUsuario('Tempo');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café amanhã, saindo de Canoinhas');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  const livre = page.getByLabel('Ou com as suas palavras');
  await expect(livre).toBeVisible({ timeout: 20_000 });

  // digitar letra a letra passa por "1 hora" (uma opção) sem apagar o campo
  await livre.pressSequentially('1 hora e meia');
  await expect(livre).toHaveValue('1 hora e meia');
  // a resposta com a letra O no lugar do zero não é um tempo: a tela pergunta de novo, com o texto
  await livre.fill('1:3O no maximo');
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();
  await expect(page.locator('[data-misread]')).toContainText('Não entendi quanto tempo', {
    timeout: 10_000,
  });
  await expect(livre).toHaveValue('1:3O no maximo');
  expect(mapa.pedidos).toHaveLength(0);
  await livre.fill('1h30');
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  // a até 1,5 h: o raio da mesma estimativa dos cartões
  expect(mapa.pedidos[0]).toMatchObject({ area: { type: 'circle', radius_m: 63_000 } });
});

test('"almoçar em mafra": com o viés de onde a pessoa está, a Mafra de Santa Catarina, sem pergunta', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  const mapa = await buscaNoMapa(context, (body) =>
    body.categories.includes('catering.restaurant') ? [RESTAURANTE_MAFRA] : [CASCATA_MAFRA],
  );
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      semPerguntas({
        wants: [
          { words: 'almoçar', kind: 'food' },
          { words: 'cachoeira', kind: 'nature' },
        ],
        area: 'Mafra',
        when: 'amanhã',
      }),
    ),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MAJOR_VIEIRA);
  const user = await criarUsuario('Mafra');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'granted');
  await campo(page).fill('amanha quero almoçar em mafra e depois ir numa cachoeira');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  // nenhuma pergunta da cidade: a única Mafra plausível a partir de Major Vieira é a de SC
  await expect(page.locator('[data-option]')).toHaveCount(2, { timeout: 30_000 });
  await expect(page.locator('[data-place-ask]')).toHaveCount(0);
  await expect(page.getByText(/de Mafra\./).first()).toBeVisible();
  // as duas buscas em volta da Mafra de Santa Catarina, nunca da de Lisboa
  for (const pedido of mapa.pedidos) {
    expect(pedido.area).toMatchObject({ type: 'circle', lng: -49.81, lat: -26.11 });
  }
});

test('a cidade com dois candidatos plausíveis: a pergunta antes da busca, a escolha, e então as opções', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  const mapa = await buscaNoMapa(context, () => [CAFE_SC]);
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, semPerguntas({ wants: CAFE, area: 'Bom Jardim', origin: 'Canoinhas' })),
  );
  const user = await criarUsuario('DoisPlausiveis');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café em Bom Jardim, saindo de Canoinhas');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  const escolher = page.locator('[data-place-ask="choice"]');
  await expect(escolher).toBeVisible({ timeout: 30_000 });
  await expect(escolher).toContainText('Escolher o local (2)');
  await expect(escolher).toContainText('Há mais de um “Bom Jardim” no mapa');
  await expect(escolher.getByRole('radio')).toHaveCount(2);
  await expect(escolher.getByRole('radio', { name: /^Bom Jardim da Serra/ })).toContainText(
    /a cerca de \d+ h/,
  );
  // a busca só roda depois da escolha, e em volta do que foi escolhido
  expect(mapa.pedidos).toHaveLength(0);
  await escolher.getByRole('radio', { name: /^Bom Jardim da Serra/ }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  expect(mapa.pedidos[0]).toMatchObject({ area: { type: 'circle', lng: -49.62, lat: -28.34 } });
});

test('"Serra Gaúcha" não é cidade no mapa: a tela pergunta a cidade, sem candidatos, e a busca roda em volta da cidade escrita', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  const mapa = await buscaNoMapa(context, () => [CAFE_SC]);
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, semPerguntas({ wants: CAFE, area: 'Serra Gaúcha', origin: 'Papanduva' })),
  );
  const user = await criarUsuario('Regiao');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café na Serra Gaúcha, saindo de Papanduva');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  const pergunta = page.locator('[data-place-ask="unknown"]');
  await expect(pergunta).toBeVisible({ timeout: 30_000 });
  await expect(pergunta).toContainText(
    'Não achei “Serra Gaúcha” como cidade no mapa. Para qual cidade vocês vão?',
  );
  await expect(pergunta.getByRole('radio')).toHaveCount(0);
  expect(mapa.pedidos).toHaveLength(0);
  await pergunta.getByLabel('A cidade').fill('Canoinhas');
  await pergunta.getByRole('button', { name: 'Procurar esta cidade' }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  expect(mapa.pedidos[0]).toMatchObject({ area: { type: 'circle', lng: -50.39, lat: -26.18 } });
  await expect(page.getByText(/de Canoinhas\./).first()).toBeVisible();
});

test('feirinha, café e cortar o cabelo em Canoinhas: os três estados, o resumo, a viagem com a parada sem local e <pendentes> na escrita', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await nominatim(page);
  await rotaForjada(context);
  // só o café existe no mapa de mentira; a feirinha e o salão, não
  await buscaNoMapa(context, (body) =>
    body.categories.includes('catering.cafe') ? [CAFE_SC] : [],
  );
  const pedidos: PlanBody[] = [];
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      (body) =>
        (body as PlanBody).step === 'ask'
          ? perguntas([], {
              wants: [
                { words: 'feirinha', kind: 'event' },
                { words: 'café', kind: 'food' },
                { words: 'cortar o cabelo', kind: 'other' },
              ],
              area: 'Canoinhas SC',
              origin: 'Major Vieira',
            })
          : escrita({
              trip: { name: 'Café em Canoinhas', start_date: D1, end_date: D1 },
              days: [
                {
                  date: D1,
                  title: 'Café em Canoinhas',
                  start: '09:00',
                  stops: [{ ref: 'e1', note: 'o café da praça' }],
                },
              ],
              suggestions: [],
              quests: [],
              checklist_before: ['Escolher onde fica a feirinha'],
              checklist_pack: [],
            }),
      (body) => pedidos.push(body as PlanBody),
    ),
  );
  const user = await criarUsuario('Canoinhas');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'declined');
  await campo(page).fill(
    'iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em canoinhas sc',
  );
  await page.getByRole('button', { name: 'Montar a viagem' }).click();

  // cada coisa pedida num estado, à vista: a feirinha e o salão pendentes, o café sem escolha ainda
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[data-fate="pending"]')).toHaveCount(2);
  await expect(page.locator('[data-summary]')).toHaveText(
    '0 escolhidos · 1 sem escolha: Café · 2 pendentes: Feirinha, Cortar o cabelo',
  );
  // "Tirar da viagem" o salão: tirado, com desfazer; e o café escolhido
  await page
    .getByRole('region', { name: 'Cortar o cabelo' })
    .getByRole('button', { name: 'Tirar da viagem' })
    .click();
  await expect(page.getByRole('region', { name: 'Cortar o cabelo' })).toContainText(
    'Tirado da viagem',
  );
  await page.getByRole('button', { name: /^Café da Praça/ }).click();
  await expect(page.locator('[data-summary]')).toHaveText(
    '1 escolhido · 1 pendente: Feirinha · 1 tirado: Cortar o cabelo',
  );
  await page.getByRole('button', { name: /^Traçar o caminho/ }).click();

  // a revisão: a feirinha entrou sem local, e a tela diz; a escrita recebeu o pendente como dado
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-checked="faltou"]')).toContainText('Feirinha');
  await expect(page.getByRole('checkbox', { name: /^Feirinha/ })).toBeVisible();
  // a revisão procura o pendente só pelo nome com a cidade, nunca pela cidade sozinha: sem local
  await expect(page.getByText('Sem local · dá para marcar depois')).toBeVisible({
    timeout: 20_000,
  });
  const escrita1 = pedidos.find((p) => p.step === 'plan');
  expect(escrita1?.places?.chosen.map((c) => c.name)).toEqual(['Café da Praça']);
  expect(escrita1?.places?.pending).toEqual([
    { name: 'Feirinha', kind: 'event', why: 'not_found' },
  ]);

  // a viagem nasce com o café com coordenada e a feirinha sem, e sem o salão
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await expect
    .poll(
      async () =>
        (await linhas('stops', `trip_id=eq.${tripId}&select=name,lat&order=name`)).map((s) => [
          s.name,
          s.lat !== null,
        ]),
      { timeout: 20_000 },
    )
    .toEqual([
      ['Café da Praça', true],
      ['Chegada em Major Vieira', true],
      ['Feirinha', false],
      ['Saída de Major Vieira', true],
    ]);
});

/**
 * O CLS da `nova_viagem` (fase 27, a 3.0): o laboratório da produção da 25 mediu 0,136 no cartão da
 * pergunta, e o relatório do Lighthouse disse a causa: "Web font loaded" (a tela pintava na fonte do
 * sistema e trocava para a Barlow um instante depois, empurrando o cartão). Agora as fontes começam a
 * carregar junto com o app e a casca de quem entrou espera por elas: ao recarregar a tela da conversa, o
 * texto já nasce na Barlow e nada se desloca.
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

test('a tela da conversa recarregada pinta com as fontes no lugar: nenhum deslocamento do cartão da pergunta', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await nominatim(page);
  const user = await criarUsuario('Fontes');
  await entrar(page, user.email);
  // a saída de hoje até as perguntas do app (sem IA), com "Agora não" ao cartão da posição: o mesmo
  // caminho do Lighthouse do laboratório
  await campo(page).fill('quero sair hoje');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await page
    .getByRole('region', { name: 'Usar a posição do celular' })
    .getByRole('button', { name: 'Agora não' })
    .click();
  await expect(page.getByText(/^Tenho \d perguntas? antes de montar\.$/)).toBeVisible({
    timeout: 20_000,
  });
  // a tela de novo, como o Lighthouse a abre: a conversa guardada no aparelho
  await page.reload();
  const lead = page.getByText(/^Tenho \d perguntas? antes de montar\.$/);
  await expect(lead).toBeVisible({ timeout: 20_000 });
  // as fontes do app estavam prontas quando o texto pintou
  expect(
    await page.evaluate<boolean>(
      `document.fonts.check('600 22px "Barlow Condensed"') && document.fonts.check('400 16px Barlow')`,
    ),
  ).toBe(true);
  const shifts = await page.evaluate<{ valor: number; quem: string }[]>(DESLOCAMENTOS);
  const cls = shifts.reduce((acc, x) => acc + x.valor, 0);
  expect(cls, `layout shifts da conversa: ${JSON.stringify(shifts)}`).toBeLessThan(0.05);
  expect(
    shifts.filter((s) => s.quem.includes('rounded-card')),
    `o cartão da pergunta se deslocou: ${JSON.stringify(shifts)}`,
  ).toEqual([]);
});
