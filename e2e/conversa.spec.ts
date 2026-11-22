import { expect, test, type Page, type Route } from '@playwright/test';
import type { PlanPlaces, PlanWrite } from '../supabase/functions/_shared/plan-protocol.ts';
import { campo, entrar, novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { posicaoDecidida } from './helpers/geo.ts';
import { aiSse, respondSse } from './helpers/import.ts';
import { buscaNoMapa, rotaForjada } from './helpers/places.ts';
import { achados, lugarGoogle, passeio, passo, planejador, rodada } from './helpers/planner.ts';
import { criarUsuario } from './helpers/users.ts';

/**
 * A conversa com o planejador (fase 27) e as correções da fase 25, com a IA, o Google e o Nominatim
 * respondidos no navegador e a posição concedida pelo Playwright: a pergunta de posição e "Saindo de
 * X · mudar"; a pergunta da IA na dúvida e a segunda rodada; o campo livre digitado inteiro e a
 * resposta não entendida perguntada de novo (a saída de hoje); a origem com dois plausíveis; e o
 * pedido de Canoinhas terminando com o café escolhido, o salão tirado e a feirinha pendente com a
 * pergunta, a viagem nascendo com a parada sem local e o `place_id` do Google na parada escolhida.
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

/** A viagem escrita sobre as escolhas: só textos e referências. */
function escrita(write: PlanWrite): string {
  return aiSse(JSON.stringify(write), { data: write });
}
const ESCRITA_CAFE: PlanWrite = {
  trip: { name: 'Café', start_date: D1, end_date: D1 },
  days: [{ date: D1, title: 'Café', start: '09:00', stops: [{ ref: 'e1', note: null }] }],
  suggestions: [],
  quests: [],
  checklist_before: [],
  checklist_pack: [],
};
/** A `plan-trip` só escreve (o `ask` de antes não é mais chamado pela conversa). */
async function escritor(page: Page, write: PlanWrite, onRequest?: (body: PlanBody) => void) {
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, escrita(write), (body) => onRequest?.(body as PlanBody)),
  );
}

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

/** Os lugares inventados que "o Google achou" em Canoinhas. */
const CAFE = lugarGoogle('g-cafe-praca', 'Café da Praça', -26.18, -50.39, 'Canoinhas');
const PADARIA = lugarGoogle('g-padaria', 'Padaria do Centro', -26.179, -50.392, 'Canoinhas', {
  categories: ['bakery', 'food'],
  rating: 4.3,
  user_rating_count: 80,
  open_now: false,
});
const SALAO = lugarGoogle('g-salao', 'Salão Luz', -26.177, -50.388, 'Canoinhas', {
  categories: ['hair_salon', 'point_of_interest'],
  rating: 4.8,
  user_rating_count: 57,
});

