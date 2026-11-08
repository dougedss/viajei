import { join } from 'node:path';
import type { BrowserContext, Locator, Page } from '@playwright/test';
import { LAB_SCENARIOS, type LabScenario } from '../../src/features/lab/scenarios.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { openPeer, signInPage, TIMEOUT, type App } from './app.ts';
import { must } from './client.ts';
import type { Check } from './evaluate.ts';
import { makePdf, makePng } from './files.ts';
import { ROAD, type Road } from './road.ts';
import { sleep, type Session } from './session.ts';

/**
 * O roteiro manual das fases 7 e 8 no navegador (D91): listas, missões, contatos, gastos, reservas
 * sem rede, a memória com foto sem sinal e sair com coisa pendente. Dois aparelhos: o lab-a, o
 * mesmo navegador dos cenários de avisos, e o lab-b, um segundo contexto que só olha o que o sync
 * trouxe. Cada cenário para no primeiro passo que falha e deixa o print dos dois aparelhos; um
 * cenário que depende de outro é pulado se o outro não passou.
 */
export const ROAD_SCENARIOS = [
  'app_listas',
  'app_contatos',
  'app_agora_reserva',
  'app_reserva_offline',
  'app_missoes',
  'app_memoria',
  'app_gastos',
  'app_sair_pendente',
] as const satisfies readonly LabScenario[];
type RoadScenario = (typeof ROAD_SCENARIOS)[number];

/** Quem precisa de quem: os três depois da chegada à cascata, que acontece em `app_missoes`. */
const NEEDS: Partial<Record<RoadScenario, RoadScenario[]>> = {
  app_memoria: ['app_missoes'],
  app_gastos: ['app_missoes'],
  app_sair_pendente: ['app_missoes'],
};

export type RoadContext = {
  app: App;
  a: Session;
  road: Road;
  /** o lab-b no navegador: e-mail e senha derivada */
  peer: { email: string; password: string };
  bypass: string | null;
};

type Step = { step: string; ok: boolean; detail?: string };
type Steps = [string, () => Promise<void>][];
const SLOW = 45_000;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const startsWith = (s: string) => new RegExp(`^${esc(s)}`);

async function until<T>(
  read: () => Promise<T>,
  ok: (v: T) => boolean,
  what: string,
  timeout = 20_000,
): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await read();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error(`${what} (último: ${JSON.stringify(v).slice(0, 200)})`);
    await sleep(1_000);
  }
}

async function isChecked(locator: Locator): Promise<void> {
  const end = Date.now() + TIMEOUT;
  while ((await locator.getAttribute('aria-checked')) !== 'true') {
    if (Date.now() > end) throw new Error('o item não ficou marcado');
    await sleep(300);
  }
}

class RoadRun {
  readonly ctx: RoadContext;
  readonly url: string;
  #peer: Promise<{ context: BrowserContext; page: Page }> | null = null;
  #peerPage: Page | null = null;

  constructor(ctx: RoadContext) {
    this.ctx = ctx;
    this.url = ctx.app.target.appUrl;
  }

  get page(): Page {
    return this.ctx.app.page;
  }

  trip(id: string, path = ''): string {
    return `${this.url}/viagens/${id}${path}`;
  }

  /** Abre uma tela no lab-a, entrando de novo se a sessão tiver caído. */
  async goA(path: string): Promise<void> {
    await this.page.goto(path);
    if (new URL(this.page.url()).pathname.startsWith('/entrar')) {
      const t = this.ctx.app.target;
      await signInPage(this.page, t.appUrl, t.email, t.password);
      await this.page.goto(path);
    }
  }

