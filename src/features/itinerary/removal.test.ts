import { describe, expect, it } from 'vitest';
import { makeExpense, makeItem } from '@/test/factories.ts';
import { stopRemovalPlan } from './removal.ts';

describe('o que vai junto ao excluir uma parada', () => {
  it('a missão de sistema sai; a da pessoa e o gasto ficam, sem o vínculo', () => {
    const STOP = 'p1';
    const system = makeItem({ kind: 'quest', points: 20, stop_id: STOP, source: 'system' });
    const dismissed = makeItem({
      kind: 'quest',
      points: 20,
      stop_id: STOP,
      source: 'system',
      status: 'dismissed',
    });
    const mine = makeItem({ kind: 'quest', points: 10, stop_id: STOP, source: 'user' });
    const ai = makeItem({ kind: 'quest', points: 10, stop_id: STOP, source: 'ai' });
    const other = makeItem({ kind: 'quest', points: 10, stop_id: 'p2', source: 'system' });
    const gone = makeItem({
      kind: 'quest',
      points: 10,
      stop_id: STOP,
      deleted_at: '2026-12-01T10:00:00.000Z',
    });
    const lunch = makeExpense({ stop_id: STOP });
    const hotel = makeExpense({ stop_id: STOP, reservation_id: 'r1' });
    const elsewhere = makeExpense({ stop_id: 'p2' });

    expect(
      stopRemovalPlan(STOP, [system, dismissed, mine, ai, other, gone], [lunch, hotel, elsewhere]),
    ).toEqual({
      removeItems: [system.id, dismissed.id],
      unlinkItems: [mine.id, ai.id],
      // o gasto da reserva também perde a parada; continua ligado à reserva
      unlinkExpenses: [lunch.id, hotel.id],
    });
  });
});
