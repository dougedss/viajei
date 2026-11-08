import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { dateInSaoPaulo } from './helpers/dates.ts';
import { inserir } from './helpers/db.ts';
import { uuidV4, uuidV5 } from './helpers/ids.ts';
import { criarUsuario, SENHA } from './helpers/users.ts';

// testes pesados (WebGL por software na CI): uma nova tentativa só
test.describe.configure({ retries: 1 });

/** Largura e altura de um JPEG, pelo primeiro marcador SOF. */
function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1] ?? 0;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

/**
 * Uma viagem que terminou ontem, montada direto no banco local (o Modo Viagem só marca o dia de
 * hoje): dois dias, três paradas concluídas, um gasto e o orçamento. Devolve a página já com a
 * pessoa dentro do app.
 */
async function viagemPassada(browser: Browser): Promise<{ page: Page; tripId: string }> {
  const user = await criarUsuario('Retro');
  const tripId = uuidV4();
  const start = dateInSaoPaulo(-2);
  const end = dateInSaoPaulo(-1);
  const now = new Date().toISOString();
  await inserir('trips', [
    {
      id: tripId,
      owner_id: user.id,
      name: 'Retrospectiva do teste',
      start_date: start,
      end_date: end,
      budget: 300,
      updated_at: now,
    },
  ]);
  const day1 = uuidV5(tripId, start);
  const day2 = uuidV5(tripId, end);
  await inserir('trip_days', [
    { id: day1, trip_id: tripId, date: start, updated_at: now },
    { id: day2, trip_id: tripId, date: end, updated_at: now },
  ]);
  const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();
  const stop = (
    day: string,
    date: string,
    position: string,
    kind: string,
    name: string,
    hhmm: string,
  ) => ({
    id: uuidV4(),
    trip_id: tripId,
    trip_day_id: day,
    position,
    kind,
    name,
    time: hhmm,
    done_at: at(date, hhmm),
    done_by: user.id,
    updated_at: now,
  });
  await inserir('stops', [
    stop(day1, start, 'a0', 'nature', 'Cascata do Caracol', '09:10'),
    stop(day1, start, 'a1', 'winery', 'Casa Valduga', '13:40'),
    stop(day2, end, 'a0', 'city', 'Gramado', '11:20'),
  ]);
  await inserir('expenses', [
    {
      id: uuidV4(),
      trip_id: tripId,
      amount: 120,
      category: 'food',
      date: start,
      paid_by: user.id,
      created_by: user.id,
      updated_at: now,
    },
  ]);
  const context = await browser.newContext({ ...test.info().project.use, acceptDownloads: true });
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(SENHA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Suas viagens' })).toBeVisible();
  return { page, tripId };
}

async function conferirCardFinal(page: Page): Promise<void> {
  const final = page.locator('[data-final-card]');
  await expect(final.locator('[data-stat="dias"]')).toHaveText('2 dias');
  await expect(final.locator('[data-stat="paradas"]')).toHaveText('3 paradas');
  await expect(final.locator('[data-budget]')).toHaveText('R$ 120 de R$ 300 · dentro do orçamento');
}

/**
 * O filme em 3D (WebGL2 por software na CI): monta, toca até o card final com os números certos, e o
 * card exportado tem 1080 × 1920. O vídeo em 3D começa a sair quadro a quadro (o ritmo
 * fica anotado); gerar os 450 quadros por software não cabe no tempo da CI, e o vídeo inteiro é
 * conferido no teste seguinte e no laboratório.
 */
test('uma viagem passada abre a retrospectiva, chega ao card final e exporta o card', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const { page, tripId } = await viagemPassada(browser);

  // a visão geral tem a entrada da retrospectiva (a viagem terminou ontem)
  await page.goto(`/viagens/${tripId}/detalhes`);
  await page.locator('[data-retro-entry]').click();
  await expect(page).toHaveURL(new RegExp(`/viagens/${tripId}/retrospectiva$`));

  // o filme toca os 15 s pelo relógio e termina sozinho no card final (no WebGL por software da CI
  // cada quadro da página leva segundos: um clique no "Pular" chegaria depois do fim)
  const film = page.locator('[data-film]');
  await expect(film).toHaveAttribute('data-film', 'playing', { timeout: 150_000 });
  await expect(film).toHaveAttribute('data-film', 'ended', { timeout: 120_000 });
  await conferirCardFinal(page);

  // exportar um card baixa a imagem, no tamanho de stories
  await page.getByRole('button', { name: 'Cards' }).click();
  const sheet = page.getByRole('dialog', { name: 'Compartilhar a viagem' });
  for (const name of ['Números', 'Conquistas', 'Fotos']) {
    await sheet.getByRole('checkbox', { name }).uncheck();
  }
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: 'Compartilhar 1 imagem' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('viajei-retrospectiva-do-teste-abertura-stories.jpg');
  expect(jpegSize(await readFile(await download.path()))).toEqual({ width: 1080, height: 1920 });

  // o vídeo em 3D: os quadros saem pelo alvo fora da tela; anota o ritmo e cancela
  const pathInfo = sheet.locator('[data-export-path]');
  await expect(pathInfo).not.toHaveAttribute('data-export-path', 'pending', { timeout: 15_000 });
  await sheet.getByRole('button', { name: 'Gerar vídeo' }).click();
  const running = sheet.locator('[data-export-state="running"]');
  await expect(running).toBeVisible();
  await page.waitForTimeout(45_000);
  const text = (await running.textContent()) ?? '';
  const pct = Number(/(\d+)%/.exec(text)?.[1] ?? '0');
  test.info().annotations.push({
    type: 'vídeo em 3D',
    description: `${(await pathInfo.textContent()) ?? ''}: ${pct}% em 45 s`,
  });
  expect(pct).toBeGreaterThan(0);
  await running.getByRole('button', { name: 'Cancelar' }).click();
  await expect(sheet.getByRole('button', { name: 'Gerar vídeo' })).toBeVisible();
});

