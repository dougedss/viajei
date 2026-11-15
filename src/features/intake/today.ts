import type { StopKind } from '@shared/constants.ts';
import type { PlanContext, PlanQuestion, Reach } from '@shared/plan-protocol.ts';
import type { Stop, StopMemory } from '@/lib/db/schema.ts';
import type { ReverseRow } from '@/lib/geocode/nominatim.ts';

/**
 * A saída de hoje (fase 17, "quero sair hoje"): o que entra na conta, como pista e nunca como regra.
 * Os gostos do perfil, o que a pessoa deu 4 e 5, onde já foi (a nota e quanto tempo faz: "voltar
 * a…?"), o tempo de hoje onde ela está e o alcance, a única pergunta que o app faz sem IA. Puro: quem
 * lê o aparelho, a posição e o tempo é `gather.ts`.
 */
export type History = PlanContext['history'][number];

/** Os tipos que dizem onde a pessoa foi passear (a saída, o posto e a parada automática, não). */
const VISITS: readonly StopKind[] = ['nature', 'winery', 'food', 'city', 'event', 'hotel'];
const MAX_HISTORY = 12;
const DAY_MS = 86_400_000;

/**
 * Onde a pessoa já foi: as paradas feitas, com a nota dela no "Como foi?" e há quantos dias. Um lugar
 * que aparece em duas viagens conta uma vez (a melhor nota, a vez mais recente). Os mais bem avaliados
 * primeiro; entre iguais, os mais recentes.
 */
export function historyOf(
  stops: readonly Pick<Stop, 'id' | 'name' | 'kind' | 'done_at' | 'deleted_at' | 'source'>[],
  memories: readonly Pick<StopMemory, 'stop_id' | 'user_id' | 'rating' | 'deleted_at'>[],
  uid: string,
  now: Date,
): History[] {
  const rating = new Map<string, number>();
  for (const m of memories) {
    if (m.user_id === uid && m.deleted_at === null && m.rating !== null)
      rating.set(m.stop_id, m.rating);
  }
  const byName = new Map<string, History>();
  for (const s of stops) {
    if (s.deleted_at !== null || s.done_at === null || s.source === 'auto') continue;
    if (!VISITS.includes(s.kind as StopKind)) continue;
    const days_ago = Math.max(0, Math.floor((now.getTime() - Date.parse(s.done_at)) / DAY_MS));
    const item: History = {
      name: s.name.slice(0, 120),
      kind: s.kind as StopKind,
      rating: rating.get(s.id) ?? null,
      days_ago,
    };
    const key = s.name.trim().toLocaleLowerCase('pt-BR');
    const seen = byName.get(key);
    byName.set(key, {
      ...item,
      rating: Math.max(item.rating ?? 0, seen?.rating ?? 0) || null,
      days_ago: Math.min(item.days_ago, seen?.days_ago ?? Infinity),
    });
  }
  return [...byName.values()]
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.days_ago - b.days_ago)
    .slice(0, MAX_HISTORY);
}

// --------------------------------------------------------------------------- as perguntas
/** A pergunta de alcance, a mesma em toda saída de hoje. */
export const REACH_QUESTION: PlanQuestion = {
  text: 'Quanto tempo vocês têm?',
  options: ['A manhã', 'O dia', 'Até amanhã'],
};
/** Sem posição e sem uma origem de antes, de onde sair vira a segunda pergunta. */
export const ORIGIN_QUESTION: PlanQuestion = {
  text: 'De onde vocês saem?',
  options: [],
};

/** As perguntas da saída de hoje, ditas antes: o alcance, e a origem quando o app não sabe. */
export function todayQuestions(known: { position: boolean; origin: boolean }): PlanQuestion[] {
  return known.position || known.origin ? [REACH_QUESTION] : [REACH_QUESTION, ORIGIN_QUESTION];
}

/** A resposta ao alcance, pela opção ou pelas palavras da pessoa ("só a tarde", "dormir fora"). */
export function reachOf(answer: string): Reach {
  const s = answer
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (/amanha|dormir|noite fora|pernoit|fim de semana/.test(s)) return 'overnight';
  if (/manha|almoco|pouco|cedo|2 ?h|duas horas|tres horas/.test(s)) return 'morning';
  return 'day';
}

/** Quanto se procura em volta, em km: o alcance da saída de hoje, ou a região de uma viagem. */
export function radiusFor(kind: 'plan' | 'today', reach: Reach | null): number {
  if (kind === 'plan') return 200;
  return reach === 'morning' ? 50 : reach === 'overnight' ? 220 : 120;
}

/** "Canela, RS": a cidade do `/reverse` e a sigla do estado, quando vêm. */
export function placeOfReverse(row: ReverseRow | null): string | null {
  const a = row?.address ?? {};
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? null;
  if (!city) return null;
  const iso = a['ISO3166-2-lvl4'] ?? '';
  const uf = /^BR-([A-Z]{2})$/.exec(iso)?.[1];
  return uf ? `${city}, ${uf}` : city;
}

/** A posição a uns 1 km (duas casas): o suficiente para o "perto daqui", nunca o ponto exato. */
export function roundPosition(p: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
}

/**
 * O contexto que vai para a IA, das peças que o aparelho tem: tudo como dado, limitado, e nada de
 * texto da pessoa além do nome dos lugares onde ela foi. O alcance entra depois da pergunta.
 */
export function contextFor(input: {
  now: Date;
  /** a data e a hora de agora em São Paulo */
  today: string;
  time: string;
  origin: string | null;
  position: { lat: number; lng: number } | null;
  place: string | null;
  interests: PlanContext['interests'];
  learned: readonly { kind: StopKind; count: number }[];
  history: readonly History[];
  weather: string | null;
}): Omit<PlanContext, 'reach'> {
  return {
    today: input.today,
    now: input.time,
    origin: input.origin?.slice(0, 200) ?? null,
    position: input.position ? roundPosition(input.position) : null,
    place: input.place?.slice(0, 200) ?? null,
    interests: [...input.interests],
    learned: input.learned.slice(0, 10).map((l) => ({ kind: l.kind, count: l.count })),
    history: input.history.slice(0, MAX_HISTORY),
    weather: input.weather?.slice(0, 200) ?? null,
  };
}
