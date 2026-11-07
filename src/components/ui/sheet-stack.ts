import { useSyncExternalStore } from 'react';

/**
 * Quantas folhas comuns estão abertas agora (a "Como foi?", um formulário, a "Pronto para partir").
 * O cartão de desbloqueio da fase 9 só sai com nenhuma: nunca por cima de outra folha.
 */
let openSheets = 0;
const listeners = new Set<() => void>();

export function changeOpenSheets(delta: number): void {
  openSheets += delta;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAnySheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openSheets > 0,
    () => false,
  );
}