test('a posição na conversa: o cartão, "Usar posição", a pergunta da IA e a segunda rodada, "Saindo de Major Vieira, SC", e "mudar"', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await rotaForjada(context);
  await buscaNoMapa(context, () => []);
  await escritor(page, ESCRITA_CAFE);
  // a primeira rodada pergunta (a dúvida do tempo); a segunda, com a resposta, entrega o café
  const ia = await planejador(context, (body) =>
    (body.answers ?? []).length === 0
      ? rodada(
          [],
          passeio([], {
            perguntas: [{ text: 'Até quanto tempo de carro?', options: ['1 hora', '2 horas'] }],
          }),
        )
      : rodada(achados([CAFE]), passeio([passo(1, 'café', ['p1'], { relacao: 'perto_de_casa' })])),
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

  // o planejador recebeu onde a pessoa está (arredondado a uns 1 km), e "saindo de" é a cidade do reverso
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  expect(ia.pedidos[0]).toMatchObject({
    kind: 'plan',
    text: 'quero ir num café amanhã',
    reference: { lat: -26.37, lng: -50.33 },
    context: {
      position: { lat: -26.37, lng: -50.33 },
      place: 'Major Vieira, SC',
      origin: 'Major Vieira, SC',
    },
  });
  // "Saindo de Major Vieira, SC · mudar" à vista nas perguntas
  const origem = page.locator('[data-origin]');
  await expect(origem).toContainText('Saindo de Major Vieira, SC');
  await expect(origem.getByRole('button', { name: 'Mudar de onde vocês saem' })).toBeVisible();
  await page.getByRole('button', { name: '1 hora' }).click();
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();

  // a segunda rodada leva a pergunta e a resposta; as opções do Google, medidas de onde a pessoa está
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  expect(ia.pedidos[1]).toMatchObject({
    questions: [{ text: 'Até quanto tempo de carro?' }],
    answers: ['1 hora'],
    reference: { lat: -26.37, lng: -50.33 },
  });
  await expect(page.locator('[data-options] [data-origin]')).toContainText(
    'Saindo de Major Vieira, SC',
  );
  await expect(page.locator('[data-option]').first()).toContainText('4,6 · 212 avaliações');
  await expect(page.locator('[data-map-attribution]')).toContainText('Dados do Google Maps');

  // "mudar": a origem escrita vale acima da posição, e o planejador roda de novo dali
  await page.getByRole('button', { name: 'Mudar de onde vocês saem' }).click();
  await page.getByLabel('De onde vocês saem?').fill('Canoinhas');
  await page.getByRole('button', { name: 'Usar esta origem' }).click();
  await expect(page.locator('[data-options] [data-origin]')).toContainText('Saindo de Canoinhas', {
    timeout: 20_000,
  });
  expect(ia.pedidos.at(-1)).toMatchObject({ reference: { lat: -26.18, lng: -50.39 } });
});

test('sem a permissão: "Agora não", a origem da viagem mais recente, e a conversa segue sem pergunta', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await rotaForjada(context);
  await buscaNoMapa(context, () => []);
  await escritor(page, ESCRITA_CAFE);
  const ia = await planejador(context, () =>
    rodada(achados([CAFE]), passeio([passo(1, 'café', ['p1'], { relacao: 'perto_de_casa' })])),
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
  expect(ia.pedidos[0]).toMatchObject({
    context: { position: null, origin: 'Canoinhas, SC' },
    reference: { lat: -26.18, lng: -50.39 },
  });
});

test('a saída de hoje: "1 hora e meia" digitado inteiro; "1:3O no maximo" não entendido pergunta de novo, e "1h30" vai ao planejador', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await buscaNoMapa(context, () => []);
  const ia = await planejador(context, () =>
    rodada(achados([CAFE]), passeio([passo(1, 'café', ['p1'], { relacao: 'perto_de_casa' })])),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MAJOR_VIEIRA);
  const user = await criarUsuario('Tempo');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'granted');
  await campo(page).fill('quero sair hoje para um café');
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
  expect(ia.pedidos).toHaveLength(0);
  await livre.fill('1h30');
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  // o planejador recebeu a saída de hoje, a resposta inteira e o alcance lido dela
  expect(ia.pedidos[0]).toMatchObject({
    kind: 'today',
    answers: ['1h30'],
    context: { reach: 'day', position: { lat: -26.37, lng: -50.33 } },
    reference: { lat: -26.37, lng: -50.33 },
  });
});

