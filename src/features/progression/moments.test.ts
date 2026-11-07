import { describe, expect, it } from 'vitest';
import {
  accessoryFor,
  celebrationText,
  isCalm,
  mergeQueue,
  planCelebrations,
  summaryPhrase,
} from './moments.ts';

const NOW = '2026-12-11T18:00:00.000Z';

describe('a primeira derivação vira um resumo calmo, nunca uma cascata', () => {
  it('tudo o que já tinha acontecido vai para o resumo, e a fila fica vazia', () => {
    const plan = planCelebrations({
      firstRun: true,
      since: NOW,
      beforeXp: 0,
      afterXp: 420,
      allKeys: ['team', 'first_stop'],
      added: [
        { key: 'first_stop', trip_id: 't', unlocked_at: '2026-12-11T10:00:00.000Z' },
        { key: 'team', trip_id: 't', unlocked_at: '2026-11-20T10:00:00.000Z' },
      ],
      now: NOW,
    });
    expect(plan.queue).toEqual([]);
    expect(plan.summary).toEqual({ xp: 420, level: 3, keys: ['first_stop', 'team'] });
    expect(summaryPhrase(plan.summary ?? { xp: 0, level: 1, keys: [] }, false)).toBe(
      'Vocês já tinham conquistado 2 conquistas e 420 XP.',
    );
    expect(summaryPhrase({ xp: 30, level: 1, keys: ['team'] }, true)).toBe(
      'Você já tinha conquistado 1 conquista e 30 XP.',
    );
  });

  it('o que aconteceu depois de o aparelho começar (o primeiro sync ainda corria) vira cartão', () => {
    const plan = planCelebrations({
      firstRun: true,
      since: '2026-12-11T09:00:00.000Z',
      beforeXp: 0,
      afterXp: 130,
      allKeys: ['team', 'first_stop'],
      added: [
        { key: 'team', trip_id: 't', unlocked_at: '2026-11-20T10:00:00.000Z' },
        { key: 'first_stop', trip_id: 't', unlocked_at: '2026-12-11T09:04:00.000Z' },
      ],
      now: NOW,
    });
    expect(plan.queue.map((c) => (c.kind === 'achievement' ? c.key : c.level))).toEqual([
      'first_stop',
    ]);
    expect(plan.summary).toEqual({ xp: 130, level: 1, keys: ['team'] });
  });

  it('sem nada, sem resumo', () => {
    const plan = planCelebrations({
      firstRun: true,
      since: NOW,
      beforeXp: 0,
      afterXp: 0,
      allKeys: [],
      added: [],
      now: NOW,
    });
    expect(plan.summary).toBeNull();
  });
});

describe('depois, cada conquista e cada nível entram na fila', () => {
  it('na ordem do fato, e um cartão de nível quando o nível sobe', () => {
    const plan = planCelebrations({
      firstRun: false,
      since: NOW,
      beforeXp: 140,
      afterXp: 165,
      allKeys: ['early_bird', 'first_stop'],
      added: [
        { key: 'early_bird', trip_id: 't', unlocked_at: '2026-12-11T09:50:00.000Z' },
        { key: 'first_stop', trip_id: 't', unlocked_at: '2026-12-11T09:40:00.000Z' },
      ],
      now: NOW,
    });
    expect(plan.summary).toBeNull();
    expect(plan.queue.map((c) => (c.kind === 'level' ? `level:${c.level}` : c.key))).toEqual([
      'first_stop',
      'early_bird',
      'level:2',
    ]);
  });

  it('a fila não repete o que já está nela (duas abas)', () => {
    const c = { kind: 'achievement' as const, key: 'team' as const, trip_id: 't', at: NOW };
    expect(mergeQueue([c], [c, { kind: 'level', level: 2, at: NOW }])).toHaveLength(2);
  });

  it('o cartão só sai num momento calmo', () => {
    expect(isCalm({ panelOn: false, sheetOpen: false })).toBe(true);
    expect(isCalm({ panelOn: true, sheetOpen: false })).toBe(false);
    expect(isCalm({ panelOn: false, sheetOpen: true })).toBe(false);
  });
});

describe('o texto do cartão', () => {
  it('conquista: o nome, o que foi feito e o acessório que ela libera', () => {
    expect(
      celebrationText({ kind: 'achievement', key: 'first_stop', trip_id: 't', at: NOW }),
    ).toEqual({
      eyebrow: 'Conquista',
      title: 'Primeiro pé na estrada',
      body: 'A primeira parada da viagem foi concluída.',
      unlock: 'Rack de teto',
    });
    expect(accessoryFor('team')).toBe('bike');
    expect(accessoryFor('coast')).toBe('board');
  });

  it('nível: o modelo novo, e no 5 o dourado', () => {
    expect(celebrationText({ kind: 'level', level: 2, at: NOW })).toMatchObject({
      title: 'Nível 2 · Viajante',
      body: 'O sedã está liberado na garagem.',
      unlock: 'O sedã',
    });
    expect(celebrationText({ kind: 'level', level: 5, at: NOW })).toMatchObject({
      title: 'Nível 5 · Lenda da Estrada',
      body: 'A kombi e o dourado estão liberados na garagem.',
    });
  });
});
