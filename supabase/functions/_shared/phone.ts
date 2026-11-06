/**
 * Telefone digitado à brasileira, guardado em E.164 (o `check` de `reservations.phone` e, na fase 8,
 * de `contacts.phone`). Puro, compartilhado com a importação (fase 10). Aceita "(51) 99752-7596",
 * "51 99752 7596", "+55 51 99752-7596", "0 51 99752-7596" (zero de longa distância), "0 15 51 …"
 * (com operadora) e números de fora com "+" ou "00". Sem DDD não dá para saber o número inteiro.
 */
export type PhoneResult =
  | { ok: true; e164: string }
  | { ok: false; reason: 'empty' | 'no-area-code' | 'toll-free' | 'invalid'; message: string };

const E164 = /^\+[1-9][0-9]{7,14}$/;

const MESSAGES = {
  empty: 'Digite o telefone.',
  'no-area-code': 'Inclua o DDD: (51) 99752-7596.',
  'toll-free': 'Números 0800 e 0300 só funcionam no Brasil e não têm formato internacional.',
  invalid: 'Telefone inválido. Use DDD e número, ou +código do país.',
} as const;

function fail(reason: keyof typeof MESSAGES): PhoneResult {
  return { ok: false, reason, message: MESSAGES[reason] };
}

/** DDD + 8 dígitos (fixo) ou DDD + 9 começando com 9 (celular); DDD de 11 a 99. */
function brazilian(national: string): PhoneResult {
  if (!/^[1-9][1-9]\d{8,9}$/.test(national)) return fail('invalid');
  if (national.length === 11 && national[2] !== '9') return fail('invalid');
  return { ok: true, e164: `+55${national}` };
}

export function toE164(input: string): PhoneResult {
  const raw = input.trim();
  if (raw === '') return fail('empty');
  if (/[^\d\s()+.\-/]/.test(raw)) return fail('invalid');
  const plus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!plus && digits.startsWith('00')) {
    // prefixo internacional: 00 + país
    return international(digits.slice(2));
  }
  if (plus) return international(digits);
  if (/^0[38]00/.test(digits)) return fail('toll-free');
  if (digits.startsWith('0')) {
    // 0 + DDD + número, ou 0 + operadora (2 dígitos) + DDD + número
    digits = digits.length >= 13 ? digits.slice(3) : digits.slice(1);
  }
  if (digits.length === 8 || digits.length === 9) return fail('no-area-code');
  if (digits.length === 12 || digits.length === 13) {
    // 55 + DDD + número, digitado sem o "+"
    if (digits.startsWith('55')) return brazilian(digits.slice(2));
  }
  return brazilian(digits);
}

function international(digits: string): PhoneResult {
  if (digits.startsWith('55')) return brazilian(digits.slice(2));
  const e164 = `+${digits}`;
  return E164.test(e164) ? { ok: true, e164 } : fail('invalid');
}

/** "(51) 99752-7596" para o Brasil; os de fora como estão em E.164. */
export function formatPhone(e164: string): string {
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1] ?? ''}) ${m[2] ?? ''}-${m[3] ?? ''}`;
}
