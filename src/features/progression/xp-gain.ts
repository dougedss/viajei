import { XP_POINTS, type XpKind } from '@shared/constants.ts';
import { useSyncExternalStore } from 'react';
import { db, type ChecklistItem } from '@/lib/db/schema.ts';
import { xpId } from './ids.ts';

/**
 * O "+10" discreto onde a ação aconteceu (Chegamos!, marcar um item, lançar um gasto). Ele aparece
 * na hora, a partir das regras (os pontos do tipo), enquanto a gravação do XP espera a janela do
 * Desfazer: desfeita a ação, nada é gravado. Fica por cima de tudo, perto do botão tocado.
 */
export type XpGain = { id: number; points: number; x: number; y: number };

let gains: XpGain[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export const XP_GAIN_MS = 1_400;

function place(points: number, rect: DOMRect | null): void {
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top - 6 : window.innerHeight * 0.7;
  const gain = { id: ++seq, points, x, y };
  gains = [...gains, gain];
  emit();
  setTimeout(() => {
    gains = gains.filter((g) => g.id !== gain.id);
    emit();
  }, XP_GAIN_MS);
}

/**
 * Mostra o "+N" de uma ação, perto do elemento tocado (por padrão, o que está com o foco: o botão que
 * acabou de ser tocado). Só quando a ação rende XP novo: remarcar o que já deu XP não mostra nada,
 * porque não dá de novo.
 */
export async function gainXp(
  uid: string,
  kind: XpKind,
  ref: string,
  points: number,
  /** onde mostrar: o elemento, ou a posição dele já guardada (o botão pode ter sumido) */
  at?: Element | DOMRect | null,
): Promise<void> {
  if (!uid || points <= 0 || typeof window === 'undefined') return;
  // o elemento pode sumir enquanto o id é calculado: a posição fica guardada antes
  const rect = at instanceof Element ? at.getBoundingClientRect() : (at ?? tappedRect());
  if (await db.xp_events.get(await xpId(uid, kind, ref))) return;
  place(points, rect);
}

/** O XP de marcar um item: a missão vale os pontos dela (para o time); Antes e Mala, 2 para quem marcou. */
export function itemXp(item: Pick<ChecklistItem, 'kind' | 'points'>): {
  kind: XpKind;
  points: number;
} {
  return item.kind === 'quest'
    ? { kind: 'quest_done', points: item.points }
    : { kind: 'checklist_item', points: XP_POINTS.checklist_item };
}

/** A posição do que acabou de ser tocado (o elemento com o foco), para guardar antes de um `await`. */
export function tappedRect(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement;
  return el && el !== document.body ? el.getBoundingClientRect() : null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useXpGains(): readonly XpGain[] {
  return useSyncExternalStore(
    subscribe,
    () => gains,
    () => gains,
  );
}
