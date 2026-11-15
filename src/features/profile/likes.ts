import { INTEREST_KEYS, type Interest, type StopKind } from '@shared/constants.ts';
import type { Stop, StopMemory } from '@/lib/db/schema.ts';

/**
 * "O que você gosta" (fase 17): os chips que a pessoa escolhe e o que o app aprende pelas notas dela.
 * Puro. É pista para a IA da conversa e da saída de hoje, nunca regra ("gostar de cachoeira não obriga
 * a cachoeira hoje"), e nada disto é gravado: o aprendido é uma leitura das notas, refeita na hora.
 */

/** Os gostos guardados no perfil, só os que o app conhece, na ordem dos chips e sem repetir. */
export function interestsOf(value: readonly string[] | null | undefined): Interest[] {
  const set = new Set(value ?? []);
  return INTEREST_KEYS.filter((k) => set.has(k));
}

/** Liga ou desliga um chip, devolvendo a lista na ordem dos chips. */
export function toggleInterest(current: readonly Interest[], key: Interest): Interest[] {
  const set = new Set<string>(current);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  return INTEREST_KEYS.filter((k) => set.has(k));
}

/** Os tipos de parada que dizem um gosto; saída, deslocamento, hotel, posto e "outro" não dizem. */
const TELLING: Partial<Record<StopKind, string>> = {
  nature: 'natureza',
  winery: 'vinícolas',
  food: 'comida',
  city: 'cidades',
  event: 'eventos',
};

export type Learned = { kind: StopKind; label: string; count: number };

/**
 * O que a pessoa deu 4 ou 5 no "Como foi?" (`stop_memories.rating`), contado pelo tipo da parada: só
 * as notas dela, só as paradas vivas, do tipo que mais aparece para o que menos aparece.
 */
export function learnedLikes(
  memories: readonly Pick<StopMemory, 'stop_id' | 'user_id' | 'rating' | 'deleted_at'>[],
  stops: readonly Pick<Stop, 'id' | 'kind' | 'deleted_at'>[],
  uid: string,
): Learned[] {
  const kindOf = new Map(stops.filter((s) => s.deleted_at === null).map((s) => [s.id, s.kind]));
  const counts = new Map<StopKind, number>();
  for (const m of memories) {
    if (m.user_id !== uid || m.deleted_at !== null || m.rating === null || m.rating < 4) continue;
    const kind = kindOf.get(m.stop_id) as StopKind | undefined;
    if (!kind || !TELLING[kind]) continue;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: TELLING[kind] ?? kind, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

/** "Pelas suas notas: natureza (3) e vinícolas (2)." Nada a dizer: null. */
export function learnedPhrase(learned: readonly Learned[]): string | null {
  if (learned.length === 0) return null;
  const parts = learned.map((l) => `${l.label} (${String(l.count)})`);
  const list =
    parts.length === 1
      ? (parts[0] ?? '')
      : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1) ?? ''}`;
  return `Pelas suas notas 4 e 5 no "Como foi?": ${list}.`;
}
