import type { ChecklistKind } from '@shared/constants.ts';
import { dayMonth } from '@shared/notifications.ts';
import type { ChecklistItem } from '@/lib/db/schema.ts';
import { comparePosition } from '@/lib/ids/position.ts';

/**
 * As três listas da viagem, puras: o que aparece, em que ordem, o progresso de cada uma e o
 * "Pronto para partir". Só conta o que está ativo: a sugestão dispensada (`dismissed`) é uma linha
 * viva para não voltar a ser sugerida, mas não é item da lista.
 */
export type Progress = { done: number; total: number };
export type ListsProgress = Record<ChecklistKind, Progress>;

type ItemLike = Pick<
  ChecklistItem,
  'kind' | 'status' | 'deleted_at' | 'done_at' | 'position' | 'points'
>;

export function isActive(item: Pick<ChecklistItem, 'status' | 'deleted_at'>): boolean {
  return item.deleted_at === null && item.status === 'active';
}

/** Os itens ativos de uma lista, na ordem da posição fracionária (igual ao collate "C"). */
export function listItems<T extends ItemLike>(items: readonly T[], kind: ChecklistKind): T[] {
  return items
    .filter((i) => i.kind === kind && isActive(i))
    .sort((a, b) => comparePosition(a.position, b.position));
}

export function listsProgress(items: readonly ItemLike[]): ListsProgress {
  const out: ListsProgress = {
    before: { done: 0, total: 0 },
    pack: { done: 0, total: 0 },
    quest: { done: 0, total: 0 },
  };
  for (const i of items) {
    if (!isActive(i)) continue;
    out[i.kind as ChecklistKind].total += 1;
    if (i.done_at !== null) out[i.kind as ChecklistKind].done += 1;
  }
  return out;
}

export function fraction(p: Progress): number {
  return p.total === 0 ? 0 : p.done / p.total;
}

/** Antes e Mala com pelo menos um item cada e tudo marcado. Lista vazia não é lista pronta. */
export function isReady(p: ListsProgress): boolean {
  return p.before.total > 0 && p.pack.total > 0 && isComplete(p.before) && isComplete(p.pack);
}

function isComplete(p: Progress): boolean {
  return p.total > 0 && p.done === p.total;
}

/** "7 de 11": antes e mala juntas, como no atalho da visão geral (missões não entram). */
export function shortcutValue(p: ListsProgress): string {
  const total = p.before.total + p.pack.total;
  if (total === 0) return 'vazias';
  return `${p.before.done + p.pack.done} de ${total}`;
}

/** O cartão da prontidão só existe antes da viagem: no dia de começar, as listas já cumpriram o papel. */
export function showsReadiness(today: string, startDate: string): boolean {
  return today < startDate;
}

/**
 * O cartão "Pronto para partir" (confete e sino) aparece uma vez por viagem e aparelho, quando as
 * duas listas fecham antes do início. Quem decide se já apareceu é o `sync_state` deste aparelho.
 */
export function shouldCelebrate(input: {
  progress: ListsProgress;
  today: string;
  startDate: string;
  alreadyShown: boolean;
}): boolean {
  return (
    !input.alreadyShown && showsReadiness(input.today, input.startDate) && isReady(input.progress)
  );
}

export const readyKey = (tripId: string) => `ready:${tripId}`;

/** A véspera em 'YYYY-MM-DD', sem passar por fuso. */
export function eveOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * A frase do style tile enquanto falta algo: "Fechem as duas listas até 10/12 para ganhar a mala de
 * teto." O prazo é a véspera (o aviso das 19h conta o que falta). Quem viaja sozinho lê no singular.
 */
export function readinessPhrase(startDate: string, teamSize: number): string {
  const verb = teamSize > 1 ? 'Fechem' : 'Feche';
  return `${verb} as duas listas até ${dayMonth(eveOf(startDate))} para ganhar a mala de teto.`;
}

/** Quantos dias faltam do dia de hoje até o início ("3 dias antes da estrada"). */
export function daysUntil(today: string, startDate: string): number {
  const t = Date.parse(`${today}T00:00:00Z`);
  const s = Date.parse(`${startDate}T00:00:00Z`);
  return Math.round((s - t) / 86_400_000);
}

/** Texto para comparar itens: sem acento, sem maiúscula, espaços únicos. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pontos das missões feitas e o total possível, para o cabeçalho da aba. */
export function questPoints(items: readonly ItemLike[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const i of items) {
    if (i.kind !== 'quest' || !isActive(i)) continue;
    total += i.points;
    if (i.done_at !== null) done += i.points;
  }
  return { done, total };
}

/** A aba pela URL (`?aba=antes|mala|missoes`), com "antes" quando não há ou não se conhece. */
export function kindFromSlug(slug: string | null): ChecklistKind {
  if (slug === 'mala') return 'pack';
  if (slug === 'missoes') return 'quest';
  return 'before';
}
