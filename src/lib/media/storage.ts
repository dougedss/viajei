import type { SupabaseClient } from '@supabase/supabase-js';
import { isNetworkError } from '@/lib/db/network-error.ts';

/**
 * O Storage visto pela fila e pelo cache: cada resposta vira um destino. `exists` (o mesmo caminho
 * já subiu) conta como enviado, porque o caminho leva o id do anexo e o arquivo é imutável; `network`
 * não conta tentativa (D17); `rule` vai para Pendentes; `retry` espera e tenta de novo. Sem DOM:
 * o service worker usa o mesmo adaptador.
 */
export const BUCKET = 'attachments';

export type StorageVerdict = 'exists' | 'missing' | 'network' | 'retry' | 'rule';

export type UploadOutcome =
  | { kind: 'ok' }
  | { kind: 'exists' }
  | { kind: 'network' }
  | { kind: 'retry'; message: string }
  | { kind: 'rule'; message: string };
export type RemoveOutcome =
  { kind: 'ok' } | { kind: 'denied' } | { kind: 'network' } | { kind: 'retry'; message: string };
export type DownloadOutcome =
  | { kind: 'ok'; blob: Blob }
  | { kind: 'missing' }
  | { kind: 'network' }
  | { kind: 'retry'; message: string };

export type MediaStorage = {
  upload(path: string, blob: Blob, contentType: string): Promise<UploadOutcome>;
  remove(path: string): Promise<RemoveOutcome>;
  download(path: string): Promise<DownloadOutcome>;
};

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  originalError?: unknown;
};

function codeOf(err: ErrorLike): number | null {
  for (const v of [err.statusCode, err.status]) {
    const n = Number(v);
    if (Number.isInteger(n) && n >= 100 && n < 600) return n;
  }
  return null;
}

/**
 * O destino de um erro do supabase-js. O Storage devolve o código real em `statusCode` ("409" para
 * "já existe", "403" para a RLS, "413" para tamanho), às vezes com `status` 400; erro de rede chega
 * como `StorageUnknownError` com o `TypeError` do fetch em `originalError`.
 */
export function classifyStorageError(error: unknown): StorageVerdict {
  const err: ErrorLike = typeof error === 'object' && error !== null ? error : {};
  if (isNetworkError(err.originalError) || isNetworkError(error)) return 'network';
  const message = typeof err.message === 'string' ? err.message : '';
  const code = codeOf(err);
  if (code === 409 || /already exists|duplicate/i.test(message)) return 'exists';
  if (code === 404 || /not found/i.test(message)) return 'missing';
  // 401: o token venceu no meio do caminho; o supabase-js renova e a próxima tentativa passa
  if (code === null || code === 401 || code === 408 || code === 429 || code >= 500) return 'retry';
  return 'rule';
}

const RULE_MESSAGES: Record<number, string> = {
  403: 'Sem permissão para enviar nesta viagem.',
  413: 'O arquivo passa do limite de 10 MB.',
  415: 'Tipo de arquivo não aceito.',
};

export function ruleMessage(error: unknown): string {
  const err: ErrorLike = typeof error === 'object' && error !== null ? error : {};
  const code = codeOf(err);
  if (code !== null && RULE_MESSAGES[code]) return RULE_MESSAGES[code];
  if (typeof err.message === 'string' && /row-level security/i.test(err.message)) {
    return RULE_MESSAGES[403] ?? '';
  }
  return 'O servidor recusou o arquivo.';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function supabaseStorage(client: Pick<SupabaseClient, 'storage'>): MediaStorage {
  const bucket = () => client.storage.from(BUCKET);
  return {
    async upload(path, blob, contentType) {
      try {
        const { error } = await bucket().upload(path, blob, { upsert: false, contentType });
        if (!error) return { kind: 'ok' };
        const verdict = classifyStorageError(error);
        if (verdict === 'exists') return { kind: 'exists' };
        if (verdict === 'network') return { kind: 'network' };
        if (verdict === 'retry') return { kind: 'retry', message: messageOf(error) };
        return { kind: 'rule', message: ruleMessage(error) }; // missing aqui é o bucket: regra
      } catch (error) {
        return classifyStorageError(error) === 'network'
          ? { kind: 'network' }
          : { kind: 'retry', message: messageOf(error) };
      }
    },
    async remove(path) {
      try {
        const { data, error } = await bucket().remove([path]);
        if (error) {
          const verdict = classifyStorageError(error);
          if (verdict === 'network') return { kind: 'network' };
          if (verdict === 'retry') return { kind: 'retry', message: messageOf(error) };
          return { kind: 'denied' };
        }
        // a RLS não dá erro: o objeto simplesmente não sai (ou já não existia)
        return data.length > 0 ? { kind: 'ok' } : { kind: 'denied' };
      } catch (error) {
        return classifyStorageError(error) === 'network'
          ? { kind: 'network' }
          : { kind: 'retry', message: messageOf(error) };
      }
    },
    async download(path) {
      try {
        const { data, error } = await bucket().download(path);
        if (!error) return { kind: 'ok', blob: data };
        const verdict = classifyStorageError(error);
        if (verdict === 'network') return { kind: 'network' };
        if (verdict === 'missing' || verdict === 'rule') return { kind: 'missing' };
        return { kind: 'retry', message: messageOf(error) };
      } catch (error) {
        return classifyStorageError(error) === 'network'
          ? { kind: 'network' }
          : { kind: 'retry', message: messageOf(error) };
      }
    },
  };
}
