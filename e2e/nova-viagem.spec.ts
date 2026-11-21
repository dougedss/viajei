import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { ImportData, ImportStop } from '../supabase/functions/_shared/import-schema.ts';
import { LARGURA_ESTREITA, ROLAGEM_LATERAL } from '../src/features/lab/guards.ts';
import { campo, entrar, novaViagem } from './helpers/app.ts';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { linhas } from './helpers/db.ts';
import { aiPlan, aiSse, respondSse } from './helpers/import.ts';
import { criarUsuario } from './helpers/users.ts';
import { posicaoDecidida } from './helpers/geo.ts';
import { fakeOpenMeteo } from './helpers/world.ts';
import { buscaNoMapa, lugar, rotaForjada } from './helpers/places.ts';
import { radiusFor, reachOf, readReach } from '../src/features/intake/reach.ts';
import {
  EMPTY_INTENT,
  type PlanIntent,
  type PlanPlaces,
  type PlanWrite,
} from '../supabase/functions/_shared/plan-protocol.ts';

/**
 * Criar a viagem conversando (fase 17): o campo no lugar do botão "Nova viagem" e do formulário, e os
 * três caminhos. O formato do Viajei, lido no aparelho sem rede; um roteiro em texto livre, pela
 * importação, que cria a viagem e pergunta as datas que o texto não deu; a conversa, com as perguntas
 * ditas antes e o roteiro conferido no mapa; a saída de hoje, com a posição e o tempo, que abre no
 * mapa. "Copiar roteiro como texto" e o pedido para outras IAs, pela área de transferência. Nenhuma
 * IA de verdade (a função respondida por `page.route`) e nenhum mapa de verdade (o Overpass e o
 * Nominatim respondidos aqui).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const D = [30, 31, 32, 33].map((n) => dateInSaoPaulo(n));
const br = (iso: string) => iso.split('-').reverse().join('/');

async function semRolagem(page: Page, onde: string): Promise<void> {
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde}: rolagem lateral`).toEqual([]);
  const size = page.viewportSize();
  if (!size) return;
  await page.setViewportSize({ width: LARGURA_ESTREITA, height: size.height });
  expect(await page.evaluate<string[]>(ROLAGEM_LATERAL), `${onde} a 360 px`).toEqual([]);
  await page.setViewportSize(size);
}

async function axe(page: Page, onde: string): Promise<void> {
  const res = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const graves = res.violations.filter((v) => v.impact !== 'minor');
  expect(
    graves.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    `axe em ${onde}`,
  ).toEqual([]);
}

/** O seed no formato do Viajei, com as datas 30 dias à frente (D33: nada de viagem de hoje). */
function seedViajei(): string {
  const map: Record<string, string> = {
    '11': br(D[0] ?? ''),
    '12': br(D[1] ?? ''),
    '13': br(D[2] ?? ''),
    '14': br(D[3] ?? ''),
    '08': br(dateInSaoPaulo(27)),
  };
  return readFileSync('supabase/seed/viagem-rs.viajei', 'utf8').replace(
    /\b(08|11|12|13|14)\/12\/2026\b/g,
    (_m, d: string) => map[d] ?? _m,
  );
}

const stop = (
  kind: ImportStop['kind'],
  name: string,
  address: string | null,
  time: string | null = null,
): ImportStop => ({
  time,
  kind,
  name,
  address,
  closes_at: null,
  travel_minutes_to_next: null,
  notes: null,
  url: null,
  lat: null,
  lng: null,
});
const plan = (days: ImportData['days'], quests: ImportData['quests'] = []): ImportData => ({
  days,
  reservations: [],
  contacts: [],
  checklist_before: [],
  checklist_pack: [],
  quests,
  unclassified: [],
});

