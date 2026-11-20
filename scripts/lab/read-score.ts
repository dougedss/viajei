import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toE164 } from '../../supabase/functions/_shared/phone.ts';
import type {
  ReadConfirmation,
  ReadReceipt,
} from '../../supabase/functions/_shared/read-protocol.ts';
import { addDays } from './arm.ts';

/**
 * A parte pura da medição da leitura (fase 18): as entradas inventadas (a confirmação como texto e como
 * página, a nota como cupom com o QR fixo do e2e), o que a IA tem de tirar de cada uma e a nota de
 * cada leitura. Sem Playwright e sem rede, para o Vitest; a `measure-read.ts` renderiza e mede.
 */
/** a imagem fixa do e2e, pela raiz do repositório (o laboratório e o Vitest rodam de lá, como os e2e) */
const NFCE_QR = join(process.cwd(), 'e2e/helpers/fixtures/nfce-qr.png');
/** a chave do QR fixo (fecha o DV; o CNPJ, a data e a hora da nota inventada seguem dela) */
const ACCESS_KEY = '28170800156225000131650110000151341562040828';
const CNPJ = '00156225000131';

const br = (iso: string) => iso.split('-').reverse().join('/');
const esc = (t: string) =>
  t.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// ------------------------------------------------------------------ a confirmação inventada
export type Hotel = {
  name: string;
  code: string;
  checkin: string;
  checkout: string;
  amount: number;
  phone: string;
  cancelUntil: string;
};

export function hotelFor(today: string): Hotel {
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
export function confirmationText(h: Hotel): string {
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
export function confirmationHtml(h: Hotel): string {
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

/**
 * O que a IA tem de tirar da confirmação. `address` o voucher não diz: preenchido, é invenção. `notes`
 * é livre (o que sobra do voucher, como o quarto e o café, pode ir para lá) e não entra na nota.
 */
export function expectedConfirmation(h: Hotel): ReadConfirmation {
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
export function receiptHtml(): string {
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

export const expectedReceipt: ReadReceipt = {
  total: RECEIPT.total,
  merchant: RECEIPT.merchant,
  cnpj: CNPJ,
  date: RECEIPT.date,
  time: RECEIPT.time,
  category: 'fuel',
  access_key: ACCESS_KEY,
};

// ------------------------------------------------------------------ a nota de cada leitura
export type Score = {
  total: number;
  ok: number;
  missing: string[];
  wrong: string[];
  invented: string[];
};

const norm = (t: string) =>
  t
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
const digits = (t: string) => t.replace(/\D/g, '');
const looseKeys = new Set(['name', 'merchant', 'booked_via', 'cancel_policy']);
const digitKeys = new Set(['cnpj', 'access_key']);
/** texto livre: a IA pode pôr ali o que sobrou; não é certo nem errado nem inventado */
const freeKeys = new Set(['notes']);
/** o mesmo telefone em qualquer grafia: "(54) 99988-1234", "+55 54 99988-1234", "+5554999881234" */
const samePhone = (a: string, b: string) => {
  const x = toE164(a);
  const y = toE164(b);
  return x.ok && y.ok ? x.e164 === y.e164 : digits(a) === digits(b);
};

/** Campo a campo: o esperado contra o lido, com a folga que cada tipo pede. */
export function score(expected: Record<string, unknown>, got: Record<string, unknown>): Score {
  const out: Score = { total: 0, ok: 0, missing: [], wrong: [], invented: [] };
  for (const [key, want] of Object.entries(expected)) {
    if (freeKeys.has(key)) continue;
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
    else if (key === 'phone') same = samePhone(have, want);
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
