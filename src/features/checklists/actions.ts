import type { ChecklistKind } from '@shared/constants.ts';
import { mutate } from '@/lib/db/mutate.ts';
import { db, type ChecklistItem } from '@/lib/db/schema.ts';
import { comparePosition, positionAtEnd, positionForMove } from '@/lib/ids/position.ts';
import { uuidV4 } from '@/lib/ids/uuid.ts';
import { listItems } from './rules.ts';
import type { Suggestion } from './suggestions.ts';

/**
 * As escritas das listas, todas pela `mutate` (offline primeiro). Marcar grava quem e quando; mover
 * grava só a posição de quem moveu (um arrasto, um patch); a sugestão só vira linha pela ação.
 */
async function lastPosition(tripId: string, kind: ChecklistKind): Promise<string | null> {
  const rows = await db.checklist_items.where('trip_id').equals(tripId).toArray();
  const positions = rows
    .filter((r) => r.kind === kind && r.deleted_at === null)
    .map((r) => r.position)
    .sort(comparePosition);
  return positions.at(-1) ?? null;
}

type NewItem = {
  id?: string;
  kind: ChecklistKind;
  text: string;
  points?: number;
  stopId?: string | null;
  source?: ChecklistItem['source'];
  status?: ChecklistItem['status'];
};

export async function addItem(tripId: string, uid: string, item: NewItem): Promise<string> {
  const id = item.id ?? uuidV4();
  const now = new Date().toISOString();
  const last = await lastPosition(tripId, item.kind);
  await mutate.insert('checklist_items', {
    id,
    trip_id: tripId,
    kind: item.kind,
    text: item.text.trim().slice(0, 200),
    position: positionAtEnd(last ? [last] : []),
    points: item.kind === 'quest' ? (item.points ?? 10) : 0,
    stop_id: item.kind === 'quest' ? (item.stopId ?? null) : null,
    source: item.source ?? 'user',
    status: item.status ?? 'active',
    done_by: null,
    done_at: null,
    created_by: uid,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

/** Marcar ou desmarcar; marcar grava quem e quando (`check` do banco: os dois andam juntos). */
export async function setDone(item: ChecklistItem, uid: string, done: boolean): Promise<void> {
  await mutate.patch(
    'checklist_items',
    item.id,
    done ? { done_by: uid, done_at: new Date().toISOString() } : { done_by: null, done_at: null },
  );
}

export async function editItem(
  item: ChecklistItem,
  changes: { text?: string; points?: number; stopId?: string | null },
): Promise<void> {
  const next: Partial<ChecklistItem> = {};
  if (changes.text !== undefined && changes.text.trim() !== item.text) {
    next.text = changes.text.trim().slice(0, 200);
  }
  if (item.kind === 'quest' && changes.points !== undefined && changes.points !== item.points) {
    next.points = changes.points;
  }
  if (item.kind === 'quest' && changes.stopId !== undefined && changes.stopId !== item.stop_id) {
    next.stop_id = changes.stopId;
  }
  await mutate.patch('checklist_items', item.id, next);
}

/**
 * Excluir. O que nasceu de sugestão (id determinístico) vira "dispensado", e não lápide: a lápide some
 * do aparelho no pull e a sugestão voltaria. O desfazer devolve o estado anterior.
 */
export async function removeItem(item: ChecklistItem): Promise<() => Promise<void>> {
  if (item.source === 'system') {
    await mutate.patch('checklist_items', item.id, { status: 'dismissed' });
    return () => mutate.patch('checklist_items', item.id, { status: item.status });
  }
  await mutate.remove('checklist_items', item.id);
  return () => mutate.restore('checklist_items', item);
}

/** Mover dentro de uma lista: só a posição de quem moveu muda. */
export async function moveItem(
  tripId: string,
  kind: ChecklistKind,
  from: number,
  to: number,
): Promise<void> {
  const rows = await db.checklist_items.where('trip_id').equals(tripId).toArray();
  const list = listItems(rows, kind);
  const moved = list[from];
  const position = positionForMove(
    list.map((i) => i.position),
    from,
    to,
  );
  if (!moved || position === null) return;
  await mutate.patch('checklist_items', moved.id, { position });
}

/**
 * Desfazer o "Dispensar": a linha volta a ser sugestão (`suggested`) e reaparece como linha
 * esmaecida. Nunca lápide: a lápide some do aparelho no pull, e a próxima resposta de outra pessoa
 * escreveria por cima de uma linha que este aparelho já não vê.
 */
export async function undoDismiss(id: string): Promise<void> {
  await mutate.patch('checklist_items', id, { status: 'suggested' });
}

/**
 * Adicionar ou dispensar uma sugestão: a linha nasce com o id determinístico, ativa ou dispensada.
 * Dois aparelhos que tocam ao mesmo tempo escrevem a mesma linha; a última escolha vence (LWW).
 */
export async function answerSuggestion(
  tripId: string,
  uid: string,
  s: Suggestion,
  answer: 'add' | 'dismiss',
): Promise<void> {
  const existing = await db.checklist_items.get(s.id);
  const status = answer === 'add' ? 'active' : 'dismissed';
  if (existing) {
    await mutate.patch('checklist_items', s.id, { status });
    return;
  }
  await addItem(tripId, uid, {
    id: s.id,
    kind: s.kind,
    text: s.text,
    points: s.points,
    stopId: s.stop_id,
    source: 'system',
    status,
  });
}
