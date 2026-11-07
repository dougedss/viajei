import { escapeText, foldLine } from '@/lib/text/content-lines.ts';

/**
 * "Salvar no celular": um `.vcf` gerado à mão, sem dependência, como o `.ics` (D44). vCard 3.0, e
 * não 4.0 (RFC 6350): os Contatos do iPhone importam o 3.0 sem surpresa, e o telefone do 4.0 (como
 * URI `tel:`) é o campo que costuma se perder. Os campos são os mesmos nas duas versões: FN, N, TEL,
 * ORG (a viagem, para a pessoa achar depois) e NOTE. Linhas dobradas em 75 octetos, CRLF.
 */
export type VCardContact = { name: string; phone: string; notes: string | null };

export function toVCard(contacts: readonly VCardContact[], org: string | null = null): string {
  const lines: string[] = [];
  for (const c of contacts) {
    lines.push(
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeText(c.name)}`,
      // N: sobrenome;nome;…: um hotel não tem sobrenome, então o nome inteiro vai no "nome"
      `N:;${escapeText(c.name)};;;`,
      `TEL;TYPE=VOICE:${c.phone}`,
    );
    if (org) lines.push(`ORG:${escapeText(org)}`);
    if (c.notes) lines.push(`NOTE:${escapeText(c.notes)}`);
    lines.push('END:VCARD');
  }
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** "viajei-contatos-rs-concurso-em-montenegro.vcf" ou "hotel-steffen.vcf". */
export function vcardFilename(base: string): string {
  const slug = base
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'contatos'}.vcf`;
}