  /** O lab-b, aberto uma vez, na primeira vez que um cenário precisa dele. */
  async peer(): Promise<Page> {
    this.#peer ??= openPeer(
      this.ctx.app.browser,
      this.url,
      this.ctx.bypass,
      this.ctx.peer.email,
      this.ctx.peer.password,
    );
    const { page } = await this.#peer;
    this.#peerPage = page;
    return page;
  }

  async offline(on: boolean): Promise<void> {
    await this.ctx.app.context.setOffline(on);
  }

  async run(
    scenario: RoadScenario,
    ok: string,
    steps: Steps,
    cleanup?: () => Promise<void>,
  ): Promise<Check> {
    const startedAt = Date.now();
    const done: Step[] = [];
    for (const [step, fn] of steps) {
      try {
        await fn();
        done.push({ step, ok: true });
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? '';
        done.push({ step, ok: false, detail: message.slice(0, 300) });
        const dir = this.ctx.app.target.artifactsDir;
        await this.page
          .screenshot({ path: join(dir, `${scenario}-a.png`), fullPage: true })
          .catch(() => undefined);
        await this.#peerPage
          ?.screenshot({ path: join(dir, `${scenario}-b.png`), fullPage: true })
          .catch(() => undefined);
        break;
      }
    }
    if (cleanup) await cleanup().catch(() => undefined);
    const failed = done.find((s) => !s.ok);
    return {
      scenario,
      status: failed ? 'fail' : 'pass',
      latency_ms: Date.now() - startedAt,
      detail: failed ? `${failed.step}: ${failed.detail ?? 'não aconteceu'}` : ok,
      data: { passos: done },
    };
  }

  async close(): Promise<void> {
    const peer = await this.#peer?.catch(() => null);
    await peer?.context.close().catch(() => undefined);
  }
}

// ------------------------------------------------------------------ listas
function appListas(r: RoadRun): Promise<Check> {
  const { listas } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  return r.run(
    'app_listas',
    'A fechou Antes e Mala e viu "Pronto para partir"; B viu tudo marcado por Lab A e o selo',
    [
      [
        'A abre as listas',
        async () => {
          await r.goA(r.trip(listas.trip, '/checklists'));
          await page
            .getByRole('checkbox', { name: startsWith(listas.before[0]) })
            .waitFor({ timeout: SLOW });
        },
      ],
      [
        'A marca os dois de antes',
        async () => {
          for (const text of listas.before) {
            const box = page.getByRole('checkbox', { name: startsWith(text) });
            await box.click();
            await isChecked(box);
          }
        },
      ],
      [
        'A fecha a mala: "Pronto para partir"',
        async () => {
          await page.getByRole('tab', { name: /^Mala/ }).click();
          const box = page.getByRole('checkbox', { name: startsWith(listas.pack) });
          await box.click();
          await isChecked(box);
          const ready = page.getByRole('dialog', { name: 'Pronto para partir' });
          await ready.waitFor();
          await ready.getByRole('button', { name: 'Fechar' }).click();
          await ready.waitFor({ state: 'detached' });
        },
      ],
      [
        'o servidor tem os três marcados por Lab A',
        async () => {
          await until(
            async () =>
              must(
                await a.client
                  .from('checklist_items')
                  .select('done_by')
                  .eq('trip_id', listas.trip)
                  .is('deleted_at', null)
                  .not('done_at', 'is', null),
                'itens marcados',
              ),
            (rows) => rows.length === 3 && rows.every((x) => x.done_by === a.uid),
            'os três itens marcados não chegaram ao servidor',
          );
        },
      ],
      [
        'B vê os três marcados por Lab A (e a festa uma vez no aparelho dele)',
        async () => {
          const b = await r.peer();
          await b.goto(r.trip(listas.trip, '/checklists'));
          for (const text of listas.before) {
            const box = b.getByRole('checkbox', { name: startsWith(text) });
            await box.waitFor({ timeout: SLOW });
            await isChecked(box);
            if (!(await box.innerText()).includes('Lab A'))
              throw new Error(`"${text}" sem "Lab A"`);
          }
          const ready = b.getByRole('dialog', { name: 'Pronto para partir' });
          await ready.waitFor();
          await ready.getByRole('button', { name: 'Fechar' }).click();
          await b.getByRole('tab', { name: /^Mala/ }).click();
          await isChecked(b.getByRole('checkbox', { name: startsWith(listas.pack) }));
        },
      ],
      [
        'B vê o selo em Detalhes',
        async () => {
          const b = await r.peer();
          await b.goto(r.trip(listas.trip, '/detalhes'));
          await b
            .getByRole('link', { name: /Pronto para partir\s+As duas listas estão fechadas/ })
            .waitFor();
        },
      ],
    ],
  );
}

