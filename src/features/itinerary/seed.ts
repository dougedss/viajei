import { validateImport } from '@shared/import-schema.ts';
import { planCounts, reviewOf } from '@/features/import/plan.ts';
import { readExisting, saveImport } from '@/features/import/save.ts';
import type { Trip } from '@/lib/db/schema.ts';

/**
 * "Carregar viagem de exemplo": só em desenvolvimento. É uma importação do seed sem IA, pelo mesmo
 * caminho da tela de importar (`reviewOf` → `planImport` → uma transação da `mutate`), com tudo o
 * que o arquivo traz mantido e `source: 'user'` (ninguém leu com IA). Rodar duas vezes não duplica:
 * o que já existe com o mesmo nome, telefone ou texto começa desmarcado na revisão.
 */
export type LoadResult = {
  days: number;
  stops: number;
  reservations: number;
  contacts: number;
  items: number;
};

export async function loadExampleTrip(trip: Trip, uid: string): Promise<LoadResult> {
  const { default: raw } = await import('../../../supabase/seed/viagem-rs.json');
  const data = validateImport(raw);
  const dates = data.days.map((d) => d.date);
  const first = dates[0] ?? trip.start_date;
  const last = dates.at(-1) ?? trip.end_date;
  if (first < trip.start_date || last > trip.end_date) {
    throw new Error(
      `A viagem de exemplo vai de ${first} a ${last}: ajuste as datas da viagem antes.`,
    );
  }
  const review = reviewOf(data, await readExisting(trip));
  return planCounts(await saveImport(review, trip, uid, 'user'));
}
