import { isNetworkError } from '../network-error.ts';
import {
  backoffMs,
  MAX_ATTEMPTS,
  resolveResults,
  toBatches,
  type PushOp,
  type PushResult,
  type Resolution,
} from '../outbox.ts';
import { syncKeys, type ViajeiDb } from '../schema.ts';
import { removeWithChildren } from './apply-pull.ts';

export type PushRpc = (ops: PushOp[]) => Promise<PushResult[]>;

export type PushOutcome = {
  /** operações da outbox que saíram da fila */
  done: number;
  /** operações que foram para "Pendentes" por erro de regra */
  failed: number;
  /** a rede caiu no meio: o que sobrou fica para a próxima vez */
  offline: boolean;
  notices: Resolution['notices'];
};

/**
 * Envia a outbox: funde, ordena por rank, manda em lotes de até 200. Erro de rede não conta
 * tentativa (é a conectividade, não a operação); o motor volta quando a rede voltar. Erro do
 * servidor no lote inteiro conta tentativa com backoff e, na quinta, a operação vai para "Pendentes".
 * Erro de regra numa operação (RLS, check, whitelist) vai direto para "Pendentes", sem insistir.
 */
export async function pushOutbox(
  db: ViajeiDb,
  rpc: PushRpc,
  now = Date.now(),
): Promise<PushOutcome> {
  const outcome: PushOutcome = { done: 0, failed: 0, offline: false, notices: [] };
  const pending = (await db.outbox.where('state').equals('pending').sortBy('seq')).filter(
    (op) => op.next_at <= now,
  );
  if (pending.length === 0) return outcome;

  for (const batch of toBatches(pending)) {
    let results: PushResult[];
    try {
      results = await rpc(batch);
    } catch (err) {
      if (isNetworkError(err)) {
        outcome.offline = true;
        return outcome;
      }
      await retryLater(db, batch, err instanceof Error ? err.message : String(err), now);
      return outcome;
    }
    const resolution = resolveResults(batch, results);
    await db.transaction('rw', db.outbox, db.sync_state, async () => {
      if (resolution.done.length > 0) await db.outbox.bulkDelete(resolution.done);
      for (const f of resolution.failed) {
        await db.outbox.update(f.seq, { state: 'failed', last_error: f.error, next_at: 0 });
      }
      // a primeira escrita sem sinal que chegou ao servidor: a hora do envio e a viagem dela
      const first = resolution.offline[0];
      if (first && !(await db.sync_state.get(syncKeys.offlineSynced))) {
        await db.sync_state.put({
          key: syncKeys.offlineSynced,
          value: JSON.stringify({ at: new Date(now).toISOString(), trip_id: first.trip_id }),
        });
      }
    });
    outcome.done += resolution.done.length;
    outcome.failed += resolution.failed.length;
    outcome.notices.push(...resolution.notices);
  }
  return outcome;
}

/** O lote inteiro falhou no servidor: conta a tentativa em cada operação e agenda o backoff. */
async function retryLater(db: ViajeiDb, batch: PushOp[], error: string, now: number) {
  const seqs = batch.flatMap((op) => op.sources);
  await db.transaction('rw', db.outbox, async () => {
    for (const seq of seqs) {
      const op = await db.outbox.get(seq);
      if (!op) continue;
      const attempts = op.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await db.outbox.update(seq, { attempts, state: 'failed', last_error: error, next_at: 0 });
      } else {
        await db.outbox.update(seq, {
          attempts,
          last_error: error,
          next_at: now + backoffMs(attempts),
        });
      }
    }
  });
}

/** "Tentar de novo" em Pendentes: volta a operação para a fila, zerando as tentativas. */
export async function retryOp(db: ViajeiDb, seq: number): Promise<void> {
  await db.outbox.update(seq, { state: 'pending', attempts: 0, next_at: 0, last_error: null });
}

/**
 * "Descartar" em Pendentes: a única forma de uma operação sair da outbox sem ter sido enviada, e é
 * a pessoa quem decide. Um insert que nunca foi aceito leva a linha local junto (ela não existe no
 * servidor); um patch descartado zera o cursor da viagem, para o próximo pull trazer a linha como
 * o servidor a tem e desfazer a edição local.
 */
export async function discardOp(db: ViajeiDb, seq: number): Promise<void> {
  const op = await db.outbox.get(seq);
  if (!op) return;
  await db.transaction('rw', [...db.tables.map((t) => t.name)], async () => {
    await db.outbox.delete(seq);
    if (op.op === 'upsert') await removeWithChildren(db, op.table, op.row_id);
    await db.sync_state.delete(op.trip_id ? syncKeys.tripCursor(op.trip_id) : syncKeys.userCursor);
  });
}
