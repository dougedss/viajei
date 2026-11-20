import { READ_FN, readReceiptSchema, type ReadReceipt } from '@shared/read-protocol.ts';
import { streamEvents } from '@/features/import/client.ts';

/**
 * A leitura da nota pela `read-document` (fase 18): a foto já está no Storage; a função a lê de lá e
 * devolve o total, o estabelecimento, a data e a categoria. Só o `done` interessa (um objeto curto):
 * qualquer erro vira null, e a folha diz o que a nota não deu. Nada da nota passa por aqui em texto.
 */
export async function readReceipt(
  tripId: string,
  path: string,
  signal: AbortSignal,
): Promise<ReadReceipt | null> {
  let result: ReadReceipt | null = null;
  try {
    await streamEvents(
      READ_FN,
      { kind: 'receipt', trip_id: tripId, text: null, attachment: { path } },
      signal,
      (event) => {
        if (event.type !== 'done') return;
        const parsed = readReceiptSchema.safeParse(event.data);
        if (parsed.success) result = parsed.data;
      },
    );
  } catch {
    return null;
  }
  return result;
}
