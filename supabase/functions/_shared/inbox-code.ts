import { INBOX_DOMAIN } from './constants.ts';

/**
 * O código do endereço de e-mail de cada pessoa (fase 18), puro e comum ao app e à função de
 * recebimento: `r-` e seis símbolos de um alfabeto sem 0/o/1/l/i (a 0016 o gera no banco). O
 * endereço é `<código>@<domínio>`; a função lê o código antes do `@` em qualquer domínio e em qualquer
 * caixa, de qualquer destinatário (`to`, `received_for`), e nunca o registra em log.
 */
export const INBOX_CODE = /^r-[23456789abcdefghjkmnpqrstuvwxyz]{6}$/;

/** "r-7f3k9m@reservas.reitechia.com.br" */
export function inboxAddress(code: string, domain: string = INBOX_DOMAIN): string {
  return `${code}@${domain}`;
}

/**
 * O código de um endereço, se ele é um dos nossos: aceita "Nome <r-7f3k9m@…>", maiúsculas e espaços
 * em volta; null para qualquer outra coisa (o remetente, um endereço de fora, um código torto).
 */
export function inboxCodeOf(address: string): string | null {
  const m = /<([^<>]+)>\s*$/.exec(address.trim());
  const bare = (m?.[1] ?? address).trim().toLowerCase();
  const at = bare.lastIndexOf('@');
  if (at <= 0) return null;
  const local = bare.slice(0, at);
  return INBOX_CODE.test(local) ? local : null;
}

/** O primeiro código entre os destinatários (o envelope primeiro, depois o cabeçalho `to`). */
export function findInboxCode(addresses: readonly string[]): string | null {
  for (const a of addresses) {
    const code = inboxCodeOf(a);
    if (code) return code;
  }
  return null;
}

/** O endereço de e-mail puro de um remetente ("Hotel <reservas@hotel.com>" → "reservas@hotel.com"), em minúsculas. */
export function bareEmail(address: string): string | null {
  const m = /<([^<>]+)>\s*$/.exec(address.trim());
  const bare = (m?.[1] ?? address).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bare) ? bare : null;
}
