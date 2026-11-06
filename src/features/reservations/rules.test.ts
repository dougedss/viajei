import { describe, expect, it } from 'vitest';
import { DAY_ID, makeDay, makeReservation, makeStop } from '@/test/factories.ts';
import {
  asReservationType,
  cancelInfo,
  groupReservations,
  makeContext,
  policyAdds,
  nightsOf,
  reservationDate,
  reservationsForNow,
  timeLabel,
  whenLabel,
} from './rules.ts';

const day11 = makeDay();
const day13 = makeDay({ id: 'dia-13', date: '2026-12-13' });
const steffen = makeStop({ name: 'Hotel Steffen', time: '16:30:00' });
const suzana = makeStop({ name: 'Vila Suzana', trip_day_id: 'dia-13', time: '14:00:00' });
const ctx = makeContext([steffen, suzana], [day11, day13]);

describe('de que dia é a reserva', () => {
  it('a parada vence; depois o dia; depois a data do início (em São Paulo)', () => {
    expect(reservationDate(makeReservation({ stop_id: suzana.id }), ctx)).toBe('2026-12-13');
    expect(reservationDate(makeReservation({ trip_day_id: DAY_ID, start_at: null }), ctx)).toBe(
      '2026-12-11',
    );
    // 22:30 de São Paulo já é 01:30 UTC do dia seguinte: o dia é o de São Paulo
    expect(
      reservationDate(makeReservation({ start_at: '2026-12-14T01:30:00Z', end_at: null }), ctx),
    ).toBe('2026-12-13');
    expect(reservationDate(makeReservation({ start_at: null, end_at: null }), ctx)).toBeNull();
  });

  it('agrupa por dia, em ordem de hora, e as sem dia por último', () => {
    const groups = groupReservations(
      [
        makeReservation({ id: 'r-sem', name: 'Ingresso', start_at: null, end_at: null }),
        makeReservation({ id: 'r-suz', name: 'Vila Suzana', stop_id: suzana.id }),
        makeReservation({
          id: 'r-jantar',
          name: 'Jantar',
          type: 'restaurant',
          start_at: '2026-12-11T19:00:00-03:00',
          end_at: null,
        }),
        makeReservation({
          id: 'r-ste',
          name: 'Steffen',
          stop_id: steffen.id,
          start_at: '2026-12-11T16:30:00-03:00',
          end_at: '2026-12-13T07:00:00-03:00',
        }),
        makeReservation({ id: 'r-apagada', deleted_at: '2026-12-01T00:00:00Z' }),
      ],
      ctx,
    );
    expect(groups.map((g) => [g.date, g.items.map((r) => r.id)])).toEqual([
      ['2026-12-11', ['r-ste', 'r-jantar']],
      ['2026-12-13', ['r-suz']],
      [null, ['r-sem']],
    ]);
  });
});

describe('o horário dito', () => {
  const steffenR = makeReservation({
    start_at: '2026-12-11T16:30:00-03:00',
    end_at: '2026-12-13T07:00:00-03:00',
  });

  it('noites de hospedagem pelas datas de parede', () => {
    expect(nightsOf(steffenR)).toBe(2);
    expect(nightsOf({ ...steffenR, type: 'restaurant' })).toBeNull();
    expect(nightsOf({ ...steffenR, end_at: null })).toBeNull();
  });

  it('na lista e na folha', () => {
    expect(timeLabel(steffenR)).toBe('16:30 → dom 13/12 07:00 · 2 noites');
    expect(
      timeLabel(
        makeReservation({
          type: 'restaurant',
          start_at: '2026-12-11T19:00:00-03:00',
          end_at: '2026-12-11T22:00:00-03:00',
        }),
      ),
    ).toBe('19:00 → 22:00');
    expect(timeLabel(makeReservation({ start_at: null, end_at: null }))).toBe('');
    expect(whenLabel(steffenR)).toBe('Check-in sex 11/12 16:30 · saída dom 13/12 07:00');
    expect(
      whenLabel(
        makeReservation({
          type: 'ticket',
          start_at: '2026-12-14T09:00:00-03:00',
          end_at: '2026-12-14T11:00:00-03:00',
        }),
      ),
    ).toBe('Início seg 14/12 09:00 · fim 11:00');
  });

  it('tipo estranho vira "outro"', () => {
    expect(asReservationType('flight')).toBe('other');
    expect(asReservationType('hotel')).toBe('hotel');
  });
});

describe('prazo de cancelamento', () => {
  it('perto, longe e passado', () => {
    const r = makeReservation({ cancel_until: '2026-12-08' });
    expect(cancelInfo(r, '2026-12-01')).toEqual({
      label: 'Cancelamento grátis até 08/12',
      soon: false,
      past: false,
    });
    expect(cancelInfo(r, '2026-12-06')?.soon).toBe(true);
    expect(cancelInfo(r, '2026-12-08')?.soon).toBe(true);
    expect(cancelInfo(r, '2026-12-09')).toEqual({
      label: 'Prazo de cancelamento passou (08/12)',
      soon: false,
      past: true,
    });
    expect(cancelInfo(makeReservation(), '2026-12-01')).toBeNull();
  });
});

describe('a política de cancelamento na folha', () => {
  it('não repete o que a data limite já diz', () => {
    expect(policyAdds('Cancelamento grátis até 08/12.', 'Cancelamento grátis até 08/12')).toBe(
      false,
    );
    expect(policyAdds('Grátis até 08/12, depois 1 diária', 'Cancelamento grátis até 08/12')).toBe(
      true,
    );
    expect(policyAdds(null, 'Cancelamento grátis até 08/12')).toBe(false);
  });
});

describe('o "Ver reserva" no balcão', () => {
  const rSteffen = makeReservation({
    id: 'ste',
    stop_id: steffen.id,
    start_at: '2026-12-11T16:30:00-03:00',
    end_at: '2026-12-13T07:00:00-03:00',
  });
  const rSuzana = makeReservation({ id: 'suz', stop_id: suzana.id });

  it('a da próxima parada primeiro, depois a da atual', () => {
    const now = new Date('2026-12-11T15:00:00-03:00');
    expect(
      reservationsForNow({ at: suzana, next: steffen }, [rSuzana, rSteffen], now).map((r) => r.id),
    ).toEqual(['ste', 'suz']);
  });

  it('a hospedagem em curso aparece no check-out, mesmo sem a parada no dia', () => {
    const checkout = new Date('2026-12-13T06:30:00-03:00');
    expect(
      reservationsForNow({ at: null, next: null }, [rSteffen], checkout).map((r) => r.id),
    ).toEqual(['ste']);
    const depois = new Date('2026-12-13T08:00:00-03:00');
    expect(reservationsForNow({ at: null, next: null }, [rSteffen], depois)).toEqual([]);
  });

  it('reserva apagada não aparece', () => {
    expect(
      reservationsForNow(
        { at: null, next: steffen },
        [{ ...rSteffen, deleted_at: '2026-12-01T00:00:00Z' }],
        new Date('2026-12-11T15:00:00-03:00'),
      ),
    ).toEqual([]);
  });
});
