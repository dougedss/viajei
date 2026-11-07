import type { ChecklistItem, Expense } from '@/lib/db/schema.ts';

/**
 * O que acontece com listas e gastos quando uma parada sai (a lógica da D87). Puro: a ação
 * (`removeStop`) só aplica o plano.
 *  - a missão de sistema da parada sai junto: ela só existia por causa da parada;
 *  - a missão de uma pessoa (ou da IA) fica, sem o vínculo: alguém a escreveu;
 *  - o gasto fica, sem o vínculo: o dinheiro foi gasto de verdade. O de uma reserva continua ligado
 *    a ela (a reserva vai para o dia da parada).
 */
export type StopRemovalPlan = {
  removeItems: string[];
  unlinkItems: string[];
  unlinkExpenses: string[];
};

export function stopRemovalPlan(
  stopId: string,
  items: readonly Pick<ChecklistItem, 'id' | 'stop_id' | 'source' | 'deleted_at'>[],
  expenses: readonly Pick<Expense, 'id' | 'stop_id' | 'deleted_at'>[],
): StopRemovalPlan {
  const ofStop = items.filter((i) => i.stop_id === stopId && i.deleted_at === null);
  return {
    removeItems: ofStop.filter((i) => i.source === 'system').map((i) => i.id),
    unlinkItems: ofStop.filter((i) => i.source !== 'system').map((i) => i.id),
    unlinkExpenses: expenses
      .filter((e) => e.stop_id === stopId && e.deleted_at === null)
      .map((e) => e.id),
  };
}
