import { describe, expect, it } from 'vitest';
import { makeReservation } from '@/test/factories.ts';
import {
  EMPTY_RESERVATION,
  fromReservation,
  reservationFormSchema,
  toColumns,
  type ReservationFormInput,
} from './schemas.ts';

const parse = (over: Partial<ReservationFormInput>) =>
  reservationFormSchema.safeParse({ ...EMPTY_RESERVATION, name: 'Vila Suzana', ...over });

const errorsOf = (over: Partial<ReservationFormInput>) => {
  const r = parse(over);
  return r.success
    ? {}
    : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('formulário da reserva', () => {
  it('a reserva do Vila Suzana vira as colunas: hora de parede de São Paulo, E.164, reais', () => {
    const r = parse({
      start_date: '2026-12-13',
      start_time: '14:00',
      end_date: '2026-12-14',
      end_time: '12:00',
      link: 'stop:abc',
      confirmation_code: ' 4821-339 ',
      amount: '463,00',
      cancel_policy: 'Grátis até 08/12',
      cancel_until: '2026-12-08',
      phone: '(54) 3282-0000',
      booked_via: 'Booking',
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(toColumns(r.data)).toEqual({
      type: 'hotel',
      name: 'Vila Suzana',
      start_at: '2026-12-13T14:00:00-03:00',
      end_at: '2026-12-14T12:00:00-03:00',
      stop_id: 'abc',
      trip_day_id: null,
      confirmation_code: '4821-339',
      amount: 463,
      cancel_policy: 'Grátis até 08/12',
      cancel_until: '2026-12-08',
      phone: '+555432820000',
      address: null,
      booked_via: 'Booking',
      notes: null,
    });
  });

  it('ligada a um dia, ou a nada', () => {
    const r = parse({ link: 'day:dia-1' });
    expect(r.success && toColumns(r.data)).toMatchObject({ stop_id: null, trip_day_id: 'dia-1' });
    const none = parse({});
    expect(none.success && toColumns(none.data)).toMatchObject({
      stop_id: null,
      trip_day_id: null,
      start_at: null,
      end_at: null,
    });
  });

  it('data e hora andam juntas: nunca inventa horário', () => {
    expect(errorsOf({ start_date: '2026-12-13' })).toEqual({ start_time: 'Falta o horário.' });
    expect(errorsOf({ start_time: '14:00' })).toEqual({ start_date: 'Falta a data.' });
    expect(errorsOf({ end_date: '2026-12-14', end_time: '12:00' })).toMatchObject({
      start_date: 'Com fim, precisa do início.',
    });
  });

  it('fim antes do início, telefone sem DDD e valor estranho', () => {
    expect(
      errorsOf({
        start_date: '2026-12-14',
        start_time: '12:00',
        end_date: '2026-12-13',
        end_time: '14:00',
      }),
    ).toEqual({ end_date: 'O fim é antes do início.' });
    expect(errorsOf({ phone: '99752-7596' })).toEqual({ phone: 'Inclua o DDD: (51) 99752-7596.' });
    expect(errorsOf({ amount: 'muito' })).toEqual({ amount: 'Valor como 463 ou 463,00.' });
    expect(errorsOf({ name: '  ' })).toEqual({ name: 'Dê um nome para a reserva.' });
  });

  it('de volta ao formulário para editar', () => {
    const r = makeReservation({
      stop_id: 'abc',
      start_at: '2026-12-13T17:00:00Z',
      end_at: '2026-12-14T15:00:00Z',
      amount: 463,
      phone: '+555432820000',
      cancel_until: '2026-12-08',
    });
    expect(fromReservation(r)).toMatchObject({
      link: 'stop:abc',
      start_date: '2026-12-13',
      start_time: '14:00',
      end_date: '2026-12-14',
      end_time: '12:00',
      amount: '463,00',
      phone: '(54) 3282-0000',
      cancel_until: '2026-12-08',
    });
  });
});