/** O Nominatim de mentira: a cidade para qualquer busca (a saída), nada para o lugar inventado. */
async function nominatim(page: Page): Promise<void> {
  await page.route('https://nominatim.openstreetmap.org/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/reverse')) {
      await route.fulfill({
        json: { address: { town: 'Canela', 'ISO3166-2-lvl4': 'BR-RS' } },
        headers: { 'access-control-allow-origin': '*' },
      });
      return;
    }
    const q = url.searchParams.get('q') ?? '';
    await route.fulfill({
      json: /inventad/i.test(q)
        ? []
        : [
            {
              display_name: `${q}, Rio Grande do Sul, Brasil`,
              name: q,
              lat: '-29.36',
              lon: '-50.81',
            },
          ],
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

test('o campo no lugar do botão: sem formulário, e /viagens/nova sem nada volta ao campo', async ({
  page,
}) => {
  const user = await criarUsuario('Campo');
  await entrar(page, user.email);
  await expect(page.getByRole('link', { name: 'Nova viagem' })).toHaveCount(0);
  await expect(campo(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Montar a viagem' })).toBeDisabled();
  await expect(page.getByText('Nenhuma viagem ainda')).toBeVisible();

  // o campo cresce com o texto e não empurra nada para o lado, nem com uma linha sem espaço
  await campo(page).fill(`Serra ${'a'.repeat(120)}\n${'linha\n'.repeat(12)}`);
  expect((await campo(page).boundingBox())?.height ?? 0).toBeGreaterThan(150);
  await semRolagem(page, '/viagens com o campo cheio');
  await axe(page, '/viagens');
  await campo(page).fill('');

  // a rota de antes não é mais o formulário: sem nada a fazer, volta à lista com o campo em foco
  await page.goto('/viagens/nova');
  await expect(page).toHaveURL(/\/viagens$/);
  await expect(campo(page)).toBeFocused();
});

test('o formato do Viajei colado sem rede vira a viagem inteira, e sobe quando a rede volta', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const user = await criarUsuario('Formato');
  await entrar(page, user.email);
  // uma viagem pelo campo com rede, só para as telas (chunks lazy) já estarem no navegador: no dev
  // não há service worker, e recarregar sem rede não abriria nada
  await novaViagem(page, { nome: `Aquecimento ${String(Date.now())}`, inicio: 40, fim: 40 });
  await page.getByRole('link', { name: 'Início' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();

  await context.setOffline(true);
  await campo(page).fill(seedViajei());
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible();
  // o cabeçalho veio do texto: nada a perguntar
  const viagem = page.getByRole('region', { name: 'A viagem' });
  await expect(viagem.getByLabel('Nome da viagem')).toHaveValue('RS — concurso em Montenegro');
  await expect(viagem.locator('[data-asked]')).toHaveCount(0);
  await expect(
    page.getByText('4 dias · 18 paradas · 2 reservas · 6 contatos · 4 missões'),
  ).toBeVisible();
  await semRolagem(page, 'a revisão da viagem nova');
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await expect(page.getByRole('heading', { name: 'RS — concurso em Montenegro' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sem conexão/ })).toBeVisible();

  await context.setOffline(false);
  await expect
    .poll(async () => (await linhas('stops', `trip_id=eq.${tripId}&select=id`)).length, {
      timeout: 30_000,
    })
    .toBe(18);
  const [trip] = await linhas('trips', `id=eq.${tripId}&select=start_date,end_date,origin,budget`);
  expect(trip).toEqual({ start_date: D[0], end_date: D[3], origin: 'Papanduva/SC', budget: 3000 });
  // pelo formato do Viajei, ninguém leu com IA
  expect(
    new Set((await linhas('stops', `trip_id=eq.${tripId}&select=source`)).map((s) => s.source)),
  ).toEqual(new Set(['user']));
  expect(await linhas('reservations', `trip_id=eq.${tripId}&select=id`)).toHaveLength(2);
});

test('um roteiro em texto livre: a importação cria a viagem e pergunta as datas que o texto não deu', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await nominatim(page);
  // a IA leu um texto sem data: os dias contam de amanhã, e o bloco da viagem volta sem datas
  const lida = plan([
    {
      date: dateInSaoPaulo(1),
      title: 'Ida',
      stops: [
        stop('origin', 'Saída de Papanduva', 'Papanduva, SC', '07:00'),
        stop('nature', 'Park Salto Ventoso', 'Farroupilha, RS', '13:30'),
      ],
    },
    {
      date: dateInSaoPaulo(2),
      title: 'Cascatas',
      stops: [
        stop('nature', 'Cascata do Caracol', 'Canela, RS', '09:00'),
        stop('origin', 'Chegada em Papanduva', 'Papanduva, SC', '20:00'),
      ],
    },
  ]);
  let pedido: unknown = null;
  await page.route('**/functions/v1/import-itinerary', (route) =>
    respondSse(
      route,
      aiPlan(lida, {
        name: 'Fim de semana na serra',
        start_date: null,
        end_date: null,
        origin: 'Papanduva/SC',
        budget: null,
      }),
      (body) => {
        pedido = body;
      },
    ),
  );
  const user = await criarUsuario('Livre');
  await entrar(page, user.email);
  await campo(page).fill(
    [
      '*Fim de semana na serra* 🚗',
      'Saindo de Papanduva/SC.',
      'Sábado: 7h saída. 13h30 Park Salto Ventoso, Farroupilha.',
      'Domingo: 9h Cascata do Caracol, Canela. 20h chegada em casa.',
    ].join('\n'),
  );
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 20_000,
  });
  // a viagem ainda não existe: a leitura foi sem viagem, com o texto do campo
  expect(pedido).toMatchObject({
    trip_id: null,
    trip: null,
    text: expect.stringContaining('*Fim de semana na serra*'),
  });

  const viagem = page.getByRole('region', { name: 'A viagem' });
  await expect(viagem.locator('[data-asked]')).toContainText('Falta 1 coisa');
  await expect(viagem.locator('[data-asked]')).toContainText('as datas');
  const comeco = viagem.getByLabel('O texto não diz quando. A viagem começa em');
  await expect(comeco).toHaveValue(dateInSaoPaulo(1));
  await comeco.fill(D[0] ?? '');
  // os dias andaram juntos
  await expect(
    page.getByRole('region', { name: new RegExp(br(D[0] ?? '').slice(0, 5)) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await expect(page.getByRole('heading', { name: 'Fim de semana na serra' })).toBeVisible();
  await expect
    .poll(
      async () => (await linhas('trips', `id=eq.${tripId}&select=start_date,end_date,origin`))[0],
      {
        timeout: 20_000,
      },
    )
    .toEqual({ start_date: D[0], end_date: D[1], origin: 'Papanduva/SC' });
  await expect
    .poll(async () => (await linhas('stops', `trip_id=eq.${tripId}&select=source`)).length)
    .toBe(4);
});

// ---------------------------------------------------------------- a conversa nova (fase 24)
const PAPANDUVA = { lat: -26.37, lng: -50.144 };
const MAHLZEIT = lugar(
  'mahlzeit',
  'Mahlzeit Café Colonial',
  -26.73,
  -49.18,
  ['catering', 'catering.cafe'],
  'Pomerode',
  'Tu-Su 13:00-19:00',
);
const TORTEN = lugar('torten', 'Torten Paradies Café Colonial', -26.7404, -49.1718, [
  'catering',
  'catering.cafe',
]);
const BAUER = lugar('bauer', 'Café Colonial Bauer', -26.76, -49.16, [
  'catering',
  'catering.restaurant',
]);
// o nome sem "colonial": a busca é por palavra do nome, e a tela não mostra
const CENTRO = lugar('centro', 'Café do Centro', -26.74, -49.17, ['catering', 'catering.cafe']);
const ZOO = lugar('zoo', 'Bioparque Zoo Pomerode', -26.7302, -49.1745, [
  'entertainment',
  'entertainment.zoo',
]);
const MUSEU = lugar(
  'museu',
  'Museu da Imigração',
  -26.555,
  -49.66,
  ['entertainment', 'entertainment.museum'],
  'São Bento do Sul',
);

/** O Nominatim da conversa nova: a origem, a cidade da posição e o nomeado com dois no mapa. */
async function nominatimDaConversa(page: Page): Promise<void> {
  await page.route('https://nominatim.openstreetmap.org/**', async (route: Route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname.startsWith('/reverse')) {
      await route.fulfill({
        json: { address: { town: 'Canela', 'ISO3166-2-lvl4': 'BR-RS' } },
        headers,
      });
      return;
    }
    const q = url.searchParams.get('q') ?? '';
    const row = (name: string, lat: number, lon: number, category = 'place', type = 'town') => ({
      display_name: `${name}, Santa Catarina, Brasil`,
      name,
      lat: String(lat),
      lon: String(lon),
      category,
      type,
    });
    // os lugares antes da cidade: a busca de um lugar pode levar a cidade junto
    const json = /bioparque/i.test(q)
      ? [
          row('Bioparque Zoo Pomerode', -26.7302, -49.1745, 'tourism', 'zoo'),
          row('Bioparque Zoo Fazenda', -27.5, -48.6, 'tourism', 'zoo'),
        ]
      : /torten/i.test(q)
        ? [row('Torten Paradies', -26.7404, -49.1718, 'amenity', 'cafe')]
        : /papanduva/i.test(q)
          ? [row('Papanduva', PAPANDUVA.lat, PAPANDUVA.lng)]
          : [];
    await route.fulfill({ json, headers });
  });
}

/** O passo das perguntas da IA (fase 24): as perguntas e a vontade, como o `done` leva. */
function perguntas(
  questions: { topic: string; text: string; options: string[] }[],
  intent: Partial<PlanIntent>,
): string {
  const data = { questions, intent: { ...EMPTY_INTENT, ...intent } };
  return aiSse(JSON.stringify(data), { data });
}

/** A viagem escrita sobre as escolhas: só textos e referências, como o `done` leva. */
function escrita(write: PlanWrite): string {
  return aiSse(JSON.stringify(write), { data: write });
}

type PlanBody = {
  step?: string;
  text?: string;
  kind?: string;
  places?: PlanPlaces;
  context: Record<string, unknown>;
};

test('a conversa nova: uma pergunta, as opções do mapa, a escolha, as sugestões desligadas, e a viagem com exatamente o escolhido', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatimDaConversa(page);
  await rotaForjada(context);
  const mapa = await buscaNoMapa(context, (body) =>
    body.area.type === 'circle' && body.names?.includes('colonial')
      ? [TORTEN, MAHLZEIT, CENTRO, BAUER]
      : [ZOO, MUSEU, MAHLZEIT],
  );
  const pedidos: PlanBody[] = [];
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      (body) =>
        (body as PlanBody).step === 'ask'
          ? perguntas([{ topic: 'origin', text: 'De onde vocês saem?', options: [] }], {
              wants: [{ words: 'café colonial', kind: 'food' }],
            })
          : escrita({
              trip: {
                name: 'Café colonial na serra',
                start_date: D[0] ?? null,
                end_date: D[0] ?? null,
              },
              days: [
                {
                  date: D[0] ?? null,
                  title: 'Cucas e cafés',
                  start: '12:30',
                  stops: [{ ref: 'e1', note: 'café colonial da colonização alemã' }],
                },
              ],
              suggestions: [
                { ref: 's1', note: 'um passeio no caminho' },
                { ref: 's2', note: 'outro passeio no caminho' },
              ],
              quests: [{ text: 'Foto do time com a cuca mais alta', ref: 'e1' }],
              checklist_before: ['Conferir se abre no dia'],
              checklist_pack: ['Casaco'],
            }),
      (body) => pedidos.push(body as PlanBody),
    ),
  );
  const user = await criarUsuario('CafeColonial');
  await entrar(page, user.email);
  // a pergunta de posição (fase 25) já respondida com "agora não": a conversa de antes, sem o cartão
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café colonial');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();

  // uma pergunta, dita antes: só o que falta para buscar
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('A resposta').fill('Papanduva, SC');
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();

  // as opções que existem no mapa: três, com a cidade, o tempo de carro e o horário quando o mapa tem
  const opcoes = page.locator('[data-option]');
  await expect(opcoes).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByText('Café do Centro')).toHaveCount(0);
  await expect(page.getByText('Horário no mapa: ter a dom, 13:00–19:00')).toBeVisible();
  await expect(page.getByText(/cerca de \d+ h( \d+)? de carro/).first()).toBeVisible();
  await expect(page.locator('[data-map-attribution]')).toContainText('Powered by Geoapify');
  await semRolagem(page, 'as opções');
  await axe(page, 'as opções');
  // a busca por tipo: as categorias da tabela, a palavra do nome, a posição arredondada
  expect(mapa.pedidos.find((p) => p.names?.includes('colonial'))).toMatchObject({
    categories: ['catering.cafe', 'catering.restaurant'],
    names: ['colonial'],
    area: { type: 'circle', lng: -50.14, lat: -26.37, radius_m: 200_000 },
  });
  const tracar = page.getByRole('button', { name: /^Traçar o caminho/ });
  await expect(tracar).toBeDisabled();
  await page.getByRole('button', { name: /^Mahlzeit Café Colonial/ }).click();
  await expect(page.getByRole('button', { name: /^Mahlzeit Café Colonial/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await tracar.click();

  // a revisão: as sugestões desligadas, com o desvio; uma ligada
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  const zoo = page.getByRole('checkbox', { name: 'Bioparque Zoo Pomerode, sugestão no caminho' });
  const museu = page.getByRole('checkbox', { name: 'Museu da Imigração, sugestão no caminho' });
  await expect(zoo).toHaveAttribute('aria-checked', 'false');
  await expect(museu).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(/Sugestão · cerca de \d+ min de desvio/).first()).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Mahlzeit Café Colonial', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await semRolagem(page, 'a revisão com as sugestões');
  await axe(page, 'a revisão com as sugestões');
  await zoo.click();
  await expect(zoo).toHaveAttribute('aria-checked', 'true');

  // a leitura que escreveu recebeu as escolhas e as sugestões do mapa, e nada mais
  expect(pedidos.map((p) => p.step)).toEqual(['ask', 'plan']);
  expect(pedidos[1]?.places?.chosen.map((c) => c.name)).toEqual(['Mahlzeit Café Colonial']);
  expect(pedidos[1]?.places?.suggestions.map((c) => c.name).sort()).toEqual([
    'Bioparque Zoo Pomerode',
    'Museu da Imigração',
  ]);

  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  // exatamente a saída, o café, a sugestão ligada e a chegada, com as coordenadas do mapa
  await expect
    .poll(
      async () =>
        (await linhas('stops', `trip_id=eq.${tripId}&select=name,kind,lat,source&order=name`)).map(
          (s) => [s.name, s.kind, s.lat !== null, s.source],
        ),
      { timeout: 20_000 },
    )
    .toEqual([
      ['Bioparque Zoo Pomerode', 'nature', true, 'ai'],
      ['Chegada em Papanduva, SC', 'origin', true, 'ai'],
      ['Mahlzeit Café Colonial', 'food', true, 'ai'],
      ['Saída de Papanduva, SC', 'origin', true, 'ai'],
    ]);
});

test('o lugar nomeado com dois no mapa: "Escolher o local", nunca o chute', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await nominatimDaConversa(page);
  await buscaNoMapa(context, () => []);
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      perguntas([], {
        named: [{ name: 'Bioparque', city: null, kind: 'nature' }],
        origin: 'Papanduva, SC',
      }),
    ),
  );
  const user = await criarUsuario('Nomeado');
  await entrar(page, user.email);
  // a pergunta de posição (fase 25) já respondida com "agora não": a conversa de antes, sem o cartão
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero passar no Bioparque, saindo de Papanduva');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  const escolher = page.getByRole('radiogroup', { name: 'Bioparque' });
  await expect(page.getByText('Escolher o local (2)')).toBeVisible({ timeout: 20_000 });
  await expect(escolher.getByRole('radio')).toHaveCount(3);
  const tracar = page.getByRole('button', { name: /^Traçar o caminho/ });
  await expect(tracar).toBeDisabled();
  await axe(page, 'a escolha do local');
  await escolher.getByRole('radio', { name: /^Bioparque Zoo Pomerode/ }).click();
  await expect(tracar).toBeEnabled();
});