// ------------------------------------------------------------------ contatos
function appContatos(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const page = r.page;
  const href = async (name: string, expected: string) => {
    const link = page.getByRole('link', { name, exact: true });
    await link.waitFor();
    const got = await link.getAttribute('href');
    if (got !== expected) throw new Error(`"${name}" leva a ${got ?? 'nada'}, e não a ${expected}`);
  };
  const { contact, ingresso, pousada } = ROAD.estrada;
  return r.run(
    'app_contatos',
    'Ligar e WhatsApp nos href certos, o telefone da reserva sem repetir e a emergência no topo',
    [
      [
        'abrir os contatos da estrada',
        async () => {
          await r.goA(r.trip(estrada.trip, '/contatos'));
          await page
            .getByRole('link', { name: `Ligar para ${contact.name}`, exact: true })
            .waitFor({ timeout: SLOW });
        },
      ],
      [
        'ligar e WhatsApp do contato',
        async () => {
          await href(`Ligar para ${contact.name}`, `tel:${contact.phone}`);
          await href(`WhatsApp de ${contact.name}`, `https://wa.me/${contact.phone.slice(1)}`);
        },
      ],
      [
        'o telefone da reserva igual ao do contato não se repete',
        async () => {
          const same = await page.locator(`a[href="tel:${contact.phone}"]`).count();
          if (same !== 1) throw new Error(`${same} entradas com ${contact.phone}`);
          if ((await page.getByText(pousada.name, { exact: true }).count()) > 0) {
            throw new Error(`"${pousada.name}" apareceu como entrada própria`);
          }
          await page.getByText('também na reserva').first().waitFor();
        },
      ],
      [
        'o telefone de outra reserva aparece "da reserva"',
        async () => {
          await href(`Ligar para ${ingresso.name}`, `tel:${ingresso.phone}`);
          const row = page.getByRole('listitem').filter({ hasText: ingresso.name });
          if (!(await row.innerText()).includes('da reserva')) throw new Error('sem "da reserva"');
        },
      ],
      [
        'a emergência, só com ligar',
        async () => {
          for (const [name, number] of [
            ['SAMU', '192'],
            ['Bombeiros', '193'],
            ['Polícia Militar', '190'],
            ['Polícia Rodoviária Federal', '191'],
          ] as const) {
            await href(`Ligar para ${name}, ${number}`, `tel:${number}`);
          }
        },
      ],
    ],
  );
}

// ------------------------------------------------------------------ "Ver reserva" no "Agora"
function appAgoraReserva(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const page = r.page;
  const { pousada } = ROAD.estrada;
  return r.run('app_agora_reserva', '"Ver reserva" no "Agora" abriu a reserva com o código', [
    [
      'abrir o "Agora" da estrada',
      async () => {
        await r.goA(`${r.trip(estrada.trip)}?render=list`);
        await page.getByRole('heading', { name: 'Agora' }).waitFor({ timeout: SLOW });
      },
    ],
    [
      '"Ver reserva" da próxima parada',
      async () => {
        // o chip da barra do "Agora" (fase 14): "Ver reserva", com o nome da reserva no rótulo
        await page
          .getByRole('button', { name: new RegExp(`Ver reserva.*${esc(pousada.name)}`) })
          .click({ timeout: SLOW });
        const sheet = page.getByRole('dialog', { name: pousada.name });
        await sheet
          .getByRole('button', { name: new RegExp(`Código ${esc(pousada.code)}`) })
          .waitFor();
        await page.keyboard.press('Escape');
        await sheet.waitFor({ state: 'detached' });
      },
    ],
  ]);
}

