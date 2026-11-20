import { db } from '@/lib/db/schema.ts';

/**
 * O texto colado em "Ler a confirmação", no aparelho e por viagem, como o rascunho da importação
 * (D138): no Dexie (`sync_state`), não no `localStorage`, porque tem dados pessoais e "Sair da conta"
 * apaga o banco local inteiro (D20). Nunca sincroniza; some depois de salvar a reserva. O anexo não
 * fica guardado: se a tela recarregar, a pessoa o escolhe de novo.
 */
export const readDraftKey = (tripId: string) => `read:draft:${tripId}`;

export async function loadReadDraft(tripId: string): Promise<string> {
  return (await db.sync_state.get(readDraftKey(tripId)))?.value ?? '';
}

export async function saveReadDraft(tripId: string, text: string): Promise<void> {
  if (text.trim() === '') {
    await db.sync_state.delete(readDraftKey(tripId));
    return;
  }
  await db.sync_state.put({ key: readDraftKey(tripId), value: text });
}

export async function clearReadDraft(tripId: string): Promise<void> {
  await db.sync_state.delete(readDraftKey(tripId));
}
