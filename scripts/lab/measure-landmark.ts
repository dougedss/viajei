import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { ESTUFA_CURITIBA } from '../../src/art/landmarks/samples/estufa-curitiba.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { DEVICE, enterPreview, QUIET, signInPage } from './app.ts';
import { must, syncPush } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { LabConfig } from './env.ts';
import { derivePassword, LAB_USERS } from './env.ts';
import { LAB_DESTINATION } from './evaluate.ts';
import { costUsd } from './import-lab.ts';
import { log, sleep, type Session } from './session.ts';

/**
 * Os cartões-postais no laboratório (fase 23).
 *
 * **A semeadura** (`seedLabLandmark`, nos cenários de sempre, custo zero): a estufa escrita à mão,
 * publicada no lugar do destino do laboratório (um lugar do laboratório, nunca um de verdade), pela
 * RPC `lab_seed_landmark` que só o executor chama. É o gerador simulado: o `app_maquete` cobra a peça
 * em cena de dia e de noite e captura `maquete-peca.png`.
 *
 * **A medição** (`--medir-cartao-postal`, uma vez): a geração de verdade do lugar da régua (o Jardim
 * Botânico de Curitiba, Q94923, a corrente inteira conferida) de ponta a ponta: a fila (pela
 * `landmark_sync` com `measure`), o trabalhador do cron (identificar, as fotos, a receita), a
 * conferência pelo Chromium (o app aberto na viagem desenha e manda conferir) e a publicação. A tabela
 * com tokens, tempo e custo de cada chamada (`ai_imports`), a receita que saiu (anexada: é dado do app,
 * não foto), a captura da peça ao lado da régua e o veredito. `--opus` pede o Opus 5.5 (a segunda
 * medição, quando a conferência rejeita a peça do Sonnet).
 */
export const LAB_LANDMARK_KEY = 'geo:mirante-do-laboratorio@-29.285,-51.412';
const RULER = {
  name: 'Jardim Botânico de Curitiba',
  key: 'osm:w607776738',
  osm_type: 'way',
  osm_id: 607776738,
  lat: -25.4428,
  lng: -49.2392,
  wikidata: 'Q94923',
} as const;
/** O teto desta medição (a fase inteira tem US$ 3,00). */
const CEILING_USD = 1.5;
const WAIT_GENERATION_MS = 9 * 60_000;
const WAIT_CHECK_MS = 6 * 60_000;

export async function seedLabLandmark(a: Session): Promise<{ ok: boolean; detail: string }> {
  const slug = LAB_DESTINATION.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const key = `geo:${slug}@${LAB_DESTINATION.latitude.toFixed(3)},${LAB_DESTINATION.longitude.toFixed(3)}`;
  const { data, error } = await a.client.rpc('lab_seed_landmark', {
    p_place_key: key,
    p_name: 'Estufa do laboratório',
    p_recipe: ESTUFA_CURITIBA as never,
  });
  if (error) return { ok: false, detail: `lab_seed_landmark ${error.code}: ${error.message}` };
  log(`cartão-postal semeado em ${key} (${data})`);
  return { ok: true, detail: key };
}

type SyncItem = {
  key: string;
  state: string;
  version?: number;
  recipe?: unknown;
  landmark_id?: string;
};

async function syncState(a: Session, trip: string, opus: boolean): Promise<SyncItem | null> {
  const place = {
    key: RULER.key,
    kind: 'stop',
    name: RULER.name,
    lat: RULER.lat,
    lng: RULER.lng,
    stop_kind: 'nature',
    osm_type: RULER.osm_type,
    osm_id: RULER.osm_id,
    measure: true,
    ...(opus ? { variant: 2 } : {}),
  };
  const data = must(
    await a.client.rpc('landmark_sync', { p_trip: trip, p_places: [place] as never }),
    'landmark_sync',
  ) as { items: SyncItem[] };
  return data.items.find((i) => i.key === RULER.key) ?? null;
}