test('a origem com dois candidatos plausíveis ("Bom Jardim"): a pergunta antes de procurar, a escolha, e o planejador roda dali', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await buscaNoMapa(context, () => []);
  const ia = await planejador(context, () =>
    rodada(achados([CAFE]), passeio([passo(1, 'café', ['p1'], { relacao: 'perto_de_casa' })])),
  );
  const user = await criarUsuario('DoisPlausiveis');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café amanhã');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  // sem origem conhecida, a primeira rodada roda e as opções perguntam de onde saem (sem "Saindo de");
  // "Bom Jardim" pergunta qual
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[data-options] [data-origin="unknown"]')).toContainText(
    'De onde vocês saem?',
  );
  await page.getByRole('button', { name: 'Informar de onde vocês saem' }).click();
  await page.getByLabel('De onde vocês saem?').fill('Bom Jardim');
  await page.getByRole('button', { name: 'Usar esta origem' }).click();
  const escolher = page.locator('[data-place-ask="choice"]');
  await expect(escolher).toBeVisible({ timeout: 30_000 });
  await expect(escolher).toContainText('Escolher o local (2)');
  await expect(escolher).toContainText('Há mais de um “Bom Jardim” no mapa');
  await expect(escolher.getByRole('radio')).toHaveCount(2);
  // o planejador só roda de novo depois da escolha, com a referência da cidade escolhida
  const antes = ia.pedidos.length;
  await escolher.getByRole('radio', { name: /^Bom Jardim da Serra/ }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 30_000 });
  expect(ia.pedidos).toHaveLength(antes + 1);
  expect(ia.pedidos.at(-1)).toMatchObject({ reference: { lat: -28.34, lng: -49.62 } });
  await expect(page.locator('[data-options] [data-origin]')).toContainText('Saindo de Bom Jardim');
});

test('a pergunta da IA na dúvida ("quero sair pra algum lugar legal"): o que fazer, com opções que o app procura; a resposta vai à segunda rodada', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await buscaNoMapa(context, () => []);
  const ia = await planejador(context, (body) =>
    (body.answers ?? []).length === 0
      ? rodada(
          [],
          passeio([], {
            perguntas: [
              {
                text: 'O que vocês querem fazer?',
                options: ['um café', 'uma cachoeira', 'um parque'],
              },
            ],
          }),
        )
      : rodada(
          achados([CAFE]),
          passeio([passo(1, 'um café', ['p1'], { relacao: 'perto_de_casa' })]),
        ),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MAJOR_VIEIRA);
  const user = await criarUsuario('Duvida');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'granted');
  await campo(page).fill('domingo quero sair pra algum lugar legal, o que tem pra fazer?');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('O que vocês querem fazer?')).toBeVisible();
  await page.getByRole('button', { name: 'um café' }).click();
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  expect(ia.pedidos[1]).toMatchObject({
    questions: [{ text: 'O que vocês querem fazer?' }],
    answers: ['um café'],
  });
  // a segunda rodada não pergunta de novo: o passo e a opção
  await expect(page.locator('[data-step="1"]')).toContainText('Um café');
});

