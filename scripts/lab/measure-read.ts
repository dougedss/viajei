import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  READ_FN,
  readConfirmationSchema,
  readReceiptSchema,
  type ReadConfirmation,
  type ReadReceipt,
  type ReadRequest,
} from '../../supabase/functions/_shared/read-protocol.ts';
import { uuidV5 } from '../../src/lib/ids/uuid.ts';
import { addDays } from './arm.ts';
import { must, ok, syncPush } from './client.ts';
import { dropLabTrip } from './drop.ts';
import type { LabConfig } from './env.ts';
import { costUsd, timedImport, type TimedImport } from './import-lab.ts';
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
const NFCE_QR = fileURLToPath(new URL('../../e2e/helpers/fixtures/nfce-qr.png', import.meta.url));
/** a chave do QR fixo (fecha o DV; o CNPJ, a data e a hora da nota inventada seguem dela) */
const ACCESS_KEY = '28170800156225000131650110000151341562040828';
const CNPJ = '00156225000131';

const s = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const br = (iso: string) => iso.split('-').reverse().join('/');
const esc = (t: string) =>
  t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// ------------------------------------------------------------------ a confirmação inventada
type Hotel = {
  name: string;
  code: string;
  checkin: string;
  checkout: string;
  amount: number;
  phone: string;
  cancelUntil: string;
};

function hotelFor(today: string): Hotel {
  return {
    name: 'Pousada Medição da Serra',
    code: 'MED-73KP',
    checkin: addDays(today, 45),
    checkout: addDays(today, 47),
    amount: 1240,
    phone: '(54) 99988-1234',
    cancelUntil: addDays(today, 38),
  };
}

