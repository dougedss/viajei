import { useLiveQuery } from 'dexie-react-hooks';
import { z } from 'zod';
import { db, type InboxAddress, type ReceivedReservation } from '@/lib/db/schema.ts';

/**
 * As reservas recebidas por e-mail (fase 18) e o endereço da pessoa, do Dexie, ao vivo: as duas
 * tabelas chegam pelo pull do usuário (escopo `user`) e só a própria pessoa as tem.
 */
export const receivedFileSchema = z.object({
  id: z.string(),
  storage_path: z.string(),
  filename: z.string(),
  mime: z.string(),
  size_bytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});
export type ReceivedFile = z.infer<typeof receivedFileSchema>;

/** Os anexos listados numa recebida; um valor fora do formato vira lista vazia, nunca uma tela quebrada. */
export function filesOf(row: Pick<ReceivedReservation, 'files'>): ReceivedFile[] {
  const parsed = z.array(receivedFileSchema).safeParse(row.files);
  return parsed.success ? parsed.data : [];
}

/** As recebidas ainda sem destino, a mais nova primeiro. `undefined` enquanto carrega. */
export function useReceivedReservations(): ReceivedReservation[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.received_reservations.where('status').equals('received').toArray()).sort((a, b) =>
        b.received_at.localeCompare(a.received_at),
      ),
    [],
  );
}

/** O endereço de e-mail da pessoa; `null` enquanto o pull não o trouxe. */
export function useInboxAddress(uid: string | null): InboxAddress | null | undefined {
  return useLiveQuery(
    async () => (uid ? ((await db.inbox_addresses.get(uid)) ?? null) : null),
    [uid],
  );
}
