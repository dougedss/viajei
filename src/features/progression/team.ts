import { ACHIEVEMENT_KEYS, LEVELS, type AchievementKey } from '@shared/constants.ts';

/**
 * O progresso do time, que decide o que a garagem libera. O carro é da viagem e a equipe conquista
 * junto: vale o maior nível entre os membros aceitos e a união das conquistas deles. Este é o
 * contrato; a fonte (XP e conquistas de cada membro) chega na fase 9 com a migration 0009, que
 * troca só a implementação de `useTeamProgress`.
 */
export type Level = (typeof LEVELS)[number]['level'];

export type TeamProgress = {
  level: Level;
  achievements: ReadonlySet<AchievementKey>;
};

export type MemberProgress = {
  level: number;
  achievements: Iterable<AchievementKey>;
};

export const NO_PROGRESS: TeamProgress = { level: 1, achievements: new Set() };

/** Tudo liberado: só para conferência visual em dev (`?garagem=tudo`). */
export const FULL_PROGRESS: TeamProgress = { level: 5, achievements: new Set(ACHIEVEMENT_KEYS) };

function asLevel(n: number): Level {
  const top = LEVELS[LEVELS.length - 1]?.level ?? 1;
  const clamped = Math.max(1, Math.min(top, Math.floor(n)));
  return LEVELS.find((l) => l.level === clamped)?.level ?? 1;
}

/** Maior nível e união das conquistas dos membros (aceitos; quem chama filtra). Sem ninguém, nível 1. */
export function combineTeam(members: readonly MemberProgress[]): TeamProgress {
  if (members.length === 0) return NO_PROGRESS;
  let level = 1;
  const achievements = new Set<AchievementKey>();
  for (const m of members) {
    level = Math.max(level, m.level);
    for (const a of m.achievements) achievements.add(a);
  }
  return { level: asLevel(level), achievements };
}

export function levelName(level: number): string {
  return LEVELS.find((l) => l.level === level)?.name ?? LEVELS[0].name;
}
