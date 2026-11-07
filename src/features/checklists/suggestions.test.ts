import { describe, expect, it } from 'vitest';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { DAY_ID, makeItem, makeStop, TRIP_ID } from '@/test/factories.ts';
import {
  packCandidates,
  pendingSuggestions,
  questCandidates,
  questId,
  QUEST_RULES,
} from './suggestions.ts';

const dayIndex = new Map([[DAY_ID, 1]]);

describe('missões por tipo de parada', () => {
  it('uma por parada, pela regra do tipo; origem, deslocamento e hotel não ganham', () => {
    const stops = [
      makeStop({ kind: 'origin' }),
      makeStop({ kind: 'nature', name: 'Cascata do Caracol' }),
      makeStop({ kind: 'winery', name: 'Casa Valduga' }),
      makeStop({ kind: 'food' }),
      makeStop({ kind: 'city' }),
      makeStop({ kind: 'event' }),
      makeStop({ kind: 'hotel' }),
      makeStop({ kind: 'transit' }),
    ];
    const found = questCandidates(stops, []);
    expect(found.map((c) => [c.stop.kind, c.rule.text, c.rule.points])).toEqual([
      ['nature', 'Foto do time com a paisagem', 20],
      ['winery', 'Registrar o rótulo preferido, com foto', 20],
      ['food', 'Provar o prato da casa', 15],
      ['city', 'Um cartão-postal na foto', 15],
      ['event', 'A foto do momento', 10],
    ]);
  });

  it('nenhuma missão premia velocidade ou consumo: vinícola é rótulo e foto', () => {
    for (const rule of Object.values(QUEST_RULES)) {
      expect(rule.points).toBeGreaterThanOrEqual(10);
      expect(rule.points).toBeLessThanOrEqual(30);
      expect(rule.text).not.toMatch(/beber|tomar|degust|rápid|corr|primeiro/i);
    }
    expect(QUEST_RULES.winery?.text).toMatch(/rótulo/);
  });

  it('parada com missão viva (de qualquer origem), concluída, pulada ou excluída não ganha sugestão', () => {
    const withQuest = makeStop({ kind: 'nature' });
    const done = makeStop({ kind: 'nature', done_at: '2026-12-11T13:30:00.000Z' });
    const skipped = makeStop({ kind: 'nature', skipped: true });
    const gone = makeStop({ kind: 'nature', deleted_at: '2026-12-01T10:00:00.000Z' });
    const free = makeStop({ kind: 'nature' });
    const items = [makeItem({ kind: 'quest', points: 10, stop_id: withQuest.id })];
    expect(
      questCandidates([withQuest, done, skipped, gone, free], items).map((c) => c.stop.id),
    ).toEqual([free.id]);
  });

  it('o id é v5(stop_id, "quest:" + regra), o mesmo que o banco calcula', async () => {
    const stop = makeStop({ kind: 'nature' });
    expect(await questId(stop.id, 'nature')).toBe(await uuidV5(stop.id, 'quest:nature'));
  });
});

describe('mala pela geografia do dia', () => {
  it('praia pede protetor e roupa de banho; serra, blusa e calçado; natureza, repelente', () => {
    const found = packCandidates(
      [
        { dayIndex: 1, kinds: ['field', 'serra'] },
        { dayIndex: 2, kinds: ['beach'] },
      ],
      [makeStop({ kind: 'nature' })],
      [],
    );
    expect(found.map((c) => [c.rule.text, c.reason])).toEqual([
      ['Protetor solar', 'praia no dia 2'],
      ['Roupa de banho', 'praia no dia 2'],
      ['Blusa', 'serra no dia 1'],
      ['Calçado com aderência', 'serra no dia 1'],
      ['Repelente', 'tem parada de natureza'],
    ]);
  });

  it('o que a pessoa já escreveu segura a sugestão ("Blusa fina" cobre "Blusa"), sem acento', () => {
    const items = [
      makeItem({ kind: 'pack', text: 'Blusa fina' }),
      makeItem({ kind: 'pack', text: 'calcado com aderencia' }),
      // um item de "antes" não cobre a mala
      makeItem({ kind: 'before', text: 'Comprar repelente' }),
    ];
    const found = packCandidates(
      [{ dayIndex: 1, kinds: ['serra'] }],
      [makeStop({ kind: 'nature' })],
      items,
    );
    expect(found.map((c) => c.rule.text)).toEqual(['Repelente']);
  });

  it('sem rota guardada não há geografia, e nada é inventado', () => {
    expect(packCandidates([], [makeStop({ kind: 'city' })], [])).toEqual([]);
  });
});

describe('o que aparece', () => {
  it('a dispensada não volta; a adicionada vira item; o desfazer devolve como sugestão', async () => {
    const nature = makeStop({ kind: 'nature', name: 'Cascata' });
    const food = makeStop({ kind: 'food', name: 'Bifes' });
    const stops = [nature, food];
    const scenery = [{ dayIndex: 1, kinds: ['serra'] as const }];
    const base = { tripId: TRIP_ID, stops, scenery, dayIndex };

    const all = await pendingSuggestions({ ...base, items: [] });
    expect(all.map((s) => s.text)).toEqual([
      'Foto do time com a paisagem',
      'Provar o prato da casa',
      'Blusa',
      'Calçado com aderência',
      'Repelente',
    ]);
    expect(all[0]?.reason).toBe('dia 1 · Cascata');

    const natureId = await uuidV5(nature.id, 'quest:nature');
    const repellentId = await uuidV5(TRIP_ID, 'pack:repellent');
    const answered = [
      makeItem({ id: natureId, kind: 'quest', points: 20, stop_id: nature.id, source: 'system' }),
      makeItem({
        id: repellentId,
        kind: 'pack',
        text: 'Repelente',
        source: 'system',
        status: 'dismissed',
      }),
    ];
    const after = await pendingSuggestions({ ...base, items: answered });
    expect(after.map((s) => s.text)).toEqual([
      'Provar o prato da casa',
      'Blusa',
      'Calçado com aderência',
    ]);

    // desfazer o "Dispensar" devolve a linha como `suggested`: ela volta a aparecer
    const undone = answered.map((i) => (i.id === repellentId ? { ...i, status: 'suggested' } : i));
    const back = await pendingSuggestions({ ...base, items: undone });
    expect(back.map((s) => s.id)).toContain(repellentId);
    expect(back.filter((s) => s.id === repellentId)).toHaveLength(1);
  });
});
