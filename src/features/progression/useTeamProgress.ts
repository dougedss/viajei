import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useTripMembers } from '@/features/trips/queries.ts';
import { db } from '@/lib/db/schema.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { levelProgress, type LevelProgress } from './level.ts';
import { totalXp } from './rules.ts';
import {
  isAchievementKey,
  NO_PROGRESS,
  standingOf,
  teamOf,
  teamXp,
  type Standing,
  type TeamProgress,
} from './team.ts';
import type { AchievementKey } from '@shared/constants.ts';

export type MyProgress = { xp: number; achievements: AchievementKey[] };

/** O meu XP e as minhas conquistas, das linhas do aparelho (inclusive as que ainda não subiram). */
export function useMyProgress(): MyProgress {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  return useLiveQuery(
    async () => {
      if (!uid) return { xp: 0, achievements: [] };
      const [xp, achievements] = await Promise.all([
        db.xp_events.where('user_id').equals(uid).toArray(),
        db.achievements.where('user_id').equals(uid).toArray(),
      ]);
      return {
        xp: totalXp(xp),
        achievements: achievements.map((a) => a.key).filter(isAchievementKey),
      };
    },
    [uid],
    { xp: 0, achievements: [] },
  );
}

/** A posição de cada membro aceito da viagem: eu pelas minhas linhas, os outros pelo perfil. */
function useStandings(tripId: string): Standing[] {
  const { session } = useSession();
  const uid = session?.user.id ?? '';
  const members = useTripMembers(tripId);
  const mine = useMyProgress();
  return useMemo(
    () =>
      members
        .filter((m) => m.member.status === 'accepted' && m.member.user_id)
        .map((m) =>
          standingOf(
            m.member.user_id ?? '',
            { uid, xp: mine.xp, achievements: mine.achievements },
            m.profile,
          ),
        ),
    [members, uid, mine],
  );
}

/**
 * O progresso do time desta viagem: o maior nível e a união das conquistas dos membros aceitos.
 * Desde a fase 9 cada membro traz o próprio progresso; quem usa (a garagem, o cartão) não mudou.
 */
export function useTeamProgress(tripId: string): TeamProgress {
  const standings = useStandings(tripId);
  return useMemo(() => (standings.length > 0 ? teamOf(standings) : NO_PROGRESS), [standings]);
}

/** O nível do time para a barra da viagem: o XP de quem está mais adiante, sem nome. */
export function useTeamLevel(tripId: string): { progress: LevelProgress; solo: boolean } {
  const standings = useStandings(tripId);
  return useMemo(
    () => ({ progress: levelProgress(teamXp(standings)), solo: standings.length <= 1 }),
    [standings],
  );
}
