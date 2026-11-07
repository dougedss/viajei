import type { ImportReservation } from '@shared/import-schema.ts';
import { toE164 } from '@shared/phone.ts';
import type { Reservation, Stop, TripDay } from '@/lib/db/schema.ts';
import { localStampToISO } from '@/lib/time/index.ts';

/** As colunas de uma reserva que vêm do arquivo; id, viagem, autoria e carimbos são de quem grava. */
export type ImportedReservationRow = Omit<
  Reservation,
  'id' | 'trip_id' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at' | 'synced_at'
>;

/**
 * Uma reserva do schema de importação como colunas. Puro: a importação com IA e o carregador do
 * exemplo passam por aqui (`features/import/plan.ts`). `stop_ref` é o nome de uma parada e vence
 * (a parada já diz o dia); sem ela, `day_ref` é a data de um dia; os horários vêm em hora de parede
 * de São Paulo, sem fuso; o telefone vai para E.164 quando dá (senão fica de fora).
 */
export function reservationFromImport(
  r: ImportReservation,
  stops: readonly Pick<Stop, 'id' | 'name' | 'deleted_at'>[],
  days: readonly Pick<TripDay, 'id' | 'date' | 'deleted_at'>[],
): ImportedReservationRow {
  const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const stop = r.stop_ref
    ? stops.find((s) => s.deleted_at === null && norm(s.name) === norm(r.stop_ref ?? ''))
    : undefined;
  const day =
    !stop && r.day_ref
      ? days.find((d) => d.deleted_at === null && d.date === r.day_ref)
      : undefined;
  const phone = r.phone ? toE164(r.phone) : null;
  return {
    type: r.type,
    name: r.name.slice(0, 120),
    stop_id: stop?.id ?? null,
    trip_day_id: day?.id ?? null,
    start_at: r.start_at ? localStampToISO(r.start_at) : null,
    end_at: r.end_at ? localStampToISO(r.end_at) : null,
    confirmation_code: r.confirmation_code,
    amount: r.amount,
    cancel_policy: r.cancel_policy,
    cancel_until: r.cancel_until,
    phone: phone?.ok ? phone.e164 : null,
    address: r.address,
    booked_via: r.booked_via,
    notes: r.notes,
  };
}
