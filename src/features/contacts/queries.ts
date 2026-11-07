import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Contact } from '@/lib/db/schema.ts';

/** Os contatos vivos da viagem. `undefined` enquanto carrega. */
export function useTripContacts(tripId: string): Contact[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.contacts.where('trip_id').equals(tripId).toArray()).filter(
        (c) => c.deleted_at === null,
      ),
    [tripId],
  );
}
