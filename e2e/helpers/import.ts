import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { encodeEvent } from '../../supabase/functions/_shared/import-protocol.ts';
import { toAi, validateImport } from '../../supabase/functions/_shared/import-schema.ts';

/**
 * A importação nos testes de ponta a ponta, sem IA nenhuma (a CI não tem a chave e não deve ter):
 * o SSE que a `import-itinerary` mandaria para o texto do seed, com as datas trocadas pelas da
 * viagem do teste, e o Nominatim respondendo um lugar só para cada busca.
 */
const SEED_DATES = ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14'];

/** O texto colado de referência (a versão "WhatsApp" do seed). */
export function seedText(): string {
  return readFileSync('supabase/seed/viagem-rs.txt', 'utf8');
}

/**
 * O SSE gravado: `start`, o JSON do seed em pedaços e o `done` com o resultado validado. Com
 * `pauseBefore`, devolve em duas partes: a segunda começa no pedaço que traz esse trecho do JSON.
 */
export function importSse(dates: readonly string[], pauseBefore?: string): string[] {
  const raw = readFileSync('supabase/seed/viagem-rs.json', 'utf8').replace(
    /2026-12-1[1-4]/g,
    (d) => dates[SEED_DATES.indexOf(d)] ?? d,
  );
  const seed = validateImport(JSON.parse(raw));
  // a IA não escreve coordenada e deixa vazio o texto que o roteiro não diz (`toAi`); o resultado
  // validado volta com as coordenadas nulas
  const json = JSON.stringify(toAi(seed));
  const data = {
    ...seed,
    days: seed.days.map((d) => ({
      ...d,
      stops: d.stops.map((s) => ({ ...s, lat: null, lng: null })),
    })),
  };
  const size = 48;
  const pauseAt = pauseBefore ? json.indexOf(pauseBefore) : -1;
  let first = encodeEvent({
    type: 'start',
    id: 'c0ffee00-0000-4000-8000-000000000001',
    model: 'claude-sonnet-5-5',
  });
  let rest = '';
  for (let i = 0; i < json.length; i += size) {
    const event = encodeEvent({ type: 'delta', text: json.slice(i, i + size) });
    if (pauseAt >= 0 && i + size > pauseAt) rest += event;
    else first += event;
  }
  rest += encodeEvent({
    type: 'done',
    data,
    model: 'claude-sonnet-5-5',
    usage: { input_tokens: 4_100, output_tokens: 2_300 },
  });
  return pauseAt >= 0 ? [first, rest] : [first + rest];
}

/** O Nominatim de mentira: cada busca acha um lugar só, no centro do RS. */
export async function nominatimLocal(page: Page): Promise<void> {
  await page.route('https://nominatim.openstreetmap.org/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? '';
    await route.fulfill({
      json: [
        { display_name: `${q}, Rio Grande do Sul, Brasil`, name: q, lat: '-29.4', lon: '-51.1' },
      ],
    });
  });
}

/**
 * A função respondendo aos poucos: o `route.fulfill` do Playwright entrega o corpo de uma vez, então
 * aqui o `fetch` da página (só para a URL da função) devolve um stream que manda a primeira parte em
 * pedaços, para, e espera `globalThis.__releaseImport()` para mandar o resto. É como o teste vê o
 * preview enchendo.
 */
export async function importInSteps(page: Page, parts: readonly string[]): Promise<void> {
  await page.addInitScript(
    ([first, rest]: readonly string[]) => {
      const g = globalThis as unknown as { fetch: typeof fetch; __releaseImport?: () => void };
      const original = g.fetch.bind(globalThis);
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      g.__releaseImport = () => release();
      g.fetch = (input, init) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.includes('/functions/v1/import-itinerary')) return original(input, init);
        const encoder = new TextEncoder();
        const head = first ?? '';
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (let i = 0; i < head.length; i += 600) {
              controller.enqueue(encoder.encode(head.slice(i, i + 600)));
              await new Promise((r) => setTimeout(r, 40));
            }
            await gate;
            controller.enqueue(encoder.encode(rest ?? ''));
            controller.close();
          },
        });
        return Promise.resolve(
          new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
        );
      };
    },
    [...parts],
  );
}
