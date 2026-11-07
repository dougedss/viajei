import type { ContactType } from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type Contact } from '@/lib/db/schema.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';

/** As escritas dos contatos, pela `mutate` (offline primeiro). O telefone já chega em E.164. */
export type ContactValues = {
  name: string;
  phone: string;
  type: ContactType;
  notes: string | null;
};

export async function createContact(tripId: string, values: ContactValues): Promise<string> {
  const id = uuidV4();
  const now = new Date().toISOString();
  await mutate.insert('contacts', {
    id,
    trip_id: tripId,
    ...values,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function updateContact(id: string, values: ContactValues): Promise<void> {
  const current = await db.contacts.get(id);
  if (!current) throw new Error('O contato não existe mais neste aparelho.');
  const changes = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => current[k as keyof ContactValues] !== v),
  );
  await mutate.patch('contacts', id, changes);
}

/** Excluir, com o desfazer que devolve a linha inteira (`mutate.restore`). */
export async function removeContact(contact: Contact): Promise<() => Promise<void>> {
  await mutate.remove('contacts', contact.id);
  return () => mutate.restore('contacts', contact);
}