// ------------------------------------------------------------------ reserva sem rede
function appReservaOffline(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  const { pousada } = ROAD.estrada;
  const sheet = page.getByRole('dialog', { name: pousada.name });
  return r.run(
    'app_reserva_offline',
    'Print e PDF anexados, enviados e abertos sem rede depois de recarregar',
    [
      [
        'anexar um print e um PDF na reserva',
        async () => {
          await r.goA(r.trip(estrada.trip, `/reservas/${estrada.pousada}/editar`));
          const name = page.getByLabel('Nome', { exact: true });
          await until(
            () => name.inputValue(),
            (v) => v === pousada.name,
            'o formulário não carregou a reserva',
            SLOW,
          );
          await page.locator('input[type=file][multiple]').setInputFiles([
            { name: 'print.png', mimeType: 'image/png', buffer: makePng() },
            { name: 'voucher.pdf', mimeType: 'application/pdf', buffer: makePdf() },
          ]);
          const list = page.getByRole('list', { name: 'Anexos a enviar' });
          await list.getByText('print.png').waitFor();
          await list.getByText('voucher.pdf').waitFor();
          await page.getByRole('button', { name: 'Salvar', exact: true }).click();
        },
      ],
      [
        'os dois sobem e viram linha no servidor',
        async () => {
          await sheet.waitFor();
          await until(
            () => sheet.locator('[data-media]:not([data-pending])').count(),
            (n) => n === 2,
            'os anexos não terminaram de subir',
            60_000,
          );
          const rows = await until(
            async () =>
              must(
                await a.client
                  .from('attachments')
                  .select('mime')
                  .eq('reservation_id', estrada.pousada)
                  .is('deleted_at', null),
                'anexos da reserva',
              ),
            (xs) => xs.length === 2,
            'as duas linhas não chegaram',
          );
          const mimes = rows.map((x) => x.mime).sort();
          if (mimes.join() !== 'application/pdf,image/jpeg')
            throw new Error(`tipos ${mimes.join()}`);
        },
      ],
      [
        'o service worker controla a página',
        async () => {
          await page.evaluate('navigator.serviceWorker.ready.then(() => true)');
          if (!(await page.evaluate('navigator.serviceWorker.controller !== null'))) {
            await page.reload();
          }
          await until(
            () => page.evaluate('navigator.serviceWorker.controller !== null'),
            (v) => v === true,
            'o service worker não assumiu a página',
          );
        },
      ],
      [
        'sem rede, recarregar e abrir a reserva',
        async () => {
          await r.offline(true);
          await page.reload();
          await sheet.waitFor({ timeout: SLOW });
          await sheet
            .getByRole('button', { name: new RegExp(`Código ${esc(pousada.code)}`) })
            .waitFor();
        },
      ],
      [
        'o print abre do aparelho',
        async () => {
          await sheet.getByRole('button', { name: 'Abrir foto' }).click();
          const viewer = page.getByRole('dialog', { name: 'Foto em tela cheia' });
          const img = viewer.locator('img[src^="blob:"]');
          await img.waitFor();
          await until(
            () => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth),
            (w) => w > 0,
            'o print não desenhou',
          );
          await viewer.getByRole('button', { name: 'Fechar' }).click();
          await viewer.waitFor({ state: 'detached' });
        },
      ],
      [
        'o PDF abre no visualizador',
        async () => {
          await sheet.getByRole('button', { name: 'voucher.pdf' }).click();
          const viewer = page.getByRole('dialog', { name: 'voucher.pdf' });
          const canvas = viewer.locator('canvas[aria-label="Página 1"]');
          await canvas.waitFor({ timeout: SLOW });
          await until(
            () => canvas.evaluate((el) => (el as unknown as { width: number }).width),
            (w) => w > 0,
            'a página do PDF não desenhou',
          );
          await viewer.getByRole('button', { name: 'Fechar' }).click();
        },
      ],
    ],
    () => r.offline(false),
  );
}

