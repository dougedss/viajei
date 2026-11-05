import { mutate } from '@/lib/db/mutate.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { isDepartureNode, type DayState } from './rules.ts';

/**
 * As escritas do "Agora", todas pela `mutate` (offline primeiro). Cada ação devolve o `undo`
 * para o toast "Desfazer" de 10 s: marcou errado, volta ao que era.
 */
export type Undoable = { undo: () => Promise<void> };

type StopPatch = Partial<Pick<Stop, 'departed_at' | 'done_at' | 'done_by' | 'skipped'>>;

async function patchWithUndo(stop: Stop, changes: StopPatch): Promise<() => Promise<void>> {
  const before = Object.fromEntries(
    Object.keys(changes).map((k) => [k, stop[k as keyof StopPatch]]),
  ) as StopPatch;
  await mutate.patch('stops', stop.id, changes);
  return () => mutate.patch('stops', stop.id, before);
}

/**
 * Partiu!: o carro sai de `at` (`departed_at`). Quando a próxima é um nó de saída (origem ou
 * deslocamento), ela é concluída e deixada no mesmo toque: "saímos de Papanduva" é uma ação só.
 */
export async function depart(state: DayState, uid: string): Promise<Undoable> {
  const now = new Date().toISOString();
  const undos: (() => Promise<void>)[] = [];
  if (state.at && !state.onRoad) undos.push(await patchWithUndo(state.at, { departed_at: now }));
  if (state.next && isDepartureNode(state.next)) {
    undos.push(await patchWithUndo(state.next, { done_at: now, done_by: uid, departed_at: now }));
  }
  return {
    undo: async () => {
      await Promise.all(undos.map((u) => u()));
    },
  };
}

/** Chegamos!: conclui a próxima (`done_at`, `done_by`). */
export async function arrive(state: DayState, uid: string): Promise<Undoable> {
  if (!state.next) return { undo: () => Promise.resolve() };
  const undo = await patchWithUndo(state.next, { done_at: new Date().toISOString(), done_by: uid });
  return { undo };
}

/** Pular: a próxima fica de fora, sem hora real. */
export async function skip(state: DayState): Promise<Undoable> {
  if (!state.next) return { undo: () => Promise.resolve() };
  const undo = await patchWithUndo(state.next, { skipped: true });
  return { undo };
}
