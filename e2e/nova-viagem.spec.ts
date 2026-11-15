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
import { fakeOpenMeteo, fakeOverpass } from './helpers/world.ts';

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
  // a viagem ainda não existe: a leitura foi sem viagem
  expect(pedido).toMatchObject({ trip_id: null, trip: null });

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

test('a conversa: as perguntas ditas antes, o roteiro conferido no mapa, um lugar que sai', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  const overpass = await fakeOverpass(context, [
    // o nome do mapa cobre o proposto ("caracol"); o restaurante com o mesmo nome não é cascata
    {
      name: 'Parque Estadual do Caracol, com a cascata de 131 metros e o observatório ecológico',
      lat: -29.3129,
      lng: -50.8519,
      tags: { tourism: 'attraction' },
    },
    { name: 'Restaurante Caracol', lat: -29.35, lng: -50.8, tags: { amenity: 'restaurant' } },
    { name: 'Gramado', lat: -29.3787, lng: -50.8737, tags: { place: 'town' } },
  ]);
  const proposta = plan(
    [
      {
        date: D[0] ?? '',
        title: 'Cascatas',
        stops: [
          stop('origin', 'Saída de Papanduva', 'Papanduva, SC', '07:00'),
          stop('nature', 'Cascata do Caracol', 'Canela, RS', '13:00'),
          stop('winery', 'Vinícola Inventada do Teste', 'Canela, RS', '16:00'),
        ],
      },
      {
        date: D[1] ?? '',
        title: 'Gramado',
        stops: [
          stop('city', 'Gramado', 'Gramado, RS', '10:00'),
          stop('origin', 'Chegada em Papanduva', 'Papanduva, SC', '20:00'),
        ],
      },
    ],
    [
      { text: 'Foto do time com a cascata ao fundo', stop_ref: 'Cascata do Caracol' },
      { text: 'Registrar o rótulo preferido', stop_ref: 'Vinícola Inventada do Teste' },
    ],
  );
  const pedidos: { step?: string; answers?: string[]; kind?: string }[] = [];
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(
      route,
      (body) =>
        (body as { step?: string }).step === 'ask'
          ? aiSse(JSON.stringify({ questions: [] }), {
              data: {
                questions: [
                  { text: 'Quantos dias vocês têm?', options: ['2 dias', '4 dias'] },
                  { text: 'Que passeio vocês curtem?', options: ['Natureza', 'Cidades'] },
                ],
              },
            })
          : aiPlan(proposta, {
              name: 'Serra em dezembro',
              start_date: D[0] ?? null,
              end_date: D[1] ?? null,
              origin: 'Papanduva/SC',
              budget: null,
            }),
      (body) => pedidos.push(body as { step?: string; answers?: string[]; kind?: string }),
    ),
  );
  const user = await criarUsuario('Conversa');
  await entrar(page, user.email);
  await campo(page).fill('Serra Gaúcha em dezembro, saindo de Papanduva');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();

  // as perguntas, ditas antes, com as opções e as palavras da pessoa
  await expect(page.getByText('Tenho 2 perguntas antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  await semRolagem(page, 'as perguntas');
  await axe(page, 'as perguntas');
  const montar = page.getByRole('button', { name: 'Montar a viagem' });
  await expect(montar).toBeDisabled();
  await page.getByRole('button', { name: '2 dias' }).click();
  await page.getByLabel('Ou com as suas palavras').nth(1).fill('cachoeiras e vinícolas');
  await montar.click();

  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  expect(pedidos.map((p) => p.step)).toEqual(['ask', 'plan']);
  expect(pedidos[1]).toMatchObject({ kind: 'plan', answers: ['2 dias', 'cachoeiras e vinícolas'] });
  // uma consulta ao Overpass na conversa inteira
  expect(overpass.count()).toBe(1);
  expect(overpass.last()).toContain('around:200000');
  // o que o mapa não confirmou saiu, e a revisão diz
  await expect(page.locator('[data-checked]')).toContainText(
    '1 lugar sugerido não foi encontrado no mapa e saiu: Vinícola Inventada do Teste.',
  );
  await expect(page.getByRole('checkbox', { name: 'Vinícola Inventada do Teste' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Cascata do Caracol' })).toBeVisible();
  await expect(page.getByText('Conferido no mapa (OpenStreetMap)').first()).toBeVisible();
  await semRolagem(page, 'a revisão da conversa');
  await axe(page, 'a revisão da conversa');

  await page.getByRole('button', { name: 'Criar a viagem' }).click();
  await expect(page).toHaveURL(/\/viagens\/[0-9a-f-]{36}\/detalhes$/);
  const tripId = page.url().split('/').at(-2) ?? '';
  await expect
    .poll(
      async () =>
        (await linhas('stops', `trip_id=eq.${tripId}&select=name,lat,source&order=name`)).map(
          (s) => [s.name, s.lat !== null, s.source],
        ),
      { timeout: 20_000 },
    )
    .toEqual([
      ['Cascata do Caracol', true, 'ai'],
      ['Chegada em Papanduva', true, 'ai'],
      ['Gramado', true, 'ai'],
      ['Saída de Papanduva', true, 'ai'],
    ]);
  // a missão do lugar que saiu saiu junto
  expect(
    (await linhas('checklist_items', `trip_id=eq.${tripId}&kind=eq.quest&select=text`)).map(
      (q) => q.text,
    ),
  ).toEqual(['Foto do time com a cascata ao fundo']);
});

test('quero sair hoje: a pergunta de alcance, a posição e o tempo na conta, e a viagem de hoje no mapa', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await nominatim(page);
  await fakeOpenMeteo(context);
  await fakeOverpass(context, [
    { name: 'Parque do Caracol', lat: -29.3129, lng: -50.8519, tags: { tourism: 'attraction' } },
    { name: 'Lago Negro', lat: -29.3922, lng: -50.8805, tags: { tourism: 'attraction' } },
  ]);
  const hoje = dateInSaoPaulo(0);
  let contexto: Record<string, unknown> | null = null;
  const hojeSse = aiPlan(
    plan([
      {
        date: hoje,
        title: 'Tarde na serra',
        stops: [
          stop('origin', 'Saída de Canela', 'Canela, RS', '13:00'),
          stop('nature', 'Cascata do Caracol', 'Canela, RS', '13:30'),
          stop('city', 'Lago Negro', 'Gramado, RS', '16:00'),
        ],
      },
    ]),
    {
      name: 'Tarde na serra',
      start_date: hoje,
      end_date: hoje,
      origin: 'Canela, RS',
      budget: null,
    },
  );
  await page.route('**/functions/v1/plan-trip', (route) =>
    respondSse(route, hojeSse, (body) => {
      const b = body as { kind?: string; context: Record<string, unknown> };
      contexto = { ...b.context, kind: b.kind };
    }),
  );
  const user = await criarUsuario('Hoje');
  await entrar(page, user.email);
  // a posição já tinha sido permitida no mapa (D176): no navegador e na pergunta do app
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -29.371234, longitude: -50.876543 });
  await page.evaluate(`new Promise((resolve, reject) => {
    const req = indexedDB.open('viajei');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('sync_state', 'readwrite');
      tx.objectStore('sync_state').put({ key: 'geo:asked', value: 'granted' });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => reject(tx.error);
    };
  })`);

  await campo(page).fill('quero sair hoje');
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  // com a posição, só o alcance
  await expect(page.getByText('Tenho 1 pergunta antes de montar.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Quanto tempo vocês têm?')).toBeVisible();
  await semRolagem(page, 'a pergunta de alcance');
  await page.getByRole('button', { name: 'O dia' }).click();
  await page.getByRole('button', { name: 'Montar a viagem' }).click();
  await expect(page.getByRole('heading', { name: 'Revisar a viagem' })).toBeVisible({
    timeout: 30_000,
  });
  // o que entrou na conta: a posição arredondada (uns 1 km), a cidade, o tempo e o alcance
  expect(contexto).toMatchObject({
    kind: 'today',
    position: { lat: -29.37, lng: -50.88 },
    place: 'Canela, RS',
    reach: 'day',
    weather: expect.stringContaining('16° a 28°, chuva 60%'),
  });
  await expect(page.locator('[data-checked="todos"]')).toBeVisible();
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