test('nenhuma opção ao alcance: a tela diz, oferece procurar mais longe, e não há viagem vazia', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await nominatimDaConversa(page);
  const mapa = await buscaNoMapa(context, () => []);
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      perguntas([], { wants: [{ words: 'café colonial', kind: 'food' }], origin: 'Papanduva, SC' }),
    ),
  );
  const user = await criarUsuario('Nenhuma');
  await entrar(page, user.email);
  // a pergunta de posição (fase 25) já respondida com "agora não": a conversa de antes, sem o cartão
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café colonial, saindo de Papanduva');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByText(/^Não achei café colonial a até .* de Papanduva, SC\.$/)).toBeVisible(
    {
      timeout: 20_000,
    },
  );
  await expect(page.getByRole('button', { name: /^Traçar o caminho/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Criar a viagem' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Procurar mais longe' }).click();
  await expect(page.getByText(/^Não achei café colonial a até/)).toBeVisible({ timeout: 20_000 });
  // cada procura são duas buscas (pelo nome "colonial" e pela cozinha regional), no mesmo raio
  expect(mapa.pedidos.map((p) => (p.area.type === 'circle' ? p.area.radius_m : 0))).toEqual([
    200_000, 200_000, 400_000, 400_000,
  ]);
  // no teto, não há mais longe: só mudar o pedido
  await expect(page.getByRole('button', { name: 'Procurar mais longe' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mudar o pedido' })).toBeVisible();
});

test('a busca no mapa sem fonte (no_source): o aviso, e a busca pelo nome segue', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatimDaConversa(page);
  await rotaForjada(context);
  await buscaNoMapa(context, () => ({ status: 503, code: 'no_source' }));
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, (body) =>
      (body as PlanBody).step === 'ask'
        ? perguntas([], {
            wants: [{ words: 'café colonial', kind: 'food' }],
            origin: 'Papanduva, SC',
          })
        : escrita({
            trip: { name: 'Café', start_date: D[0] ?? null, end_date: D[0] ?? null },
            days: [
              {
                date: D[0] ?? null,
                title: null,
                start: '13:00',
                stops: [{ ref: 'n1', note: null }],
              },
            ],
            suggestions: [],
            quests: [],
            checklist_before: [],
            checklist_pack: [],
          }),
    ),
  );
  const user = await criarUsuario('SemFonte');
  await entrar(page, user.email);
  // a pergunta de posição (fase 25) já respondida com "agora não": a conversa de antes, sem o cartão
  await posicaoDecidida(page, 'declined');
  await campo(page).fill('quero ir num café colonial, saindo de Papanduva');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByText(/Não deu para buscar no mapa pelo tipo agora/)).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('Procurar pelo nome do lugar').fill('Torten Paradies');
  await page.getByRole('button', { name: 'Procurar', exact: true }).click();
  await expect(page.locator('[data-named="found"]')).toContainText('Torten Paradies', {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /^Traçar o caminho/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.getByRole('checkbox', { name: 'Torten Paradies', exact: true }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText(/sugestão no caminho/)).toHaveCount(0);
});