export async function measureLandmark(
  cfg: LabConfig,
  a: Session,
  opts: { opus: boolean },
): Promise<number> {
  const startedAt = new Date();
  const artifactsDir = join(process.cwd(), 'lab-artifacts');
  await mkdir(artifactsDir, { recursive: true });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    startedAt,
  );
  const trip = await uuidV5(a.uid, 'lab:cartao-postal');
  const day = await uuidV5(trip, today);
  const stop = await uuidV5(trip, 'stop:jardim');
  log(
    `medição do cartão-postal: a viagem fixa com o lugar da régua (${RULER.name}, ${RULER.wikidata})`,
  );
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: 'Laboratório · cartão-postal',
        start_date: today,
        end_date: today,
        budget: null,
        deleted_at: null,
      },
    },
    {
      table: 'notification_prefs',
      id: await uuidV5(a.uid, trip),
      op: 'upsert',
      values: { user_id: a.uid, trip_id: trip, kinds: {}, deleted_at: null },
    },
    {
      table: 'trip_days',
      id: day,
      op: 'upsert',
      values: { trip_id: trip, date: today, deleted_at: null },
    },
    {
      table: 'stops',
      id: stop,
      op: 'upsert',
      values: {
        trip_id: trip,
        trip_day_id: day,
        position: 'a0',
        kind: 'nature',
        name: RULER.name,
        time: '10:00',
        lat: RULER.lat,
        lng: RULER.lng,
        osm_type: RULER.osm_type,
        osm_id: RULER.osm_id,
        source: 'user',
        skipped: false,
        deleted_at: null,
      },
    },
  ]);

  const steps: { step: string; ms: number; detail: string }[] = [];
  let state: SyncItem | null;
  let verdict: string;
  try {
    // 1. a fila e o trabalhador do cron: até a peça gerada chegar para conferir (ou falhar)
    const t0 = Date.now();
    state = await syncState(a, trip, opts.opus);
    log(`estado inicial: ${state?.state ?? '?'}`);
    while (Date.now() - t0 < WAIT_GENERATION_MS && (state?.state === 'pending' || !state)) {
      await sleep(15_000);
      state = await syncState(a, trip, opts.opus);
    }
    steps.push({ step: 'fila → peça gerada', ms: Date.now() - t0, detail: state?.state ?? '?' });
    log(
      `depois do trabalhador: ${state?.state ?? '?'} em ${String(Math.round((Date.now() - t0) / 1000))} s`,
    );

    // 2. a conferência pelo Chromium: o app aberto na viagem desenha a peça e manda conferir
    if (state?.state === 'check') {
      const t1 = Date.now();
      const browser = await chromium.launch({ channel: 'chromium' });
      try {
        const context = await browser.newContext({ ...DEVICE, permissions: [] });
        await context.addInitScript({ content: QUIET });
        const page = await context.newPage();
        page.setDefaultTimeout(30_000);
        await enterPreview(page, cfg.appOrigin, cfg.bypass);
        await signInPage(
          page,
          cfg.appOrigin,
          LAB_USERS.a.email,
          await derivePassword(cfg.secret, LAB_USERS.a.email),
        );
        await page.goto(`${cfg.appOrigin}/viagens/${trip}`);
        await page.getByRole('heading', { name: 'Agora' }).waitFor();
        while (Date.now() - t1 < WAIT_CHECK_MS && state?.state === 'check') {
          await sleep(10_000);
          state = await syncState(a, trip, opts.opus);
        }
        steps.push({
          step: 'conferência pelo aparelho',
          ms: Date.now() - t1,
          detail: state?.state ?? '?',
        });
        if (state?.state === 'published') {
          // a captura da peça publicada, de perto, ao lado da régua
          await page.goto(`${cfg.appOrigin}/viagens/${trip}?peca=1`);
          await page
            .locator('[data-world="webgl2"], [data-world="webgpu"]')
            .waitFor({ timeout: 90_000 });
          await page.locator('[data-world-landmarks="1"]').waitFor({ timeout: 90_000 });
          await page.locator('[data-world-camera-settled="true"]').waitFor({ timeout: 90_000 });
          await sleep(2_000);
          await page.screenshot({ path: join(artifactsDir, 'medicao-peca.png') });
        }
      } finally {
        await browser.close().catch(() => undefined);
      }
    }
    verdict = state?.state ?? 'sem geração';
  } finally {
    await dropLabTrip(a, trip).catch((err: unknown) =>
      log(`aviso: a viagem da medição ficou: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  // a receita que saiu (dado do app, não foto) e o registro de cada chamada de IA
  const published = must(
    await a.client
      .from('landmarks')
      .select('key, name, version, status, recipe, published_at')
      .eq('key', `wikidata:${RULER.wikidata}`),
    'a peça da régua no catálogo',
  );
  const piece = published[0] ?? null;
  const recipe = piece?.recipe ?? state?.recipe ?? null;
  if (recipe)
    await writeFile(join(artifactsDir, 'medicao-receita.json'), JSON.stringify(recipe, null, 2));
  const calls = must(
    await a.client
      .from('ai_imports')
      .select(
        'created_at, finished_at, model, status, error, input_tokens, output_tokens, input_bytes',
      )
      .eq('kind', 'landmark')
      .gte('created_at', startedAt.toISOString())
      .order('created_at'),
    'os registros da IA',
  );
  const rows = calls.map((c) => {
    const usage = { input_tokens: c.input_tokens ?? 0, output_tokens: c.output_tokens ?? 0 };
    const cost = costUsd(c.model, usage);
    const ms = c.finished_at ? Date.parse(c.finished_at) - Date.parse(c.created_at) : null;
    return { ...c, cost, ms };
  });
  const total = rows.reduce((n, r) => n + (r.cost ?? 0), 0);
  const shapes =
    recipe && typeof recipe === 'object' && 'shapes' in recipe
      ? (recipe as { shapes: unknown[] }).shapes.length
      : null;
  const head =
    '| chamada | modelo | resultado | entrada (bytes) | tokens entrada | tokens saída | US$ |\n|---|---|---|---|---|---|---|';
  const body = rows.map(
    (r, i) =>
      `| ${String(i + 1)} | ${r.model} | ${r.status}${r.error ? ` ${r.error}` : ''} | ${String(r.input_bytes)} | ${String(r.input_tokens ?? '—')} | ${String(r.output_tokens ?? '—')} | ${r.cost === null ? '—' : r.cost.toFixed(4)} |`,
  );
  const stepLines = steps.map(
    (s) => `- ${s.step}: ${String(Math.round(s.ms / 1000))} s (${s.detail})`,
  );
  const broken = rows.length === 0 || verdict === 'sem geração' || verdict === 'pending';
  const over = total > CEILING_USD;
  const report = `## Medição do cartão-postal (fase 23)${opts.opus ? ' · Opus 5.5' : ' · Sonnet 5.5'}\n\nO lugar da régua: ${RULER.name} (${RULER.wikidata}, ${RULER.key}).\n\n${stepLines.join('\n')}\n\n${[head, ...body].join('\n')}\n\nTotal: US$ ${total.toFixed(4)} em ${String(rows.length)} chamadas (teto US$ ${CEILING_USD.toFixed(2)}). Veredito: **${verdict}**${piece ? ` · a peça no catálogo: ${piece.status} v${String(piece.version)}` : ''}${shapes !== null ? ` · ${String(shapes)} formas` : ''}.${recipe ? ' A receita está em `medicao-receita.json`; a captura da peça, em `medicao-peca.png` (ao lado da régua `img/m-jardim.jpg`).' : ''}${broken ? '\n\n**A corrente não chegou a uma peça gerada.**' : ''}${over ? `\n\n**O total passou do teto de US$ ${CEILING_USD.toFixed(2)}.**` : ''}\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  return broken || over ? 1 : 0;
}
