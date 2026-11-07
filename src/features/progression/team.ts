import { ACHIEVEMENT_KEYS, ACHIEVEMENTS, LEVELS, type AchievementKey } from '@shared/constants.ts';
import { levelOf } from './level.ts';

/**
 * O progresso do time, que decide o que a garagem libera. O carro é da viagem e a equipe conquista
 * junto: vale o maior nível entre os membros aceitos e a união das conquistas deles.
 *
 * A fonte de cada membro (D113): para a própria pessoa, as próprias linhas no aparelho (que já
 * incluem o que ainda não subiu); para os outros, o resumo público do perfil (`xp_total`,
 * `achievement_keys`), que o servidor mantém por trigger e que viaja para o time pelo pull da
 * viagem. O pull da viagem só traz o XP com o trip_id dela: somar as linhas dos outros daria o
 * nível de cada um só nas viagens em comum.
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

export function isAchievementKey(value: string): value is AchievementKey {
  return Object.hasOwn(ACHIEVEMENTS, value);
}

/** O que cada membro traz: XP e conquistas. */
export type Standing = { user_id: string; xp: number; achievements: readonly AchievementKey[] };

/**
 * A posição de um membro. Para a própria pessoa, o maior entre o que o aparelho somou e o resumo do
 * perfil (o resumo pode estar adiante, com o XP de outro aparelho que ainda não chegou aqui), e a
 * união das conquistas; para os outros, o resumo do perfil. Sem perfil ainda, nível 1 e nada.
 */
export function standingOf(
  userId: string,
  me: { uid: string; xp: number; achievements: readonly AchievementKey[] },
  profile: { xp_total: number; achievement_keys: readonly string[] } | null,
): Standing {
  // o perfil puxado antes da 0009 não tem o resumo até mudar de novo no servidor: vale zero
  const keys: unknown = profile?.achievement_keys;
  const summary = Array.isArray(keys)
    ? keys.filter((k): k is string => typeof k === 'string').filter(isAchievementKey)
    : [];
  const total: unknown = profile?.xp_total;
  const xp = typeof total === 'number' ? total : 0;
  if (userId !== me.uid) return { user_id: userId, xp, achievements: summary };
  return {
    user_id: userId,
    xp: Math.max(me.xp, xp),
    achievements: [...new Set([...me.achievements, ...summary])],
  };
}

/** O time a partir das posições: maior nível, união das conquistas. */
export function teamOf(standings: readonly Standing[]): TeamProgress {
  return combineTeam(
    standings.map((s) => ({ level: levelOf(s.xp).level, achievements: s.achievements })),
  );
}

/** O XP que a barra da viagem mostra: o de quem está mais adiante (é quem define o nível), sem nome. */
export function teamXp(standings: readonly Standing[]): number {
  return standings.reduce((acc, s) => Math.max(acc, s.xp), 0);
}