test('feirinha, café e cortar o cabelo em Canoinhas pelo planejador: os passos em ordem, os três estados, o resumo, a viagem com a parada sem local, o place_id na escolhida e <pendentes> na escrita', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await nominatim(page);
  await rotaForjada(context);
  // as sugestões no corredor continuam pela Geoapify (vazias aqui)
  await buscaNoMapa(context, () => []);
  const pedidos: PlanBody[] = [];
  await escritor(
    page,
    {
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
    },
    (body) => pedidos.push(body),
  );
  // o planejador: o café com dois candidatos, o salão com um, e a feirinha pendente com a pergunta
  const ia = await planejador(context, () =>
    rodada(
      achados([CAFE, PADARIA, SALAO]),
      passeio(
        [
          passo(2, 'café', ['p1', 'p2']),
          passo(3, 'cortar o cabelo', ['p3']),
          passo(1, 'feirinha', [], { achou: false }),
        ],
        { pendentes: [{ o_que: 'a feirinha', pergunta: 'Onde fica a feirinha?' }] },
      ),
    ),
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MAJOR_VIEIRA);
  const user = await criarUsuario('Canoinhas');
  await entrar(page, user.email);
  await posicaoDecidida(page, 'granted');
  await campo(page).fill(
    'iria na feirinha, tomar um cafe e levar a minha mulher cortar o cabelo, tudo isso em canoinhas sc',
  );
  await page.getByRole('button', { name: 'Montar a viagem' }).click();

  // o andamento em palavras enquanto a IA procura, e nenhuma pergunta: a primeira rodada entregou
  await expect(page.locator('[data-option]')).toHaveCount(3, { timeout: 30_000 });
  expect(ia.pedidos).toHaveLength(1);
  // os passos na ordem dita (a feirinha primeiro), cada um com "n de 3"; a feirinha sem candidato
  const steps = page.locator('[data-step]');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText('1 de 3 · Feirinha');
  await expect(steps.nth(1)).toContainText('2 de 3 · Café');
  await expect(steps.nth(2)).toContainText('3 de 3 · Cortar o cabelo');
  await expect(page.getByText(/2 opções no mapa em Canoinhas/)).toBeVisible();
  // os cartões do Google: a nota, o aberto agora, o fechado agora
  const cafe = page.getByRole('button', { name: /^Café da Praça/ });
  await expect(cafe).toContainText('4,6 · 212 avaliações');
  await expect(cafe).toContainText('Aberto agora');
  await expect(page.getByRole('button', { name: /^Padaria do Centro/ })).toContainText(
    'Fechado agora',
  );
  // cada coisa pedida num estado, à vista: a feirinha pendente (com a pergunta), o café e o salão sem escolha
  await expect(page.locator('[data-fate="pending"]')).toHaveCount(2);
  await expect(page.locator('[data-pending-question]')).toContainText('Onde fica a feirinha?');
  await expect(page.locator('[data-summary]')).toHaveText(
    '0 escolhidos · 2 sem escolha: Café, Cortar o cabelo · 2 pendentes: Feirinha, A feirinha',
  );
  // "Tirar da viagem" o salão e o passo da feirinha sem candidato; a pergunta pendente fica; o café escolhido
  await page
    .getByRole('region', { name: 'Cortar o cabelo' })
    .getByRole('button', { name: 'Tirar da viagem' })
    .click();
  await page
    .getByRole('region', { name: 'Feirinha' })
    .getByRole('button', { name: 'Tirar da viagem' })
    .click();
  await cafe.click();
  await expect(page.locator('[data-summary]')).toHaveText(
    '1 escolhido · 1 pendente: A feirinha · 2 tirados: Feirinha, Cortar o cabelo',
  );
  await page.getByRole('button', { name: /^Traçar o caminho/ }).click();

  // a revisão: a feirinha entrou sem local, e a tela diz; a escrita recebeu o pendente como dado
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('[data-checked="faltou"]')).toContainText('A feirinha');
  await expect(page.getByRole('checkbox', { name: /^A feirinha/ })).toBeVisible();
  await expect(page.getByText('Sem local · dá para marcar depois')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Conferido no Google Maps')).toBeVisible();
  await expect(page.locator('[data-map-attribution]')).toContainText('Dados do Google Maps');
  const escrita1 = pedidos.find((p) => p.step === 'plan');
  expect(escrita1?.places?.chosen.map((c) => c.name)).toEqual(['Café da Praça']);
  expect(escrita1?.places?.pending).toEqual([
    { name: 'A feirinha', kind: 'other', why: 'not_found' },
  ]);

  // a viagem nasce com o café com coordenada e o place_id do Google, a feirinha sem, e sem o salão
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await expect
    .poll(
      async () =>
        (
          await linhas('stops', `trip_id=eq.${tripId}&select=name,lat,google_place_id&order=name`)
        ).map((s) => [s.name, s.lat !== null, s.google_place_id]),
      { timeout: 20_000 },
    )
    .toEqual([
      ['A feirinha', false, null],
      ['Café da Praça', true, 'g-cafe-praca'],
      ['Chegada em Major Vieira, SC', true, null],
      ['Saída de Major Vieira, SC', true, null],
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
