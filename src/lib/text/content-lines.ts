/**
 * Linhas de conteúdo dos formatos de texto do calendário e dos contatos: o `.ics` (RFC 5545) e o
 * `.vcf` (vCard) usam as mesmas regras de escape e a mesma dobra em 75 octetos com CRLF.
 */
const LINE_OCTETS = 75;

/** Escapes de valor de texto (RFC 5545 e vCard): barra, ponto e vírgula, vírgula e quebra de linha. */
export function escapeText(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r?\n/g, '\\n');
}

/** Dobra em 75 octetos, sem partir um caractere multibyte; continuação começa com espaço. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? LINE_OCTETS : LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = ch;
      octets = size;
    } else {
      current += ch;
      octets += size;
    }
  }
  parts.push(current);
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join('\r\n');
}