test('quero sair hoje: a pergunta de alcance, as opções em volta da posição, e a viagem de hoje no mapa', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatimDaConversa(page);
  await fakeOpenMeteo(context);
  await rotaForjada(context);
  const hoje = dateInSaoPaulo(0);
  const mapa = await buscaNoMapa(context, (body) =>
    body.names?.includes('colonial')
      ? [
          lugar(
            'serrano',
            'Café Colonial Serrano',
            -29.36,
            -50.85,
            ['catering', 'catering.cafe'],
            'Canela',
          ),
        ]
      : [],
  );
  let contexto: Record<string, unknown> | null = null;
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      escrita({
        trip: { name: 'Tarde de café', start_date: hoje, end_date: hoje },
        days: [
          { date: hoje, title: 'Tarde de café', start: null, stops: [{ ref: 'e1', note: null }] },
        ],
        suggestions: [],
        quests: [],
        checklist_before: [],
        checklist_pack: [],
      }),
      (body) => {
        const b = body as PlanBody;
        contexto = { ...b.context, kind: b.kind, text: b.text, step: b.step };
      },
    ),
  );
  const user = await criarUsuario('Hoje');
  await entrar(page, user.email);
  // a posição já tinha sido permitida no mapa (D176): no navegador e na pergunta do app
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -29.371234, longitude: -50.876543 });
  await posicaoDecidida(page, 'granted');

  await campo(page).fill('quero sair hoje para um café colonial');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  // com a posição, só o alcance (a pergunta do app, sem IA)
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Quanto tempo vocês têm?')).toBeVisible();
  await semRolagem(page, 'a pergunta de alcance');
  // as opções mudam com a hora de agora (fase 25, D275): a primeira que o app oferece, e o raio dela
  const alcance = page.getByRole('group', { name: 'Quanto tempo vocês têm?' }).getByRole('button');
  const opcao = (await alcance.first().textContent()) ?? '';
  await alcance.first().click();
  await page.getByRole('button', { name: 'Procurar no mapa' }).click();
  // o tipo saiu do texto, pela tabela, e a busca foi em volta da posição arredondada (uns 1 km)
  await expect(page.locator('[data-option]')).toHaveCount(1, { timeout: 20_000 });
  expect(mapa.pedidos.find((p) => p.names?.includes('colonial'))).toMatchObject({
    names: ['colonial'],
    area: {
      type: 'circle',
      lng: -50.88,
      lat: -29.37,
      radius_m: radiusFor('today', readReach(opcao)) * 1000,
    },
  });
  await page.getByRole('button', { name: /^Café Colonial Serrano/ }).click();
  await page.getByRole('button', { name: /^Traçar o caminho/ }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  // o que foi para a IA: a posição arredondada, a cidade, o tempo e o alcance; uma leitura só
  expect(contexto).toMatchObject({
    step: 'plan',
    kind: 'today',
    text: 'quero sair hoje para um café colonial',
    position: { lat: -29.37, lng: -50.88 },
    place: 'Canela, RS',
    reach: reachOf(readReach(opcao)),
    weather: expect.stringContaining('16° a 28°, chuva 60%'),
  });
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  // a viagem de hoje abre no mapa (D174)
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('region', { name: 'Agora' })).toBeVisible({ timeout: 20_000 });
});

