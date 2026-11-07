import { z } from 'zod';
import { rankOf, scopeOf, type SyncTable } from './registry.ts';
import type { OutboxOp } from './schema.ts';

/** Uma operação como vai no lote do `sync_push`, com os `seq` da outbox que ela resume. */
export type PushOp = {
  seq: number;
  table: SyncTable;
  id: string;
  op: 'upsert' | 'patch';
  values: Record<string, unknown>;
  versions: Record<string, string>;
  updated_at: string;
  /** operações da outbox fundidas nesta */
  sources: number[];
  /** a viagem da linha (null nas de escopo `user`), da primeira operação fundida */
  trip_id?: string | null;
  /** alguma das operações fundidas nasceu sem sinal */
  offline?: boolean;
};

/** A resposta do `sync_push`, validada antes de decidir o destino de cada operação. */
export const pushResultsSchema = z.array(
  z.object({
    seq: z.number(),
    status: z.enum(['applied', 'ignored', 'stale', 'error']),
    superseded: z.array(z.string()).optional(),
    code: z.string().optional(),
    message: z.string().optional(),
  }),
);
export type PushResult = z.infer<typeof pushResultsSchema>[number];
export type PushStatus = PushResult['status'];

export const BATCH_LIMIT = 200;
export const MAX_ATTEMPTS = 5;

/**
 * Funde as operações pendentes da mesma linha numa só: um upsert seguido de patches vira um upsert
 * com os valores mais novos; patches viram um patch. Para cada coluna fica a versão mais recente.
 * Mantém o `seq` da primeira operação, para a ordem dentro da tabela continuar sendo a de criação.
 */
export function coalesce(ops: readonly OutboxOp[]): PushOp[] {
  const byRow = new Map<string, PushOp>();
  for (const op of [...ops].sort((a, b) => a.seq - b.seq)) {
    const key = `${op.table}:${op.row_id}`;
    const prev = byRow.get(key);
    if (!prev) {
      byRow.set(key, {
        seq: op.seq,
        table: op.table,
        id: op.row_id,
        op: op.op,
        values: { ...op.values },
        versions: { ...op.versions },
        updated_at: op.updated_at,
        sources: [op.seq],
        trip_id: op.trip_id,
        offline: op.offline === true,
      });
      continue;
    }
    if (op.offline === true) prev.offline = true;
    prev.op = prev.op === 'upsert' || op.op === 'upsert' ? 'upsert' : 'patch';
    for (const [col, value] of Object.entries(op.values)) {
      const mine = op.versions[col];
      const theirs = prev.versions[col];
      if (!theirs || !mine || mine >= theirs) {
        prev.values[col] = value;
        if (mine) prev.versions[col] = mine;
      }
    }
    if (op.updated_at > prev.updated_at) prev.updated_at = op.updated_at;
    prev.sources.push(op.seq);
  }
  return [...byRow.values()];
}

/**
 * Ordena por rank de tabela (pais antes de filhos) e, dentro da tabela, por seq. Por quê não FIFO
 * puro: com a coalescência, "crio a parada P no dia D1, crio D2, movo P para D2" fundiria P antes
 * de D2 e quebraria a FK.
 */
export function orderByRank(ops: readonly PushOp[]): PushOp[] {
  return [...ops].sort((a, b) => rankOf(a.table) - rankOf(b.table) || a.seq - b.seq);
}

/** Lotes de até 200 operações, já fundidas e ordenadas. */
export function toBatches(ops: readonly OutboxOp[], limit = BATCH_LIMIT): PushOp[][] {
  const ordered = orderByRank(coalesce(ops));
  const batches: PushOp[][] = [];
  for (let i = 0; i < ordered.length; i += limit) batches.push(ordered.slice(i, i + limit));
  return batches;
}

/** Espera antes da próxima tentativa: 1 s, 2 s, 4 s… até 60 s. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
}

export type Resolution = {
  /** seqs da outbox que saem da fila (applied, ignored ou stale) */
  done: number[];
  /** seqs que vão para "Pendentes" com o motivo (erro de regra: check, RLS, whitelist) */
  failed: { seq: number; error: string }[];
  /** avisos discretos: edição mais nova de outro aparelho prevaleceu */
  notices: { table: SyncTable; id: string; columns: string[] }[];
  /** escritas feitas sem sinal que o servidor aceitou agora (o fato da conquista `offline_hero`) */
  offline: { table: SyncTable; id: string; trip_id: string }[];
};

/**
 * Conta como "algo marcado sem sinal": uma escrita da pessoa numa tabela da viagem. A trilha do modo
 * painel é gravada sozinha, e XP, conquistas e preferências são da própria pessoa, não do time.
 */
export function isDerived(table: SyncTable): boolean {
  return table === 'achievements' || table === 'xp_events';
}

export function countsAsOfflineWrite(table: SyncTable): boolean {
  return scopeOf(table) === 'trip' && table !== 'trip_tracks';
}

/** Lê a resposta do `sync_push` e decide o destino de cada operação da outbox. */
export function resolveResults(
  batch: readonly PushOp[],
  results: readonly PushResult[],
): Resolution {
  const bySeq = new Map(results.map((r) => [r.seq, r]));
  const out: Resolution = { done: [], failed: [], notices: [], offline: [] };
  for (const op of batch) {
    const r = bySeq.get(op.seq);
    if (!r) {
      out.failed.push(...op.sources.map((seq) => ({ seq, error: 'sem resposta do servidor' })));
      continue;
    }
    switch (r.status) {
      case 'applied':
      case 'ignored':
        out.done.push(...op.sources);
        if (r.status === 'applied' && op.offline && op.trip_id && countsAsOfflineWrite(op.table))
          out.offline.push({ table: op.table, id: op.id, trip_id: op.trip_id });
        if (r.superseded && r.superseded.length > 0)
          out.notices.push({ table: op.table, id: op.id, columns: r.superseded });
        break;
      case 'stale':
        out.done.push(...op.sources);
        out.notices.push({ table: op.table, id: op.id, columns: Object.keys(op.versions) });
        break;
      case 'error':
        // XP e conquista são derivados: recusados (a pessoa saiu da viagem antes do envio, por
        // exemplo), saem da fila sem ir para Pendentes, porque a próxima derivação recalcula tudo
        if (isDerived(op.table)) {
          out.done.push(...op.sources);
          break;
        }
        out.failed.push(
          ...op.sources.map((seq) => ({ seq, error: describeError(r.code, r.message) })),
        );
        break;
    }
  }
  return out;
}

const ERROR_MESSAGES: Record<string, string> = {
  '42501': 'Sem permissão para esta alteração.',
  P0002: 'O item não existe mais ou você não tem mais acesso a ele.',
  '23505': 'Já existe um item igual.',
  '23514': 'O servidor recusou o valor informado.',
  '23503': 'O item depende de algo que não existe mais.',
};

export function describeError(code: string | undefined, message: string | undefined): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return message ?? 'O servidor recusou a alteração.';
}