/** O e-mail de confirmação como texto, do jeito que a pessoa colaria. */
function confirmationText(h: Hotel): string {
  return [
    `Olá! Sua reserva na ${h.name} está confirmada.`,
    '',
    `Número da confirmação: ${h.code}`,
    `Check-in: ${br(h.checkin)}, a partir das 15:00`,
    `Check-out: ${br(h.checkout)}, até as 11:00`,
    '2 noites · 2 adultos · Suíte com vista para o vale · Café da manhã incluído',
    `Valor total: R$ ${h.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    `Cancelamento gratuito até ${br(h.cancelUntil)}; depois, a primeira noite é cobrada.`,
    `Telefone da pousada: ${h.phone}`,
    'Reservado pelo Booking.com',
  ].join('\n');
}

/** O voucher como página: o PDF sai dela em A4; o print, em tela de celular. */
function confirmationHtml(h: Hotel): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1d2433;background:#f3f0ea}
  header{background:#2b5d50;color:#fff;padding:28px 24px}header h1{margin:0;font-size:26px}header p{margin:4px 0 0;opacity:.85}
  main{padding:24px}section{background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.08)}
  h2{margin:0 0 12px;font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
  dl{display:grid;grid-template-columns:1fr 1fr;gap:12px 20px;margin:0}dt{font-size:13px;color:#6b7280}dd{margin:0;font-weight:600}
  .code{font-size:30px;font-weight:700;letter-spacing:.05em;color:#2b5d50}.total{font-size:24px;font-weight:700}
  footer{padding:0 24px 24px;color:#6b7280;font-size:13px}
</style></head><body>
<header><h1>${esc(h.name)}</h1><p>Sua reserva está confirmada</p></header>
<main>
<section><h2>Confirmação</h2><div class="code">${esc(h.code)}</div><p>Reservado pelo Booking.com</p></section>
<section><h2>Estadia</h2><dl>
<dt>Check-in</dt><dd>${br(h.checkin)}<br>a partir das 15:00</dd>
<dt>Check-out</dt><dd>${br(h.checkout)}<br>até as 11:00</dd>
<dt>Quarto</dt><dd>Suíte com vista para o vale</dd>
<dt>Hóspedes</dt><dd>2 adultos · 2 noites</dd>
<dt>Café da manhã</dt><dd>Incluído</dd>
<dt>Telefone da pousada</dt><dd>${esc(h.phone)}</dd>
</dl></section>
<section><h2>Pagamento</h2><div class="total">Total: R$ ${h.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
<p>Cancelamento gratuito até ${br(h.cancelUntil)}. Depois dessa data, a primeira noite é cobrada.</p></section>
</main>
<footer>Este voucher foi gerado pelo laboratório do Viajei. Nenhum dado real.</footer>
</body></html>`;
}

/** O que a IA tem de tirar da confirmação; `address` e `notes` o voucher não diz. */
function expectedConfirmation(h: Hotel): ReadConfirmation {
  return {
    type: 'hotel',
    name: h.name,
    start_at: `${h.checkin}T15:00`,
    end_at: `${h.checkout}T11:00`,
    confirmation_code: h.code,
    amount: h.amount,
    cancel_policy: 'cancelamento gratuito',
    cancel_until: h.cancelUntil,
    phone: h.phone,
    address: null,
    booked_via: 'Booking',
    notes: null,
  };
}

// ------------------------------------------------------------------ a nota inventada
const RECEIPT = {
  merchant: 'POSTO MEDICAO LTDA',
  total: 201.18,
  date: '2017-08-15',
  time: '14:32',
} as const;

/** O cupom da NFC-e como as impressoras térmicas o fazem, com o QR fixo do e2e no rodapé. */
function receiptHtml(): string {
  const qr = readFileSync(NFCE_QR).toString('base64');
  const grouped = ACCESS_KEY.replace(/(\d{4})(?=\d)/g, '$1 ');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body{margin:0;background:#d9d6cf;padding:24px}
  .cupom{width:302px;margin:0 auto;background:#fdfdf8;padding:14px 12px;font:12px/1.35 "Courier New",monospace;color:#222;box-shadow:0 2px 6px rgba(0,0,0,.25)}
  .c{text-align:center}.b{font-weight:700}hr{border:0;border-top:1px dashed #555;margin:8px 0}
  table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}td.r{text-align:right;white-space:nowrap}
  img{display:block;margin:8px auto 4px;width:150px;height:150px;image-rendering:pixelated}
</style></head><body><div class="cupom">
<div class="c b">${RECEIPT.merchant}</div>
<div class="c">CNPJ: 00.156.225/0001-31  IE: 253.117.908</div>
<div class="c">ROD BR-116, KM 212 - CANELA - RS</div>
<hr>
<div class="c b">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
<hr>
<table>
<tr><td>001 GASOLINA COMUM</td><td class="r"></td></tr>
<tr><td>32,500 L x 6,19</td><td class="r">201,18</td></tr>
</table>
<hr>
<table>
<tr><td>Qtd. total de itens</td><td class="r">1</td></tr>
<tr><td class="b">VALOR TOTAL R$</td><td class="r b">201,18</td></tr>
<tr><td>FORMA DE PAGAMENTO</td><td class="r">Cartão de Débito</td></tr>
<tr><td>Valor pago R$</td><td class="r">201,18</td></tr>
</table>
<hr>
<div class="c">Consulte pela Chave de Acesso em</div>
<div class="c">https://sat.sef.sc.gov.br/nfce/consulta</div>
<div class="c b">${grouped}</div>
<hr>
<div class="c">CONSUMIDOR NÃO IDENTIFICADO</div>
<div class="c">NFC-e nº 000015134  Série 011  15/08/2017 14:32:10</div>
<div class="c">Protocolo de autorização: 342170012345678</div>
<img alt="" src="data:image/png;base64,${qr}">
<div class="c">Tributos totais incidentes (Lei Federal 12.741/2012): R$ 72,43</div>
</div></body></html>`;
}

const expectedReceipt: ReadReceipt = {
  total: RECEIPT.total,
  merchant: RECEIPT.merchant,
  cnpj: CNPJ,
  date: RECEIPT.date,
  time: RECEIPT.time,
  category: 'fuel',
  access_key: ACCESS_KEY,
};

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

// ------------------------------------------------------------------ a nota de cada leitura
type Score = { total: number; ok: number; missing: string[]; wrong: string[]; invented: string[] };

const norm = (t: string) =>
  t
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
const digits = (t: string) => t.replace(/\D/g, '');
const looseKeys = new Set(['name', 'merchant', 'booked_via', 'cancel_policy']);
const digitKeys = new Set(['phone', 'cnpj', 'access_key']);

/** Campo a campo: o esperado contra o lido, com a folga que cada tipo pede. */
function score(expected: Record<string, unknown>, got: Record<string, unknown>): Score {
  const out: Score = { total: 0, ok: 0, missing: [], wrong: [], invented: [] };
  for (const [key, want] of Object.entries(expected)) {
    out.total += 1;
    const have = got[key] ?? null;
    if (want === null) {
      if (have === null || have === '') out.ok += 1;
      else out.invented.push(key);
      continue;
    }
    if (have === null || have === '') {
      out.missing.push(key);
      continue;
    }
    let same: boolean;
    if (typeof want === 'number') same = typeof have === 'number' && Math.abs(have - want) < 0.005;
    else if (typeof have !== 'string' || typeof want !== 'string') same = false;
    else if (digitKeys.has(key)) same = digits(have) === digits(want);
    else if (looseKeys.has(key))
      same = norm(have).includes(norm(want)) || norm(want).includes(norm(have));
    else if (key === 'start_at' || key === 'end_at') same = have.slice(0, 16) === want;
    else if (key === 'time') same = have.slice(0, 5) === want;
    else same = norm(have) === norm(want);
    if (same) out.ok += 1;
    else out.wrong.push(key);
  }
  return out;
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