// ------------------------------------------------------------------ missões e a chegada
function appMissoes(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  const QUEST = 'Foto do time com a paisagem';
  const FOOD = 'Provar o prato da casa';
  const suggestion = (p: Page, text: string) =>
    p.getByRole('listitem', { name: `Sugestão: ${text}` });
  return r.run(
    'app_missoes',
    'Sugestão adicionada e outra dispensada, iguais para B; a missão marcada na folha "Como foi?"',
    [
      [
        'A vê as sugestões da estrada',
        async () => {
          await r.goA(`${r.trip(estrada.trip, '/checklists')}?aba=missoes`);
          await suggestion(page, QUEST).waitFor({ timeout: SLOW });
          await suggestion(page, FOOD).waitFor();
        },
      ],
      [
        'adicionar a da cascata e dispensar a do restaurante',
        async () => {
          await suggestion(page, QUEST).getByRole('button', { name: 'Adicionar' }).click();
          await page.getByRole('checkbox', { name: startsWith(QUEST) }).waitFor();
          await suggestion(page, FOOD).getByRole('button', { name: 'Dispensar' }).click();
          await suggestion(page, FOOD).waitFor({ state: 'detached' });
        },
      ],
      [
        'o servidor tem a missão ativa e a dispensada viva',
        async () => {
          const quest = await uuidV5(estrada.stops.nature, 'quest:nature');
          const food = await uuidV5(estrada.stops.food, 'quest:food');
          await until(
            async () =>
              must(
                await a.client
                  .from('checklist_items')
                  .select('id, status, source')
                  .in('id', [quest, food])
                  .is('deleted_at', null),
                'respostas',
              ),
            (rows) =>
              rows.some((x) => x.id === quest && x.status === 'active' && x.source === 'system') &&
              rows.some((x) => x.id === food && x.status === 'dismissed'),
            'as respostas não chegaram ao servidor',
          );
        },
      ],
      [
        'recarregar mantém as duas respostas',
        async () => {
          await page.reload();
          await page.getByRole('checkbox', { name: startsWith(QUEST) }).waitFor({ timeout: SLOW });
          await suggestion(page, FOOD).waitFor({ state: 'detached' });
          await suggestion(page, QUEST).waitFor({ state: 'detached' });
        },
      ],
      [
        'B vê a missão e não vê a dispensada',
        async () => {
          const b = await r.peer();
          await b.goto(`${r.trip(estrada.trip, '/checklists')}?aba=missoes`);
          await b.getByRole('checkbox', { name: startsWith(QUEST) }).waitFor({ timeout: SLOW });
          await suggestion(b, FOOD).waitFor({ state: 'detached' });
        },
      ],
      [
        'Chegamos! na cascata abre "Como foi?" com a missão',
        async () => {
          await r.goA(`${r.trip(estrada.trip)}?render=list`);
          await page.getByRole('button', { name: 'Chegamos!' }).click({ timeout: SLOW });
          const sheet = page.getByRole('dialog', { name: `Como foi ${ROAD.estrada.nature}?` });
          await sheet.waitFor();
          const done = sheet.getByRole('button', { name: `Feito: ${QUEST}` });
          await done.click();
          await until(
            () => done.getAttribute('aria-pressed'),
            (v) => v === 'true',
            'a missão não ficou feita',
          );
        },
      ],
      [
        'o servidor tem a chegada e a missão feitas por Lab A',
        async () => {
          const quest = await uuidV5(estrada.stops.nature, 'quest:nature');
          await until(
            async () => {
              const [item] = must(
                await a.client.from('checklist_items').select('done_by').eq('id', quest),
                'missão',
              );
              const [stop] = must(
                await a.client.from('stops').select('done_by').eq('id', estrada.stops.nature),
                'cascata',
              );
              return [item?.done_by ?? null, stop?.done_by ?? null];
            },
            ([item, stop]) => item === a.uid && stop === a.uid,
            'a missão ou a chegada não chegaram ao servidor',
          );
        },
      ],
    ],
  );
}

/** A folha "Como foi?" da cascata: a que já está aberta, ou pelo card, ou por "Minha memória". */
async function memorySheet(r: RoadRun): Promise<Locator> {
  const page = r.page;
  const name = `Como foi ${ROAD.estrada.nature}?`;
  const sheet = page.getByRole('dialog', { name });
  if (await sheet.isVisible()) return sheet;
  const card = page.getByRole('region', { name }).getByRole('button', { name: 'Contar como foi' });
  if (await card.isVisible()) await card.click();
  else await page.getByRole('button', { name: 'Minha memória' }).click();
  await sheet.waitFor();
  return sheet;
}

