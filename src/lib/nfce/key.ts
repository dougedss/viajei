/**
 * A chave de acesso da NF-e e da NFC-e e o QR code do DANFE NFC-e, puros. Conferido em 20/11/2026 nos
 * manuais do Portal da NF-e (nfe.fazenda.gov.br): o MOC 7.0 "Visão Geral" (Tabela 2-1, a chave da
 * versão 4.00; 2.2.6.2, o dígito verificador) e o "Manual de Padrões Técnicos do DANFE NFC-e e QR
 * Code" v6.0 (tabelas 2 e 3, o QR 2.00; tabelas 6 e 7, o QR 3.00).
 *
 * A chave tem 44 dígitos: cUF (2), AAMM da emissão (4), CNPJ ou CPF do emitente (14), modelo (2),
 * série (3), número (9), forma de emissão (1), código numérico (8) e o DV (1), módulo 11 com pesos de
 * 2 a 9 da direita para a esquerda (DV = 11 − resto; resto 0 ou 1 → 0). **A chave traz só o ano e o
 * mês da emissão, não o dia**: a data inteira só vem do QR na contingência offline, que leva o dia e
 * o valor total; no QR online (o comum) o dia e o total vêm da foto (a IA) ou da pessoa.
 *
 * O QR: a URL de consulta da SEFAZ com `?p=` e os parâmetros separados por `|`, a chave em primeiro.
 * Versão 2.00 online: chave|2|tpAmb|idCSC|hash; offline: chave|2|tpAmb|dia|vNF|digVal|idCSC|hash.
 * Versão 3.00 online: chave|3|tpAmb; offline: chave|3|tpAmb|dia|vNF|tpIdDest|idDest|assinatura.
 */
export type AccessKey = {
  key: string;
  /** o código IBGE da UF do emitente */
  uf: string;
  /** o ano (4 dígitos) e o mês da emissão */
  year: number;
  month: number;
  /** 14 dígitos: o CNPJ do emitente (ou o CPF com zeros à esquerda, a critério da UF) */
  cnpj: string;
  /** 55 = NF-e, 65 = NFC-e */
  model: string;
  series: string;
  number: string;
  emission: string;
  code: string;
  dv: number;
};

/** O DV (módulo 11, base 2 a 9) dos 43 primeiros dígitos. */
export function checkDigit(first43: string): number {
  let weight = 2;
  let sum = 0;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

/** Os 44 dígitos (com ou sem espaços) como chave, ou null quando não têm a forma ou o DV não bate. */
export function parseAccessKey(raw: string): AccessKey | null {
  const key = raw.replace(/\D/g, '');
  if (key.length !== 44) return null;
  const dv = Number(key[43]);
  if (checkDigit(key.slice(0, 43)) !== dv) return null;
  const yy = Number(key.slice(2, 4));
  const month = Number(key.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const model = key.slice(20, 22);
  if (model !== '55' && model !== '65') return null;
  return {
    key,
    uf: key.slice(0, 2),
    year: 2000 + yy,
    month,
    cnpj: key.slice(6, 20),
    model,
    series: key.slice(22, 25),
    number: key.slice(25, 34),
    emission: key.slice(34, 35),
    code: key.slice(35, 43),
    dv,
  };
}

export type NfceQr = {
  key: AccessKey;
  /** a versão do QR Code: 2 ou 3 */
  version: '2' | '3';
  /** 1 produção, 2 homologação */
  environment: '1' | '2';
  /** a contingência offline traz o dia da emissão e o valor total; a online, não */
  day: number | null;
  total: number | null;
};

/**
 * O texto de um QR code de NFC-e (a URL de consulta) como os dados dele; null quando o texto não é um
 * QR de NFC-e. Aceita a URL inteira ou só a query (`p=…`).
 */
export function parseNfceQr(text: string): NfceQr | null {
  const t = text.trim();
  const m = /(?:^|[?&])p=([^&#]+)/i.exec(t);
  const param = m?.[1];
  if (!param) return null;
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    // um % solto: o texto segue como está
  }
  const parts = decoded.split('|');
  const key = parts[0] ? parseAccessKey(parts[0]) : null;
  if (key?.model !== '65') return null;
  const version = parts[1];
  const environment = parts[2];
  if ((version !== '2' && version !== '3') || (environment !== '1' && environment !== '2')) {
    return null;
  }
  // offline: o 4º é o dia (2 dígitos) e o 5º o total com ponto; na online esses lugares não existem
  // (v3) ou são o id do CSC e o hash (v2)
  const offline = version === '3' ? parts.length >= 5 : parts.length >= 8;
  const dayText = offline ? (parts[3] ?? '') : '';
  const totalText = offline ? (parts[4] ?? '') : '';
  const day = /^\d{2}$/.test(dayText) ? Number(dayText) : null;
  const total = /^\d+(\.\d{1,2})?$/.test(totalText) ? Number(totalText) : null;
  return {
    key,
    version,
    environment,
    day: day !== null && day >= 1 && day <= 31 ? day : null,
    total,
  };
}

/** "2026-12" a partir da chave: o mês da emissão (o dia não está nela). */
export function emissionMonth(key: Pick<AccessKey, 'year' | 'month'>): string {
  return `${String(key.year)}-${String(key.month).padStart(2, '0')}`;
}

/**
 * A data inteira da emissão, só quando o QR trouxe o dia (contingência offline); null no QR online,
 * em que a data vem da foto ou da pessoa.
 */
export function emissionDate(qr: Pick<NfceQr, 'key' | 'day'>): string | null {
  if (qr.day === null) return null;
  const date = `${emissionMonth(qr.key)}-${String(qr.day).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ? null : date;
}

/** "12.345.678/0001-95" */
export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Os dígitos verificadores do CNPJ (módulo 11 com os pesos oficiais), para não consultar lixo. */
export function isValidCnpj(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights =
      len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(d[i]) * w, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}
