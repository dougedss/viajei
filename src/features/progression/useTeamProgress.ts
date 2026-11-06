import { useMemo } from 'react';
import { useTripMembers } from '@/features/trips/queries.ts';
import { combineTeam, type MemberProgress, type TeamProgress } from './team.ts';

/** O que cada membro traz enquanto XP e conquistas não existem: nível 1, nenhuma conquista. */
const NOT_YET: MemberProgress = { level: 1, achievements: [] };

/**
 * O progresso do time desta viagem: o maior nível e a união das conquistas dos membros aceitos.
 * Nesta fase cada membro traz nível 1 e nenhuma conquista, porque XP e conquistas só existem na
 * fase 9 (migration 0009): a garagem mostra o que está bloqueado e a prévia deixa experimentar,
 * sem fingir progresso. A fase 9 troca `NOT_YET` pelo progresso de cada membro; quem usa não muda.
 */
export function useTeamProgress(tripId: string): TeamProgress {
  const members = useTripMembers(tripId);
  const accepted = members.filter((m) => m.member.status === 'accepted').length;
  return useMemo(
    () => combineTeam(Array.from({ length: Math.max(1, accepted) }, () => NOT_YET)),
    [accepted],
  );
}