async function addPhoto(r: RoadRun, file: string): Promise<void> {
  const sheet = await memorySheet(r);
  // a folha pode já mostrar uma foto: espera a nova miniatura (comprimida no aparelho) entrar
  const images = sheet.locator('img');
  const before = await images.count();
  await sheet
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: file, mimeType: 'image/png', buffer: makePng() });
  await until(
    () => images.count(),
    (n) => n > before,
    'a foto escolhida não apareceu na folha',
    15_000,
  );
  await sheet.getByRole('button', { name: 'Salvar' }).click();
  await sheet.waitFor({ state: 'detached' });
}

// ------------------------------------------------------------------ foto sem sinal
function appMemoria(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  let id = '';
  return r.run(
    'app_memoria',
    'A foto sem sinal apareceu na hora, subiu quando a rede voltou e está no diário de B',
    [
      [
        'sem rede, a foto entra na memória',
        async () => {
          await r.offline(true);
          await addPhoto(r, 'cascata.png');
        },
      ],
      [
        'ela aparece do aparelho, "aguardando sinal"',
        async () => {
          await page.getByRole('button', { name: 'Minha memória' }).click();
          const sheet = page.getByRole('dialog', { name: `Como foi ${ROAD.estrada.nature}?` });
          const thumb = sheet.locator('[data-media][data-pending]').first();
          await thumb.waitFor();
          await sheet.getByText('aguardando sinal').first().waitFor();
          id = (await thumb.getAttribute('data-media')) ?? '';
          await page.keyboard.press('Escape');
          await sheet.waitFor({ state: 'detached' });
          const rows = must(
            await a.client.from('attachments').select('id').eq('id', id),
            'anexo antes do sinal',
          );
          if (rows.length > 0) throw new Error('a linha nasceu antes do arquivo subir');
        },
      ],
      [
        'a rede volta: o arquivo sobe e a linha nasce',
        async () => {
          await r.offline(false);
          await until(
            async () =>
              must(
                await a.client.from('attachments').select('stop_id, kind').eq('id', id),
                'anexo',
              ),
            (rows) => rows[0]?.stop_id === estrada.stops.nature && rows[0].kind === 'photo',
            'a foto não chegou ao servidor',
            60_000,
          );
        },
      ],
      [
        'B vê a foto no diário',
        async () => {
          const b = await r.peer();
          await b.goto(r.trip(estrada.trip, '/diario'));
          await b.locator(`[data-media="${id}"]:not([data-pending])`).waitFor({ timeout: SLOW });
        },
      ],
    ],
    () => r.offline(false),
  );
}

// ------------------------------------------------------------------ "+ Gasto" no Modo Viagem
function appGastos(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  return r.run(
    'app_gastos',
    '"+ Gasto" na folha da cascata: R$ 85 em Atrações, e a barra âmbar em 85% do orçamento',
    [
      [
        'o "+ Gasto" da folha da parada já vem com a parada e Atrações',
        async () => {
          // a folha da parada abre pela linha da lista (fase 14): o gasto acontece na parada
          await r.goA(`${r.trip(estrada.trip)}?render=list`);
          await page
            .getByRole('button', { name: ROAD.estrada.nature, exact: true })
            .click({ timeout: SLOW });
          const folha = page.getByRole('dialog', { name: ROAD.estrada.nature });
          await folha.waitFor();
          await folha.getByRole('button', { name: 'Gasto', exact: true }).click();
          const sheet = page.getByRole('dialog', { name: 'Novo gasto' });
          await sheet.waitFor();
          const pressed = await sheet
            .getByRole('button', { name: 'Atrações', exact: true })
            .getAttribute('aria-pressed');
          if (pressed !== 'true') throw new Error('a categoria não veio pela parada');
          await sheet.getByLabel('Valor').fill('85');
          await sheet.getByRole('button', { name: 'Salvar' }).click();
          await sheet.waitFor({ state: 'detached' });
        },
      ],
      [
        'a barra do orçamento em âmbar, 85%',
        async () => {
          await r.goA(r.trip(estrada.trip, '/gastos'));
          const bar = page.locator('[data-budget="tight"]');
          await bar.waitFor({ timeout: SLOW });
          if (!(await bar.innerText()).includes('85%')) throw new Error('a barra não diz 85%');
        },
      ],
      [
        'o servidor tem o gasto',
        async () => {
          await until(
            async () =>
              must(
                await a.client
                  .from('expenses')
                  .select('amount, category, paid_by, stop_id')
                  .eq('trip_id', estrada.trip)
                  .is('deleted_at', null),
                'gastos',
              ),
            (rows) =>
              rows.length === 1 &&
              Number(rows[0]?.amount) === 85 &&
              rows[0]?.category === 'attractions' &&
              rows[0].paid_by === a.uid &&
              rows[0].stop_id === estrada.stops.nature,
            'o gasto não chegou ao servidor como esperado',
          );
        },
      ],
    ],
  );
}

