import { describe, expect, it } from 'vitest';
import { makeExpense, makeReservation, makeStop, makeTrip } from '@/test/factories.ts';
import {
  budget,
  categoryBars,
  categoryForReservation,
  categoryForStop,
  expenseDefaults,
  formatMoneyShort,
  groupByDay,
  percent,
  reservationExpenseDate,
  totals,
} from './rules.ts';

describe('totais', () => {
  it('somam em centavos (0,1 + 0,2 dá 0,30, não 0,30000000000000004) e por categoria', () => {
    const t = totals([
      makeExpense({ amount: 0.1, category: 'food' }),
      makeExpense({ amount: 0.2, category: 'food' }),
      makeExpense({ amount: 560, category: 'lodging' }),
      makeExpense({ amount: 99, category: 'fuel', deleted_at: '2026-12-11T10:00:00.000Z' }),
      makeExpense({ amount: 5, category: 'desconhecida' }),
    ]);
    expect(t.total).toBe(56530);
    expect(t.byCategory).toEqual({ lodging: 56000, fuel: 0, food: 30, attractions: 0, other: 500 });
    expect(categoryBars(t).map((b) => [b.category, b.cents])).toEqual([
      ['lodging', 56000],
      ['other', 500],
      ['food', 30],
    ]);
    // o Intl separa o símbolo com espaço inseparável
    expect(formatMoneyShort(t.total).replace(/\s/g, ' ')).toBe('R$ 565');
    expect(formatMoneyShort(0).replace(/\s/g, ' ')).toBe('R$ 0');
  });
});

describe('a barra do orçamento', () => {
  it('verde até 80%, âmbar até 100%, vermelha acima; o texto diz quanto falta ou passou', () => {
    expect(budget(80000, 1000)).toEqual({ state: 'on-time', ratio: 0.8, leftCents: 20000 });
    expect(budget(80001, 1000)?.state).toBe('tight');
    expect(budget(100000, 1000)?.state).toBe('tight');
    expect(budget(100001, 1000)?.state).toBe('late');
    expect(budget(120000, 1000)?.leftCents).toBe(-20000);
    expect(budget(100, null)).toBeNull();
    expect(budget(100, 0)).toBeNull();
    expect(percent(0.857)).toBe('85%');
    expect(percent(0.996)).toBe('99%');
    expect(percent(1.2)).toBe('120%');
  });
});

describe('categoria', () => {
  it('pelo tipo da parada, como o prompt diz', () => {
    expect(categoryForStop('food')).toBe('food');
    expect(categoryForStop('hotel')).toBe('lodging');
    for (const k of ['nature', 'winery', 'event', 'city']) {
      expect(categoryForStop(k)).toBe('attractions');
    }
    expect(categoryForStop('origin')).toBe('fuel');
    expect(categoryForStop('transit')).toBe('fuel');
    expect(categoryForStop('other')).toBe('other');
    expect(categoryForStop('xyz')).toBe('other');
  });

  it('pelo tipo da reserva', () => {
    expect(categoryForReservation('hotel')).toBe('lodging');
    expect(categoryForReservation('ticket')).toBe('attractions');
    expect(categoryForReservation('restaurant')).toBe('food');
    expect(categoryForReservation('other')).toBe('other');
  });
});

describe('o "+ Gasto" do Modo Viagem', () => {
  it('parado numa parada: ela e a categoria dela; na estrada: combustível, sem parada', () => {
    const park = makeStop({ kind: 'nature', done_at: '2026-12-11T13:30:00.000Z' });
    expect(expenseDefaults({ at: park, onRoad: false, next: null })).toEqual({
      stop_id: park.id,
      category: 'attractions',
    });
    expect(expenseDefaults({ at: park, onRoad: true, next: null })).toEqual({
      stop_id: null,
      category: 'fuel',
    });
  });

  it('antes de sair de casa: combustível; nó de saída concluído é estrada', () => {
    const origin = makeStop({ kind: 'origin' });
    expect(expenseDefaults({ at: null, onRoad: false, next: origin })).toEqual({
      stop_id: null,
      category: 'fuel',
    });
    expect(expenseDefaults({ at: origin, onRoad: false, next: null }).category).toBe('fuel');
    expect(expenseDefaults({ at: null, onRoad: false, next: makeStop({ kind: 'food' }) })).toEqual({
      stop_id: null,
      category: 'other',
    });
  });
});

describe('por dia', () => {
  it('na ordem da viagem, o mais recente primeiro; fora do período num grupo no fim', () => {
    const trip = makeTrip();
    const a = makeExpense({ date: '2026-12-12', created_at: '2026-12-12T10:00:00.000Z' });
    const b = makeExpense({ date: '2026-12-11', created_at: '2026-12-11T09:00:00.000Z' });
    const c = makeExpense({
      date: '2026-12-11',
      created_at: '2026-12-11T20:00:00.000Z',
      amount: 30,
    });
    const out = makeExpense({ date: '2026-12-20' });
    const groups = groupByDay([a, b, c, out], trip);
    expect(groups.map((g) => [g.date, g.items.map((e) => e.id), g.cents])).toEqual([
      ['2026-12-11', [c.id, b.id], 13000],
      ['2026-12-12', [a.id], 10000],
      [null, [out.id], 10000],
    ]);
  });
});

describe('o gasto de uma reserva', () => {
  it('a data do check-in em São Paulo, presa à viagem; sem horário, o dia da parada', () => {
    const trip = makeTrip();
    const stop = makeStop({ trip_day_id: 'dia-13' });
    const days = [{ id: 'dia-13', date: '2026-12-13' }];
    expect(
      reservationExpenseDate(
        makeReservation({ start_at: '2026-12-11T19:30:00.000Z' }),
        [stop],
        days,
        trip,
      ),
    ).toBe('2026-12-11');
    // 01:30 UTC do dia 12 ainda é dia 11 em São Paulo
    expect(
      reservationExpenseDate(
        makeReservation({ start_at: '2026-12-12T01:30:00.000Z' }),
        [],
        days,
        trip,
      ),
    ).toBe('2026-12-11');
    expect(
      reservationExpenseDate(
        makeReservation({ start_at: '2026-11-30T12:00:00.000Z' }),
        [],
        days,
        trip,
      ),
    ).toBe('2026-12-11');
    expect(
      reservationExpenseDate(
        makeReservation({ start_at: null, stop_id: stop.id, trip_day_id: null }),
        [stop],
        days,
        trip,
      ),
    ).toBe('2026-12-13');
    expect(
      reservationExpenseDate(
        makeReservation({ start_at: null, stop_id: null, trip_day_id: null }),
        [],
        days,
        trip,
      ),
    ).toBe('2026-12-11');
  });
});
