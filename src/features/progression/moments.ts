import {
  ACHIEVEMENTS,
  CAR_ACCESSORIES,
  CAR_ACCESSORY_KEYS,
  LEVELS,
  type AchievementKey,
  type CarAccessoryKey,
} from '@shared/constants.ts';
import { levelOf, modelName, unlocksAt } from './level.ts';
import type { AchievementGrant } from './rules.ts';

/**
 * Quando e o que se comemora, puro. Cada aparelho comemora o que a própria pessoa ganhou (conquistas
 * e subida de nível); o que o time ganhou aparece na garagem e no cabeçalho, sem cartão e sem nome.
 *
 * - A primeira derivação de um aparelho (inclusive ao publicar a fase) junta tudo o que já tinha
 *   acontecido num resumo calmo, sem confete: nunca uma cascata de cartões.
 * - Depois, cada conquista nova e cada subida de nível entram numa fila por aparelho, que sai um por
 *   vez, com "mais N", no próximo momento calmo (ao fechar a folha "Como foi?", ao abrir a visão
 *   geral, a garagem ou o perfil). Cada momento mostra só o que já estava na fila quando ele começou:
 *   nada salta no meio do que a pessoa está fazendo. Nunca com o modo painel, pelo toque numa
 *   notificação nem por cima de outra folha.
 */
export type Celebration = (
  | { kind: 'achievement'; key: AchievementKey; trip_id: string | null; at: string }
  | { kind: 'level'; level: number; at: string }
) & {
  /** quando entrou na fila: cada tela mostra só o que já esperava quando ela abriu */
  queued_at?: string;
};

export type Summary = { xp: number; level: number; keys: AchievementKey[] };

export function celebrationId(c: Celebration): string {
  return c.kind === 'achievement' ? `achievement:${c.key}` : `level:${c.level}`;
}

export function planCelebrations(input: {
  /** a primeira derivação deste aparelho */
  firstRun: boolean;
  beforeXp: number;
  afterXp: number;
  /** todas as conquistas da pessoa depois desta derivação (as novas e as que já estavam) */
  allKeys: readonly AchievementKey[];
  /** só as conquistas que esta derivação gravou */
  added: readonly AchievementGrant[];
  now: string;
}): { queue: Celebration[]; summary: Summary | null } {
  if (input.firstRun) {
    const nothing = input.afterXp === 0 && input.allKeys.length === 0;
    return {
      queue: [],
      summary: nothing
        ? null
        : {
            xp: input.afterXp,
            level: levelOf(input.afterXp).level,
            keys: [...input.allKeys].sort(),
          },
    };
  }
  const queue: Celebration[] = [...input.added]
    .sort((a, b) => (a.unlocked_at < b.unlocked_at ? -1 : a.unlocked_at > b.unlocked_at ? 1 : 0))
    .map((a) => ({ kind: 'achievement', key: a.key, trip_id: a.trip_id, at: a.unlocked_at }));
  const before = levelOf(input.beforeXp).level;
  const after = levelOf(input.afterXp).level;
  // pulou dois níveis de uma vez (raro fora da primeira derivação): um cartão, o do nível novo
  if (after > before) queue.push({ kind: 'level', level: after, at: input.now });
  return { queue, summary: null };
}

/** Acrescenta à fila sem repetir (a mesma conquista derivada em duas abas, por exemplo). */
export function mergeQueue(
  queue: readonly Celebration[],
  incoming: readonly Celebration[],
): Celebration[] {
  const seen = new Set(queue.map(celebrationId));
  const out = [...queue];
  for (const c of incoming) {
    if (seen.has(celebrationId(c))) continue;
    seen.add(celebrationId(c));
    out.push(c);
  }
  return out;
}

/** Um momento calmo: nada aparece por cima de quem dirige nem de uma folha aberta. */
export function isCalm(input: { panelOn: boolean; sheetOpen: boolean }): boolean {
  return !input.panelOn && !input.sheetOpen;
}

/** O que este momento mostra: o que já esperava na fila quando ele começou (`since`, em ms). */
export function dueAt(queue: readonly Celebration[], since: number): Celebration[] {
  return queue.filter((c) => !c.queued_at || Date.parse(c.queued_at) <= since);
}

/** O acessório que a conquista libera (cada uma libera um). */
export function accessoryFor(key: AchievementKey): CarAccessoryKey | null {
  return CAR_ACCESSORY_KEYS.find((k) => CAR_ACCESSORIES[k].achievement === key) ?? null;
}

export type CelebrationText = { eyebrow: string; title: string; body: string; unlock: string };

/** O texto do cartão. */
export function celebrationText(c: Celebration): CelebrationText {
  if (c.kind === 'achievement') {
    const def = ACHIEVEMENTS[c.key];
    const acc = accessoryFor(c.key);
    return {
      eyebrow: 'Conquista',
      title: def.name,
      body: def.done,
      unlock: acc ? CAR_ACCESSORIES[acc].label : '',
    };
  }
  const level = LEVELS.find((l) => l.level === c.level) ?? LEVELS[0];
  const { models, colors } = unlocksAt(level.level);
  const freed = [...models.map(modelName), ...colors.map(() => 'o dourado')];
  return {
    eyebrow: 'Nível novo',
    title: `Nível ${level.level} · ${level.name}`,
    body:
      freed.length > 0
        ? `${capitalize(freed.join(' e '))} ${freed.length > 1 ? 'estão liberados' : 'está liberado'} na garagem.`
        : 'Mais um nível para o time.',
    unlock: freed.map(capitalize).join(' e '),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}

/** "Vocês já tinham conquistado 6 conquistas e 420 XP." (no singular para quem viaja só) */
export function summaryPhrase(s: Summary, solo: boolean): string {
  const n = s.keys.length;
  const items = n === 1 ? '1 conquista' : `${n} conquistas`;
  const subject = solo ? 'Você já tinha conquistado' : 'Vocês já tinham conquistado';
  if (n === 0) return `${subject} ${s.xp} XP.`;
  return `${subject} ${items} e ${s.xp} XP.`;
}
