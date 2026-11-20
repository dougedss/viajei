import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import {
  READ_FN,
  readConfirmationSchema,
  readReceiptSchema,
  type ReadRequest,
} from '../../supabase/functions/_shared/read-protocol.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { must, ok, syncPush } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
import {
  confirmationHtml,
  confirmationText,
  expectedConfirmation,
  expectedReceipt,
  hotelFor,
  receiptHtml,
  score,
  type Hotel,
  type Score,
} from './read-score.ts';
import { kindsOnly, log, type Session } from './session.ts';

/**
 * A medição da leitura (fase 18), uma vez, pela função publicada e como o lab-a: a confirmação de
 * uma reserva inventada em três formas (o texto colado, o PDF do voucher e o print da tela) e a foto
 * de uma nota inventada com o QR da NFC-e, cada uma lida uma vez. Os arquivos nascem na hora: duas
 * páginas HTML renderizadas pelo Chromium do Playwright (`page.pdf` e `page.screenshot`), nada da
 * pessoa e nenhum arquivo novo no repositório (o QR é a imagem fixa do e2e). Sai uma tabela com
 * tempos, tokens, custo e a nota de cada leitura: campos certos, campos que faltaram, campos errados
 * e campos inventados (o que o arquivo não dizia e a IA preencheu). Vermelho quando uma leitura não
 * termina, quando algum campo é inventado ou quando o total passa do teto (US$ 0,30).
 */
const CEILING_USD = 0.3;
const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);

// ------------------------------------------------------------------ os arquivos, pelo Chromium
type Fixtures = { pdf: Buffer; print: Buffer; receipt: Buffer };

async function renderFixtures(h: Hotel): Promise<Fixtures> {
  const browser = await chromium.launch({ channel: 'chromium' });
  try {
    const a4 = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    await a4.setContent(confirmationHtml(h), { waitUntil: 'load' });
    const pdf = await a4.pdf({ format: 'A4', printBackground: true });
    await a4.close();
    const phone = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
    });
    await phone.setContent(confirmationHtml(h), { waitUntil: 'load' });
    const print = await phone.screenshot({ type: 'png', fullPage: true });
    await phone.setContent(receiptHtml(), { waitUntil: 'load' });
    const receipt = await phone.screenshot({ type: 'png', fullPage: true });
    await phone.close();
    return { pdf: Buffer.from(pdf), print: Buffer.from(print), receipt: Buffer.from(receipt) };
  } finally {
    await browser.close();
  }
}

type Row = { label: string; run: TimedImport; bytes: number; score: Score | null };

