import { describe, expect, it } from 'vitest';
import { combineTeam, NO_PROGRESS, standingOf, teamOf, teamXp } from './team.ts';

const ME = 'me';

describe('o progresso do time com a fonte nova', () => {
  it('eu pelas minhas linhas; o resumo do perfil vale quando está adiante (outro aparelho)', () => {
    const mine = { uid: ME, xp: 120, achievements: ['first_stop' as const] };
    expect(standingOf(ME, mine, { xp_total: 100, achievement_keys: ['team'] })).toEqual({
      user_id: ME,
      xp: 120,
      achievements: ['first_stop', 'team'],
    });
    expect(standingOf(ME, mine, { xp_total: 300, achievement_keys: [] }).xp).toBe(300);
  });

  it('os outros pelo resumo do perfil; chave desconhecida sai; perfil antigo sem resumo vale zero', () => {
    const mine = { uid: ME, xp: 0, achievements: [] };
    expect(
      standingOf('ana', mine, { xp_total: 450, achievement_keys: ['coast', 'speedster'] }),
    ).toEqual({ user_id: 'ana', xp: 450, achievements: ['coast'] });
    const old = { xp_total: undefined, achievement_keys: undefined } as unknown as {
      xp_total: number;
      achievement_keys: string[];
    };
    expect(standingOf('bia', mine, old)).toEqual({ user_id: 'bia', xp: 0, achievements: [] });
    expect(standingOf('caio', mine, null)).toEqual({ user_id: 'caio', xp: 0, achievements: [] });
  });

  it('o time: maior nível e união das conquistas; a barra mostra o XP de quem está mais adiante', () => {
    const standings = [
      { user_id: ME, xp: 210, achievements: ['first_stop' as const] },
      { user_id: 'ana', xp: 450, achievements: ['coast' as const] },
    ];
    const team = teamOf(standings);
    expect(team.level).toBe(3);
    expect([...team.achievements].sort()).toEqual(['coast', 'first_stop']);
    expect(teamXp(standings)).toBe(450);
    expect(combineTeam([])).toBe(NO_PROGRESS);
  });
});
