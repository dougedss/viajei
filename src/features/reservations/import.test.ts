import { describe, expect, it } from 'vitest';
import { validateImport } from '@shared/import-schema.ts';
import raw from '../../../supabase/seed/viagem-rs.json';
import { reservationFromImport } from './import.ts';

const data = validateImport(raw);
const days = data.days.map((d) => ({ id: `dia-${d.date}`, date: d.date, deleted_at: null }));
const stops = data.days.flatMap((d) =>
  d.stops.map((s, i) => ({ id: `${d.date}-${i}`, name: s.name, deleted_at: null })),
);

describe('as hospedagens do exemplo, do arquivo de importação para as colunas', () => {
  it('o Hotel Steffen vai para a parada dele, com os horários de São Paulo e o telefone', () => {
    const steffen = data.reservations.find((r) => r.name === 'Hotel Steffen');
    if (!steffen) throw new Error('seed sem o Hotel Steffen');
    const row = reservationFromImport(steffen, stops, days);
    expect(row).toMatchObject({
      type: 'hotel',
      stop_id: stops.find((s) => s.name === 'Hotel Steffen')?.id,
      trip_day_id: null,
      start_at: '2026-12-11T16:30:00-03:00',
      end_at: '2026-12-13T07:00:00-03:00',
      amount: 560,
      phone: '+5551997527596',
      booked_via: 'WhatsApp',
      cancel_until: null,
    });
  });

  it('o Vila Suzana leva o prazo de cancelamento (o aviso chega em 07/12 às 10h)', () => {
    const suzana = data.reservations.find((r) => r.name === 'Vila Suzana Parque Hotel');
    if (!suzana) throw new Error('seed sem o Vila Suzana');
    expect(reservationFromImport(suzana, stops, days)).toMatchObject({
      stop_id: stops.find((s) => s.name === 'Vila Suzana Parque Hotel')?.id,
      cancel_until: '2026-12-08',
      start_at: '2026-12-13T14:00:00-03:00',
      end_at: '2026-12-14T12:00:00-03:00',
      phone: null,
    });
  });

  it('sem a parada, cai no dia; sem os dois, fica sem vínculo', () => {
    const suzana = data.reservations[1];
    if (!suzana) throw new Error('seed sem reservas');
    expect(reservationFromImport(suzana, [], days)).toMatchObject({
      stop_id: null,
      trip_day_id: 'dia-2026-12-13',
    });
    expect(reservationFromImport({ ...suzana, day_ref: null }, [], days)).toMatchObject({
      stop_id: null,
      trip_day_id: null,
    });
  });
});