export async function measureRead(cfg: LabConfig, a: Session): Promise<number> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const hotel = hotelFor(today);
  const trip = await uuidV5(a.uid, 'lab:leitura');
  log('medição da leitura: os arquivos inventados, pelo Chromium');
  const files = await renderFixtures(hotel);

  // a viagem fixa da medição (ids da D53): a pasta dos anexos no Storage, e nada de aviso
  await syncPush(a.client, [
    {
      table: 'trips',
      id: trip,
      op: 'upsert',
      values: {
        owner_id: a.uid,
        name: 'Laboratório · leitura',
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
      values: {
        user_id: a.uid,
        trip_id: trip,
        enabled: false,
        lead_minutes: 15,
        morning_time: '07:00',
        kinds: kindsOnly(),
      },
    },
  ]);
  const uploaded: string[] = [];
  const upload = async (buffer: Buffer, ext: 'pdf' | 'png', contentType: string) => {
    const path = `${trip}/${randomUUID()}.${ext}`;
    ok(
      await a.client.storage.from('attachments').upload(path, buffer, { contentType }),
      `enviar ${ext}`,
    );
    uploaded.push(path);
    return path;
  };

  const rows: Row[] = [];
  const read = async (
    label: string,
    body: ReadRequest,
    bytes: number,
    parse: (data: unknown) => Score | null,
  ) => {
    log(`medição: ${label}`);
    const run = await timedImport(cfg, a, body, READ_FN);
    rows.push({ label, run, bytes, score: run.outcome === 'done' ? parse(run.data) : null });
  };
  const confirmation = (data: unknown): Score | null => {
    const parsed = readConfirmationSchema.safeParse(data);
    return parsed.success ? score(expectedConfirmation(hotel), parsed.data) : null;
  };
  const receipt = (data: unknown): Score | null => {
    const parsed = readReceiptSchema.safeParse(data);
    return parsed.success ? score(expectedReceipt, parsed.data) : null;
  };

  try {
    const text = confirmationText(hotel);
    await read(
      'confirmação · texto colado',
      { kind: 'confirmation', trip_id: trip, text, attachment: null },
      Buffer.byteLength(text),
      confirmation,
    );
    await read(
      'confirmação · PDF do voucher',
      {
        kind: 'confirmation',
        trip_id: trip,
        text: null,
        attachment: { path: await upload(files.pdf, 'pdf', 'application/pdf') },
      },
      files.pdf.byteLength,
      confirmation,
    );
    await read(
      'confirmação · print da tela',
      {
        kind: 'confirmation',
        trip_id: trip,
        text: null,
        attachment: { path: await upload(files.print, 'png', 'image/png') },
      },
      files.print.byteLength,
      confirmation,
    );
    await read(
      'nota · foto do cupom com QR',
      {
        kind: 'receipt',
        trip_id: trip,
        text: null,
        attachment: { path: await upload(files.receipt, 'png', 'image/png') },
      },
      files.receipt.byteLength,
      receipt,
    );
  } finally {
    // os arquivos fora (sem linha de `attachments`, a dona apaga) e a viagem da medição fora
    if (uploaded.length > 0) {
      const removed = await a.client.storage.from('attachments').remove(uploaded);
      if (removed.error)
        log(`aviso: os arquivos da medição ficaram para o expurgo: ${removed.error.message}`);
    }
    await dropLabTrip(a, trip).catch((err: unknown) =>
      log(`aviso: a viagem da medição ficou: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  // o registro de cada leitura, como a função o fechou
  const registry = new Map<string, { input_chars: number; input_bytes: number | null }>();
  const ids = rows.map((r) => r.run.id).filter((id): id is string => id !== null);
  if (ids.length > 0) {
    for (const row of must(
      await a.client.from('ai_imports').select('id, input_chars, input_bytes').in('id', ids),
      'os registros das leituras',
    ))
      registry.set(row.id, { input_chars: row.input_chars, input_bytes: row.input_bytes });
  }

  const head =
    '| leitura | resultado | entrada (bytes) | 1º caractere | fim | tokens entrada | tokens saída | US$ | campos | faltou | errado | inventado |\n|---|---|---|---|---|---|---|---|---|---|---|---|';
  const body = rows.map(({ label, run, bytes, score: q }) => {
    const cost = run.usage && run.model ? costUsd(run.model, run.usage) : null;
    const reg = run.id ? registry.get(run.id) : undefined;
    return `| ${[
      label,
      run.outcome === 'done'
        ? `ok · ${run.model ?? ''}`
        : `${run.outcome} ${run.code ?? ''} ${run.reason ?? ''}`.trim(),
      `${String(bytes)}${reg ? ` (registro: ${String(reg.input_chars)} chars, ${String(reg.input_bytes ?? 0)} bytes)` : ''}`,
      s(run.first_char_ms),
      s(run.end_ms),
      run.usage?.input_tokens ?? '—',
      run.usage?.output_tokens ?? '—',
      cost === null ? '—' : cost.toFixed(4),
      q ? `${String(q.ok)}/${String(q.total)}` : run.outcome === 'done' ? 'fora do schema' : '—',
      q ? q.missing.join(', ') || 'nada' : '—',
      q ? q.wrong.join(', ') || 'nada' : '—',
      q ? q.invented.join(', ') || 'nada' : '—',
    ].join(' | ')} |`;
  });
  const total = rows.reduce((n, r) => {
    const c = r.run.usage && r.run.model ? costUsd(r.run.model, r.run.usage) : null;
    return n + (c ?? 0);
  }, 0);
  const broken = rows.filter((r) => r.run.outcome !== 'done' || r.score === null);
  const invented = rows.filter((r) => (r.score?.invented.length ?? 0) > 0);
  const over = total > CEILING_USD;
  const verdict = [
    broken.length > 0
      ? `**${String(broken.length)} leitura(s) não terminaram ou vieram fora do schema**`
      : null,
    invented.length > 0
      ? `**campos inventados em: ${invented.map((r) => r.label).join('; ')}**`
      : null,
    over ? `**o total passou do teto de US$ ${CEILING_USD.toFixed(2)}**` : null,
  ].filter((x): x is string => x !== null);
  const report = `## Medição da leitura (fase 18)\n\n${[head, ...body].join('\n')}\n\nTotal: US$ ${total.toFixed(4)} em ${String(rows.length)} leituras (teto US$ ${CEILING_USD.toFixed(2)}). Arquivos: PDF ${String(files.pdf.byteLength)} bytes, print ${String(files.print.byteLength)} bytes, nota ${String(files.receipt.byteLength)} bytes.${verdict.length > 0 ? `\n\n${verdict.join('; ')}.` : '\n\nNenhum campo inventado; todas as leituras terminaram.'}\n`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  return verdict.length > 0 ? 1 : 0;
}