// ------------------------------------------------------------------ sair com foto pendente
function appSairPendente(r: RoadRun): Promise<Check> {
  const { estrada } = r.ctx.road;
  const { a } = r.ctx;
  const page = r.page;
  return r.run(
    'app_sair_pendente',
    '"Sair" com uma foto sem sinal avisou o que se perderia; "Ficar" manteve tudo, e ela subiu',
    [
      [
        'sem rede, mais uma foto na memória',
        async () => {
          await r.goA(`${r.trip(estrada.trip)}?render=list`);
          await page.getByRole('button', { name: 'Minha memória' }).waitFor({ timeout: SLOW });
          await r.offline(true);
          await addPhoto(r, 'mirante.png');
          await page.getByRole('button', { name: 'Minha memória' }).click();
          const sheet = page.getByRole('dialog', { name: `Como foi ${ROAD.estrada.nature}?` });
          await sheet.locator('[data-media][data-pending]').first().waitFor();
          await page.keyboard.press('Escape');
          await sheet.waitFor({ state: 'detached' });
        },
      ],
      [
        '"Sair" avisa o que se perderia',
        async () => {
          await page.goto(`${r.url}/perfil`);
          await page.getByRole('button', { name: 'Sair', exact: true }).click({ timeout: SLOW });
          const sheet = page.getByRole('dialog', { name: 'Ainda há alterações por enviar' });
          await sheet.waitFor();
        },
      ],
      [
        '"Ficar e tentar depois" mantém a sessão',
        async () => {
          const sheet = page.getByRole('dialog', { name: 'Ainda há alterações por enviar' });
          await sheet.getByRole('button', { name: 'Ficar e tentar depois' }).click();
          await sheet.waitFor({ state: 'detached' });
          await page.getByRole('heading', { name: 'Perfil' }).waitFor();
        },
      ],
      [
        'a rede volta e a foto sobe',
        async () => {
          await r.offline(false);
          await until(
            async () =>
              must(
                await a.client
                  .from('attachments')
                  .select('id')
                  .eq('stop_id', estrada.stops.nature)
                  .eq('created_by', a.uid)
                  .is('deleted_at', null),
                'fotos da cascata',
              ),
            (rows) => rows.length === 2,
            'a segunda foto não subiu',
            60_000,
          );
        },
      ],
    ],
    () => r.offline(false),
  );
}

const RUNNERS: Record<RoadScenario, (r: RoadRun) => Promise<Check>> = {
  app_listas: appListas,
  app_contatos: appContatos,
  app_agora_reserva: appAgoraReserva,
  app_reserva_offline: appReservaOffline,
  app_missoes: appMissoes,
  app_memoria: appMemoria,
  app_gastos: appGastos,
  app_sair_pendente: appSairPendente,
};

/** Os cenários em ordem; quem depende de um cenário que não passou é pulado, com o motivo. */
export async function roadScenarios(ctx: RoadContext): Promise<Check[]> {
  const r = new RoadRun(ctx);
  const out: Check[] = [];
  const status = new Map<RoadScenario, Check['status']>();
  try {
    for (const scenario of ROAD_SCENARIOS) {
      const missing = (NEEDS[scenario] ?? []).find((n) => status.get(n) !== 'pass');
      const check: Check = missing
        ? {
            scenario,
            status: 'skip',
            latency_ms: null,
            detail: `Depende de "${LAB_SCENARIOS[missing].label}".`,
            data: {},
          }
        : await RUNNERS[scenario](r);
      status.set(scenario, check.status);
      out.push(check);
    }
  } finally {
    await r.offline(false).catch(() => undefined);
    await r.close();
  }
  return out;
}