/**
 * O vídeo inteiro, pelo caminho que o Chromium da CI suporta (WebCodecs H.264 em MP4 ou VP9 em
 * WebM), sobre a sequência de cards (`?render=list`, sem 3D): os 450 quadros pelo relógio do filme,
 * o arquivo baixado e lido no Node, com a duração e as dimensões conferidas.
 */
test('o vídeo da retrospectiva sai com 15 s em 1080 × 1920', async ({ browser }) => {
  test.setTimeout(420_000);
  const { page, tripId } = await viagemPassada(browser);
  await page.goto(`/viagens/${tripId}/retrospectiva?render=list`);
  await expect(page.locator('[data-film-mode="cards"]')).toBeVisible({ timeout: 30_000 });
  await conferirCardFinal(page);

  await page.getByRole('button', { name: 'Vídeo · 15 s' }).click();
  const sheet = page.getByRole('dialog', { name: 'Compartilhar a viagem' });
  const pathInfo = sheet.locator('[data-export-path]');
  await expect(pathInfo).not.toHaveAttribute('data-export-path', 'pending', { timeout: 15_000 });
  await expect(pathInfo).not.toHaveAttribute('data-export-path', 'none');
  const t0 = Date.now();
  await sheet.getByRole('button', { name: 'Gerar vídeo' }).click();
  await expect(sheet.locator('[data-export-state="done"]')).toBeVisible({ timeout: 360_000 });
  test.info().annotations.push({
    type: 'vídeo',
    description: `${(await pathInfo.textContent()) ?? ''} em ${Math.round((Date.now() - t0) / 1000)} s`,
  });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: 'Compartilhar vídeo' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^viajei-retrospectiva-do-teste\.(mp4|webm)$/);
  const file = await readFile(await download.path());
  const input = new Input({ source: new BufferSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('o arquivo não tem vídeo');
  expect({ width: await track.getDisplayWidth(), height: await track.getDisplayHeight() }).toEqual({
    width: 1080,
    height: 1920,
  });
  expect(Math.abs((await input.computeDuration()) - 15)).toBeLessThan(0.5);
});
