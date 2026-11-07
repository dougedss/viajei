import { z } from 'zod';
import { IMPORT_MAX_CHARS } from '@shared/import-protocol.ts';
import { db } from '@/lib/db/schema.ts';
import type { Review } from './plan.ts';

/**
 * O rascunho da importação, no aparelho e por viagem: o texto colado e, depois da leitura, a revisão
 * em andamento. Mora no Dexie (`sync_state`), não no `localStorage`: o texto tem dados pessoais, e
 * "Sair da conta" apaga o banco local inteiro (D20). Nunca sincroniza. Some depois de salvar.
 * Fechar o app no meio da revisão não custa outra leitura.
 */
export const draftKeys = {
  text: (tripId: string) => `import:draft:${tripId}`,
  review: (tripId: string) => `import:review:${tripId}`,
};

/** A revisão guardada: o que a pessoa já decidiu, e de qual leitura veio (o id em `ai_imports`). */
export type StoredReview = {
  review: Review;
  /** null no carregador do exemplo ou quando o `start` não chegou */
  importId: string | null;
  /** a leitura parou antes do fim (`truncated`, ou a conexão caiu): só o que chegou inteiro */
  partial: boolean;
  saved_at: string;
};

// A forma mínima para confiar no que voltou do disco: uma versão antiga do app, ou um valor que não
// é uma revisão, vira "sem revisão", nunca uma tela quebrada.
const storedSchema = z.object({
  review: z.object({
    days: z.array(z.object({ date: z.string(), stops: z.array(z.object({ key: z.string() })) })),
    reservations: z.array(z.unknown()),
    contacts: z.array(z.unknown()),
    before: z.array(z.unknown()),
    pack: z.array(z.unknown()),
    quests: z.array(z.unknown()),
    unclassified: z.array(z.unknown()),
  }),
  importId: z.string().nullable(),
  partial: z.boolean(),
  saved_at: z.string(),
});

/** O valor guardado como revisão, ou null se não for uma (formato antigo, JSON quebrado). */
export function parseStoredReview(value: string | undefined): StoredReview | null {
  if (value === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return null;
  }
  // a validação é da forma; o conteúdo é o que o próprio app gravou
  return storedSchema.safeParse(json).success ? (json as StoredReview) : null;
}

/** O texto como fica guardado: no máximo o que a função aceita (o contador já não deixa passar). */
export function clampDraft(text: string): string {
  return text.length > IMPORT_MAX_CHARS ? text.slice(0, IMPORT_MAX_CHARS) : text;
}

export async function loadDraft(tripId: string): Promise<string> {
  return (await db.sync_state.get(draftKeys.text(tripId)))?.value ?? '';
}

export async function saveDraft(tripId: string, text: string): Promise<void> {
  if (text === '') await db.sync_state.delete(draftKeys.text(tripId));
  else await db.sync_state.put({ key: draftKeys.text(tripId), value: clampDraft(text) });
}

export async function loadReview(tripId: string): Promise<StoredReview | null> {
  return parseStoredReview((await db.sync_state.get(draftKeys.review(tripId)))?.value);
}

export async function saveReview(tripId: string, stored: StoredReview): Promise<void> {
  await db.sync_state.put({ key: draftKeys.review(tripId), value: JSON.stringify(stored) });
}

export async function clearReview(tripId: string): Promise<void> {
  await db.sync_state.delete(draftKeys.review(tripId));
}

/** Depois de salvar na viagem: o texto e a revisão saem do aparelho. */
export async function clearImport(tripId: string): Promise<void> {
  await db.sync_state.bulkDelete([draftKeys.text(tripId), draftKeys.review(tripId)]);
}