test('o pedido para outras IAs e "Copiar roteiro como texto", pela área de transferência', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const user = await criarUsuario('Copiar');
  await entrar(page, user.email);
  const lida = () => page.evaluate<string>('navigator.clipboard.readText()');

  await page
    .getByRole('button', { name: 'Montou a viagem com outra IA? Copie este pedido' })
    .click();
  await expect(page.getByText('Pedido copiado')).toBeVisible();
  const pedido = await lida();
  expect(pedido).toContain('formato do Viajei');
  expect(pedido).toContain('viajei/1');
  expect(pedido).toContain('Nunca escreva coordenadas');

  // a viagem do texto vai ao banco do aparelho e volta igual, como texto
  const texto = seedViajei();
  await campo(page).fill(texto);
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/detalhes$/);
  await page.getByRole('button', { name: 'Copiar roteiro como texto' }).click();
  await expect(page.getByText('Roteiro copiado')).toBeVisible();
  const copiado = await lida();
  // os dias saem na ordem do roteiro; reservas e contatos não têm ordem no banco
  const dias = (t: string) => t.slice(0, t.indexOf('## Reservas'));
  expect(dias(copiado)).toBe(dias(texto));
  expect(copiado.split('\n').sort()).toEqual(texto.split('\n').sort());
});
