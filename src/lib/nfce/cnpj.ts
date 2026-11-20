import { isValidCnpj } from './key.ts';

/**
 * O estabelecimento pelo CNPJ, na BrasilAPI (`GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, sem
 * chave; CORS `*`, conferido com uma chamada em 20/11/2026), com cache no aparelho por CNPJ: uma
 * consulta por nota, nunca duas pelo mesmo emitente, dentro do uso justo que o README do projeto pede
 * ("como uma pessoa real requisitando um determinado dado"). Puro: o `fetch` e o cache são injetados.
 */
export const BRASILAPI_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1/';
const TIMEOUT_MS = 8_000;

export type Merchant = {
  cnpj: string;
  /** o nome fantasia; sem ele, a razão social */
  name: string;
  city: string | null;
  uf: string | null;
  fetched_at: string;
};

export type CnpjCache = {
  get(cnpj: string): Promise<Merchant | undefined>;
  put(merchant: Merchant): Promise<void>;
};

export type CnpjDeps = {
  fetch: typeof fetch;
  cache: CnpjCache;
  now?: () => number;
};

/**
 * "POSTO DA SERRA LTDA" → "Posto da Serra Ltda": a Receita grava tudo em maiúsculas. As preposições
 * curtas ficam minúsculas; uma sigla de duas letras ("BR", "RS") e uma abreviação com ponto ("S.A.")
 * ficam como vieram.
 */
export function tidyName(raw: string): string {
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o']);
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, i) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      if (i > 0 && small.has(lower)) return lower;
      if ((word.length <= 2 || word.includes('.')) && word === word.toUpperCase()) return word;
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
    .join(' ');
}

const text = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

/** O estabelecimento, do cache ou da BrasilAPI; null quando o CNPJ não vale, não existe ou a API não respondeu. */
export async function lookupCnpj(cnpj: string, deps: CnpjDeps): Promise<Merchant | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (!isValidCnpj(digits)) return null;
  const cached = await deps.cache.get(digits);
  if (cached) return cached;
  let res: Response;
  try {
    res = await deps.fetch(`${BRASILAPI_CNPJ_URL}${digits}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json: unknown = await res.json().catch(() => null);
  if (typeof json !== 'object' || json === null) return null;
  const body = json as Record<string, unknown>;
  const name = text(body.nome_fantasia) ?? text(body.razao_social);
  if (!name) return null;
  const merchant: Merchant = {
    cnpj: digits,
    name: tidyName(name),
    city: text(body.municipio) ? tidyName(text(body.municipio) ?? '') : null,
    uf: text(body.uf),
    fetched_at: new Date((deps.now ?? Date.now)()).toISOString(),
  };
  await deps.cache.put(merchant);
  return merchant;
}

/** Um cache em memória, para os testes e para quem não tem o Dexie. */
export function memoryCnpjCache(): CnpjCache & { size: () => number } {
  const map = new Map<string, Merchant>();
  return {
    get: (cnpj) => Promise.resolve(map.get(cnpj)),
    put: (m) => {
      map.set(m.cnpj, m);
      return Promise.resolve();
    },
    size: () => map.size,
  };
}
