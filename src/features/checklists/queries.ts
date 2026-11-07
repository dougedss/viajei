import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, type ChecklistItem, type Stop, type TripDay } from '@/lib/db/schema.ts';
import { pendingSuggestions, type DayScenery, type Suggestion } from './suggestions.ts';

/**
 * Os itens da viagem que este aparelho tem, vivos (os dispensados também: são eles que seguram a
 * sugestão). `undefined` enquanto carrega.
 */
export function useTripChecklist(tripId: string): ChecklistItem[] | undefined {
  return useLiveQuery(
    async () =>
      (await db.checklist_items.where('trip_id').equals(tripId).toArray()).filter(
        (i) => i.deleted_at === null,
      ),
    [tripId],
  );
}

/** As missões ativas de uma parada (a folha "Como foi?" e a lista do dia). */
export function useStopQuests(stopId: string | null): ChecklistItem[] {
  return useLiveQuery(
    async () =>
      stopId
        ? (await db.checklist_items.where('stop_id').equals(stopId).toArray()).filter(
            (i) => i.kind === 'quest' && i.deleted_at === null && i.status === 'active',
          )
        : [],
    [stopId],
    [],
  );
}

/**
 * A leitura do lugar dos dias que têm rota guardada neste aparelho: só os cenários, para as sugestões
 * de mala. A `lib/geo` entra por import dinâmico (chunk próprio, D26) e só quando há rota.
 */
export function useTripScenery(days: readonly TripDay[]): DayScenery[] {
  const ids = days.map((d) => d.id).join(',');
  const routes = useLiveQuery(
    async () => (await db.routes.bulkGet(ids.split(','))).filter((r) => r !== undefined),
    [ids],
    [],
  );
  const [scenery, setScenery] = useState<{ key: string; value: DayScenery[] }>({
    key: '',
    value: [],
  });
  const key = routes.map((r) => `${r.trip_day_id}:${r.hash}`).join(',');
  useEffect(() => {
    if (routes.length === 0) return;
    let alive = true;
    void import('@/lib/geo/index.ts').then(({ classifySegments }) => {
      const index = new Map(days.map((d, i) => [d.id, i + 1]));
      const value = routes.map((r) => ({
        dayIndex: index.get(r.trip_day_id) ?? 0,
        kinds: [...new Set(classifySegments(r).map((s) => s.kind))],
      }));
      if (alive) setScenery({ key, value });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando uma rota muda
  }, [key]);
  return routes.length === 0 || scenery.key !== key ? [] : scenery.value;
}

/** As sugestões que ainda aparecem (calculadas, nunca gravadas antes da ação da pessoa). */
export function useSuggestions(input: {
  tripId: string;
  days: readonly TripDay[];
  stops: readonly Stop[];
  items: readonly ChecklistItem[] | undefined;
  scenery: readonly DayScenery[];
}): Suggestion[] {
  const { tripId, days, stops, items, scenery } = input;
  const [state, setState] = useState<{ key: string; value: Suggestion[] }>({
    key: '',
    value: [],
  });
  const key = [
    tripId,
    stops.map((s) => `${s.id}:${s.kind}:${s.skipped}:${s.done_at ?? ''}`).join(','),
    (items ?? []).map((i) => `${i.id}:${i.status}:${i.stop_id ?? ''}:${i.text}`).join(','),
    scenery.map((d) => `${d.dayIndex}:${d.kinds.join('+')}`).join(','),
  ].join('|');
  useEffect(() => {
    if (!items) return;
    let alive = true;
    const dayIndex = new Map(days.map((d, i) => [d.id, i + 1]));
    void pendingSuggestions({ tripId, stops, items, scenery, dayIndex }).then((value) => {
      if (alive) setState({ key, value });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave resume tudo o que muda a resposta
  }, [key]);
  // enquanto a conta nova não volta, a anterior serve, sem as que acabaram de virar linha (sem piscar)
  const taken = new Set((items ?? []).filter((i) => i.status !== 'suggested').map((i) => i.id));
  return state.value.filter((s) => !taken.has(s.id));
}
